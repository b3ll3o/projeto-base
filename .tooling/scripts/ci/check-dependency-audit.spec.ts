import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARQUIVO_DE_EXCECOES,
  carregarExcecoes,
  checkDependencyAudit,
  extrairAdvisories,
  auditoriaDeErro,
  SEVERIDADES_QUE_REPROVAM,
  verificarExcecao,
  type ArquivoDeExcecoes,
  type Excecao,
} from './check-dependency-audit';

/** A raiz do repo — o vitest roda com o cwd na raiz (o `--root` é da suite). */
const REPO = process.cwd();

/** Um repo mínimo, com a lista de exceções versionada. */
function repoCom(lista: ArquivoDeExcecoes): string {
  const root = mkdtempSync(join(tmpdir(), 'dep-audit-'));
  mkdirSync(join(root, '.tooling/scripts/ci'), { recursive: true });
  writeFileSync(join(root, ARQUIVO_DE_EXCECOES), JSON.stringify(lista, null, 2), 'utf-8');
  return root;
}

/** Um `pnpm audit --json` sintético, no formato real (o id é a chave). */
function auditoriaFake(advisories: Record<string, Record<string, unknown>>): string {
  return JSON.stringify({ advisories, metadata: { vulnerabilities: {} } });
}

const ADVISORY_CRITICA = {
  module_name: 'next',
  severity: 'critical',
  title: 'RCE na otimização de imagem',
  vulnerable_versions: '>=10.0.0 <=15.5.27',
  patched_versions: '>=15.5.28',
  findings: [{ versions: ['15.5.25'], paths: ['apps/web > next@15.5.25'] }],
};

const ADVISORY_MODERADA = {
  module_name: 'algo',
  severity: 'moderate',
  title: 'algo moderado',
  vulnerable_versions: '<1.0.0',
  patched_versions: '>=1.0.0',
  findings: [{ versions: ['0.9.0'], paths: ['x > algo@0.9.0'] }],
};

/** A exceção do vitest, que existe de verdade na lista versionada. */
function excecaoDoVitest(): Excecao {
  return {
    id: '1139528',
    modulo: 'vitest',
    severidade: 'critical',
    motivo: 'o UI server nunca é iniciado',
    verificacao: {
      tipo: 'ausencia',
      padrao: 'NadaDissoExisteEm lugar nenhum',
      caminhos: ['apps'],
    },
  };
}

describe('a extração das advisories', () => {
  it('o id da advisory é a CHAVE do objeto (o pnpm não tem campo "id")', () => {
    // MEDIDO em 2026-11-03: o `pnpm audit --json` traz
    // `{ advisories: { <id>: {...} } }` — o id é a chave. Ler `advisory.id`
    // daria undefined e nenhuma advisory casaria com a lista de exceções.
    const achadas = extrairAdvisories(auditoriaFake({ '1242817': ADVISORY_CRITICA }));
    expect(achadas).toHaveLength(1);
    expect(achadas[0]!.id).toBe('1242817');
    expect(achadas[0]!.modulo).toBe('next');
    expect(achadas[0]!.severidade).toBe('critical');
    expect(achadas[0]!.versoesAfetadas).toEqual(['15.5.25']);
  });

  it('JSON inválido não derruba o gate', () => {
    expect(extrairAdvisories('isto nao e json')).toEqual([]);
  });

  it('o `pnpm audit` sai com código 1 quando acha advisory — e o JSON vem na exceção', () => {
    // MEDIDO em 2026-11-03: o primeiro teste do gate no repo real disse "a
    // auditoria NÃO RODOU" com 4 advisories encontradas. O `pnpm audit` sai
    // com código 1 quando ENCONTRA vulnerabilidade, e o `execFileSync` joga o
    // stdout dentro da exceção.
    const auditoria = auditoriaFake({ '1242817': ADVISORY_CRITICA });
    const erro = Object.assign(new Error('Command failed: pnpm audit --json'), {
      stdout: auditoria,
    });
    expect(auditoriaDeErro(erro)).toBe(auditoria);
    expect(extrairAdvisories(auditoriaDeErro(erro)!)[0]!.id).toBe('1242817');
  });

  it('uma falha SEM JSON é "não rodou", não "não achou advisory"', () => {
    expect(auditoriaDeErro(new Error('sem rede'))).toBeNull();
    expect(auditoriaDeErro({ stdout: 'nao e json' })).toBeNull();
  });
});

