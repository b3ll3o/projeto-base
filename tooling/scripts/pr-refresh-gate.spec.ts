import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MARCADOR } from './pr-refresh-apply';
import { lerCorpo, verificarMarcador } from './pr-refresh-gate';
import type { ClaimVerificada, Relatorio } from './pr-refresh-scan';

/** Claim verificada com os campos que o gate lê: `linha` e `divergente`. */
function claim(linha: number, divergente: boolean, classe = 'commits'): ClaimVerificada {
  return {
    classe: classe as ClaimVerificada['classe'],
    valor: 10,
    declarado: '10 commits',
    linha,
    ini: 0,
    fim: 2,
    palavra: { ini: 3, fim: 10, texto: classe },
    medido: divergente ? 40 : 10,
    divergente,
  };
}

function relatorio(claims: ClaimVerificada[]): Relatorio {
  return { base: 'origin/main', claims, resumo: 'teste' };
}

/**
 * Corpo com 4 parágrafos separados por linha em branco. A claim fica no
 * parágrafo 1 (linhas 1-2) ou no 3 (linhas 5-6).
 */
const CORPO_SEM_MARCADOR = ['linha 1', 'linha 2', '', 'linha 4', 'linha 5', 'linha 6'].join('\n');
const CORPO_COM_MARCADOR = [
  'linha 1',
  `linha 2 ${MARCADOR}`,
  '',
  'linha 4',
  'linha 5',
  'linha 6',
].join('\n');
/** Marcador num parágrafo que NÃO é o da claim — não pode valer. */
const CORPO_MARCADO_OUTRO_PARAGRAFO = [
  'linha 1',
  'linha 2',
  '',
  'linha 4',
  `linha 5 ${MARCADOR}`,
  'linha 6',
].join('\n');

describe('verificarMarcador', () => {
  it('verde quando não há claim divergente', () => {
    // O gate vigia a divergência, não a ausência de marcador: um PR sem
    // claims numericas não tem nada a atualizar.
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, false)]));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('verde quando não há claim nenhuma', () => {
    expect(verificarMarcador(CORPO_SEM_MARCADOR, relatorio([])).ok).toBe(true);
  });

  it('vermelho quando a claim divergente está num parágrafo sem marcador', () => {
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, true)]));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('pr-refresh:live');
  });

  it('verde quando a claim divergente está num parágrafo marcado', () => {
    const r = verificarMarcador(CORPO_COM_MARCADOR, relatorio([claim(1, true)]));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('acusa só a claim divergente NÃO marcada, e nomeia a linha dela', () => {
    // Duas divergentes, uma no parágrafo 1 (sem marcador) e outra no 3 (com).
    const r = verificarMarcador(
      CORPO_MARCADO_OUTRO_PARAGRAFO,
      relatorio([claim(1, true, 'commits'), claim(5, true, 'arquivos')]),
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    // Formato `L7` — o mesmo que a saída do scanner usa (`DIVERGE  L7 commits`).
    expect(r.errors[0]).toContain('L1');
    expect(r.errors[0]).not.toContain('L5');
  });

  it('NÃO aceita marcador em OUTRO parágrafo como se cobrisse a claim', () => {
    // O escopo do marcador é o PARÁGRAFO (contrato de `linhasVivas`), não o
    // corpo. Um gate que só contasse "o corpo tem marcador?" passaria aqui.
    const r = verificarMarcador(CORPO_MARCADO_OUTRO_PARAGRAFO, relatorio([claim(1, true)]));
    expect(r.ok).toBe(false);
  });

  it('NÃO acusa claim não-divergente que esteja sem marcador', () => {
    // Contra-regra: sem isto o gate ensinaria a marcar o corpo inteiro, e o
    // marcador deixaria de significar "aqui a contagem é viva".
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, false), claim(5, true)]));
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('L5');
  });

  it('a mensagem diz o que fazer, não só que falhou', () => {
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, true)]));
    const msg = r.errors.join('\n');
    expect(msg).toMatch(/pnpm pr:refresh/);
    expect(msg).toContain('L1');
  });

  it('cita a base medida, para o autor conferir contra o próprio git', () => {
    const r = verificarMarcador(CORPO_SEM_MARCADOR, relatorio([claim(1, true)]));
    expect(r.errors.join('\n')).toContain('origin/main');
  });

  it('o marcador que o gate exige é o mesmo que o apply escreve', () => {
    // Duas strings distintas no mesmo código = o gate exigindo um token
    // que o apply nunca procura.
    const r = verificarMarcador(`linha 1 ${MARCADOR}`, relatorio([claim(1, true)]));
    expect(r.ok).toBe(true);
  });
});

describe('lerCorpo', () => {
  const envOriginal = process.env.PR_BODY_FILE;
  afterEach(() => {
    if (envOriginal === undefined) delete process.env.PR_BODY_FILE;
    else process.env.PR_BODY_FILE = envOriginal;
  });

  it('prefere o arquivo do payload do evento ao `gh`', () => {
    // No CI o corpo já vem no payload de `pull_request`; lê-lo de lá dispensa
    // conceder `pull-requests: read` ao token. Passar pelo `gh` seria trocar
    // uma permissão por uma chamada de rede sem ganho.
    const dir = mkdtempSync(join(tmpdir(), 'pr-body-'));
    const arquivo = join(dir, 'body.md');
    writeFileSync(arquivo, 'corpo do payload\n');
    process.env.PR_BODY_FILE = arquivo;
    expect(lerCorpo('org/repo', '999')).toBe('corpo do payload\n');
  });

  it('devolve null quando o arquivo do payload não existe', () => {
    // `null` = "não li", e o CLI trata isso como pulado (nunca verde).
    process.env.PR_BODY_FILE = join(tmpdir(), 'nao-existe-pr-body.md');
    expect(lerCorpo('org/repo', '999')).toBeNull();
  });

  it('sem arquivo e sem repo, devolve null em vez de chamar `gh` de vazio', () => {
    delete process.env.PR_BODY_FILE;
    expect(lerCorpo('', undefined)).toBeNull();
  });
});