describe('o gate, com auditoria sintética', () => {
  it('FALHA quando há advisory crítica sem exceção declarada', () => {
    const root = repoCom({ excecoes: [] });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({ '1242817': ADVISORY_CRITICA }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/1242817/);
    expect(r.errors.join('\n')).toMatch(/next/);
  });

  it('PASSA quando a advisory moderada está lá (só crítica e alta reprovam)', () => {
    const root = repoCom({ excecoes: [] });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({ '1111111': ADVISORY_MODERADA }),
    });
    expect(r.ok).toBe(true);
  });

  it('PASSA quando a crítica tem exceção declarada E a verificação ainda vale', () => {
    const root = repoCom({ excecoes: [excecaoDoVitest()] });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({
        '1139528': { ...ADVISORY_CRITICA, module_name: 'vitest' },
      }),
    });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('FALHA quando a exceção existe mas a verificação parou de valer', () => {
    // A verificação de uma exceção é a AUSÊNCIA de um padrão. Quando o padrão
    // aparece, o motivo medido deixou de ser verdade — e a exceção é
    // reprovada. É o que impede a exceção de virar dívida silenciosa.
    const root = repoCom({ excecoes: [] });
    mkdirSync(join(root, 'apps'), { recursive: true });
    writeFileSync(
      join(root, 'apps/arquivo.ts'),
      'const x = 1; // NadaDissoExisteEm lugar nenhum\n',
    );
    const excecao = excecaoDoVitest();
    const problema = verificarExcecao(root, excecao);
    expect(problema).not.toBeNull();
    expect(problema).toMatch(/parou de valer/);
  });

  it('FALHA quando a exceção declara uma severidade que não é a da advisory', () => {
    // MEDIDO em 2026-11-03 (revisão do PR #143): os campos `severidade` e
    // `modulo` da exceção eram DECORATIVOS — o gate usava a severidade da
    // advisory e ignorava a declarada. Quem mudasse "critical" para "low"
    // no arquivo acharia que rebaixou a exceção; não rebaixou nada.
    const excecao = excecaoDoVitest();
    const root = repoCom({
      excecoes: [{ ...excecao, severidade: 'low' }],
    });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({
        '1139528': { ...ADVISORY_CRITICA, module_name: 'vitest', severity: 'critical' },
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/severidade "low"/);
  });

  it('FALHA quando a exceção declara um módulo que não é o da advisory', () => {
    const excecao = excecaoDoVitest();
    const root = repoCom({
      excecoes: [{ ...excecao, modulo: 'outro-pacote' }],
    });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({
        '1139528': { ...ADVISORY_CRITICA, module_name: 'vitest', severity: 'critical' },
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/módulo "outro-pacote"/);
  });

  it('AVISA quando uma exceção da lista não casa com nenhuma advisory', () => {
    // A lista não pode encolher nem sobrar em silêncio.
    const root = repoCom({ excecoes: [excecaoDoVitest()] });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({ '1111111': ADVISORY_MODERADA }),
    });
    expect(r.ok).toBe(true);
    expect(r.advisories.join('\n')).toMatch(/não casa com nenhuma advisory/);
  });
});

describe('a lista de exceções versionada (o repo real)', () => {
  it('a lista existe no caminho declarado pelo gate', () => {
    const lista = carregarExcecoes(REPO);
    expect(lista.excecoes.length).toBeGreaterThan(0);
    expect(ARQUIVO_DE_EXCECOES).toBe('.tooling/scripts/ci/excecoes-de-dependencias.json');
  });

  it('toda exceção declara motivo (com data) e verificação', () => {
    const lista = carregarExcecoes(REPO);
    for (const e of lista.excecoes) {
      expect(e.motivo.length).toBeGreaterThan(40);
      expect(e.motivo).toMatch(/MEDIDO/);
      expect(e.verificacao.tipo).toBe('ausencia');
      expect(e.verificacao.caminhos.length).toBeGreaterThan(0);
    }
  });

  it('a verificação do zod olha o web INTEIRO (não só `app/`)', () => {
    // MEDIDO em 2026-11-03 (revisão do PR #143): a verificação cobria
    // `apps/web/app` — e `apps/web/src`, `apps/web/lib` e
    // `apps/web/components` ficavam de fora. Um `z.array(` em qualquer um
    // deles escapava da verificação, e a exceção continuaria valendo com a
    // exposição de verdade.
    const lista = carregarExcecoes(REPO);
    const zod = lista.excecoes.find((e) => e.modulo === 'zod');
    expect(zod).toBeDefined();
    expect(zod!.verificacao.caminhos).toContain('apps/web');
    expect(zod!.verificacao.caminhos).not.toContain('apps/web/app');
  });

  it('as verificações das exceções VALEM hoje no repo real', () => {
    // A afirmação é o contrário da exceção: o motivo continua valendo.
    const lista = carregarExcecoes(REPO);
    for (const e of lista.excecoes) {
      expect(verificarExcecao(REPO, e)).toBeNull();
    }
  });

  it('a severidade que reprova mora no CÓDIGO — o arquivo de dados não pode enfraquecer o gate', () => {
    // MEDIDO em 2026-11-03 (revisão do PR #143): a lista vinha do JSON, e
    // quem editasse o arquivo trocando `["critical", "high"]` por `[]`
    // zerava a reprovação. A regra mora no gate; o arquivo é só DADO.
    expect(SEVERIDADES_QUE_REPROVAM).toContain('critical');
    expect(SEVERIDADES_QUE_REPROVAM).toContain('high');
    const cru = readFileSync(join(REPO, ARQUIVO_DE_EXCECOES), 'utf-8');
    expect(cru).not.toMatch(/severidadesQueReprovam/);
  });

  it('o arquivo é JSON válido e tem a forma declarada', () => {
    const cru = readFileSync(join(REPO, ARQUIVO_DE_EXCECOES), 'utf-8');
    const lista = JSON.parse(cru) as ArquivoDeExcecoes;
    for (const e of lista.excecoes) {
      expect(e.id).toMatch(/^\d+$/);
      expect(e.modulo.length).toBeGreaterThan(0);
    }
  });
});
