/**
 * Spec do gate de sincronia IR → flow.md.
 *
 * O que este gate torna automático: **todo diagrama Mermaid de `docs/flows/`
 * é o que o conversor produz a partir da IR dele**. Sem ele, editar a IR (ou
 * editar o `flow.md` à mão) deixa o diagrama descrevendo um fluxo que não existe
 * mais — e nada no preflight percebe, porque o diagrama é um arquivo de
 * markdown qualquer.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkFlowMermaidSync } from './check-flow-mermaid-sync.js';
import { renderFlowDoc, type SequenceIr } from '../../../tooling/scripts/flow-ir-to-mermaid.js';

// ── fixtures ────────────────────────────────────────────────────────────────

const IR: SequenceIr = {
  schema_version: 1,
  diagram_type: 'sequence',
  meta: { title: 'GET /ping' },
  participants: [{ id: 'client', label: 'Cliente' }],
  messages: [{ from: 'client', to: 'client', label: 'ping', y: 1 }],
};

/** Cria `docs/flows/<dom>/<flow>/` com a IR e, opcionalmente, o `flow.md`. */
function fixture(opts: { ir?: SequenceIr; writeDoc?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'flow-sync-'));
  const dir = join(root, 'docs/flows/http-api/http-api-ping');
  mkdirSync(dir, { recursive: true });
  const irPath = join(dir, 'http-api-ping.sequence.json');
  const ir = opts.ir ?? IR;
  writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf-8');
  if (opts.writeDoc !== false) {
    writeFileSync(join(dir, 'flow.md'), renderFlowDoc(ir, irPath.slice(root.length + 1)), 'utf-8');
  }
  return root;
}

const roots: string[] = [];
function tmp(opts?: { ir?: SequenceIr; writeDoc?: boolean }): string {
  const r = fixture(opts);
  roots.push(r);
  return r;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

// ── o gate ──────────────────────────────────────────────────────────────────

describe('checkFlowMermaidSync', () => {
  it('verde quando o flow.md é exatamente o que o conversor produz', async () => {
    const r = await checkFlowMermaidSync({ repoRoot: tmp() });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('VERMELHO quando a IR muda e o flow.md fica velho — e nomeia o flow + o conserto', async () => {
    // Este é o defeito que o gate existe para pegar: alguém corrigiu o fluxo no
    // código, atualizou a IR, e esqueceu de regenerar o diagrama. Sem erro
    // algum, porque `flow.md` é markdown válido e nada o abre.
    const root = fixture();
    roots.push(root);
    const dir = join(root, 'docs/flows/http-api/http-api-ping');
    const irPath = join(dir, 'http-api-ping.sequence.json');
    const editado: SequenceIr = { ...IR, meta: { title: 'GET /ping (corrigido)' } };
    writeFileSync(irPath, JSON.stringify(editado, null, 2), 'utf-8');

    const r = await checkFlowMermaidSync({ repoRoot: root });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('http-api-ping');
    // O conserto tem que estar no erro: um erro que só acusa obriga quem lê a
    // caçar o comando, e aí ele volta a não regenerar.
    expect(r.errors.join('\n')).toContain('--write');
  });

  it('VERMELHO quando a flow.md foi editado à mão (saída do conversor diferente)', async () => {
    const root = fixture();
    roots.push(root);
    const doc = join(root, 'docs/flows/http-api/http-api-ping/flow.md');
    writeFileSync(doc, `${readFileSync(doc, 'utf-8')}\n<!-- editado à mão -->\n`, 'utf-8');

    const r = await checkFlowMermaidSync({ repoRoot: root });
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
  });

  it('VERMELHO quando a IR existe e o flow.md NÃO existe', async () => {
    const r = await checkFlowMermaidSync({ repoRoot: tmp({ writeDoc: false }) });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('flow.md');
  });

  it('VERMELHO quando a IR está fora do layout — e ela VIRA verde quando some', async () => {
    // MEDIDO 2026-10-16 (revisão adversarial): a enumeração andava por posição
    // fixa (`docs/flows/<dom>/<flow>`), então uma IR em `docs/flows/<dom>/x.sequence.json`
    // nunca entrava na lista e o gate saía VERDE — com uma IR que o conversor
    // nem percorre. Falso verde por omissão.
    const root = fixture();
    roots.push(root);
    mkdirSync(join(root, 'docs/flows/http-api'), { recursive: true });
    writeFileSync(
      join(root, 'docs/flows/http-api/fora-do-layout.sequence.json'),
      JSON.stringify(IR, null, 2),
      'utf-8',
    );
    const r = await checkFlowMermaidSync({ repoRoot: root });
    expect(r.ok).toBe(false);
    // A mensagem específica, não o nome do arquivo: `toContain('fora-do-layout')`
    // também casa no erro de "diagrama ausente", então o teste passava mesmo com a
    // conferência de layout desligada (medido: 10 de 10 verdes na mutação).
    expect(r.errors.join('\n')).toContain('fora do layout esperado');
  });

  it('VERMELHO quando existe flow.md sem IR nenhuma (doc órfão)', async () => {
    // O espelho do caso acima. O gate iterava IRs, então um diagrama cuja IR foi
    // renomeada/deletada continuava desenhando um fluxo morto, sem um byte de erro.
    const root = fixture();
    roots.push(root);
    const orfao = join(root, 'docs/flows/http-api/http-api-velho');
    mkdirSync(orfao, { recursive: true });
    writeFileSync(
      join(orfao, 'flow.md'),
      '# diagrama de um fluxo que ninguém mais descreve\n',
      'utf-8',
    );
    const r = await checkFlowMermaidSync({ repoRoot: root });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('órfão');
  });

  it('cada IR é conferida uma vez — duas IRs no mesmo diretório não duplicam o erro', async () => {
    // A enumeração empurrava o DIRETÓRIO, uma vez por arquivo: com 2 IRs o mesmo
    // diretório entrava 2× na lista, e o `.find()` devolvia sempre a primeira.
    // O erro accuseva `a`, mandava rodar `--write` (que regrava a partir de `b`)
    // e o gate ficava vermelho para sempre, sem caminho de conserto.
    const root = fixture();
    roots.push(root);
    const dir = join(root, 'docs/flows/http-api/http-api-ping');
    const b: SequenceIr = { ...IR, meta: { title: 'GET /ping (b)' } };
    writeFileSync(join(dir, 'b.sequence.json'), JSON.stringify(b, null, 2), 'utf-8');
    const r = await checkFlowMermaidSync({ repoRoot: root });
    expect(r.errors.filter((e) => e.includes('fora de sincronia'))).toHaveLength(1);
    expect(r.errors.join('\n')).toContain('b.sequence.json');
  });

  it('IR ilegível vira erro do gate — não derruba o painel inteiro', async () => {
    // `main()` do preflight chama `check.fn()` sem `try` e o `.catch` final sai 2
    // sem imprimir o resumo: JSON corrompido escondia o resultado dos outros gates.
    const root = fixture();
    roots.push(root);
    writeFileSync(
      join(root, 'docs/flows/http-api/http-api-ping/x.sequence.json'),
      '{ nao é json',
      'utf-8',
    );
    const r = await checkFlowMermaidSync({ repoRoot: root });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('não parseou');
  });

  it('VERMELHO quando não há NENHUMA IR — conjunto vazio não é verde', async () => {
    // Sem esta linha, um `docs/flows/` vazio (ou um path errado no gate) faria o
    // laço iterar zero vezes e sair verde: o critério inerte sobre conjunto
    // vazio, que é a forma mais barata de um gate mentir.
    const root = tmp();
    const { rmSync: rm } = await import('node:fs');
    rm(join(root, 'docs/flows/http-api'), { recursive: true, force: true });

    const r = await checkFlowMermaidSync({ repoRoot: root });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('0 IR');
  });
});

// ── contra o repo de verdade ────────────────────────────────────────────────

describe('checkFlowMermaidSync — contra o repo real', () => {
  it('todos os diagrams de docs/flows batem com a IR deles', async () => {
    // Um gate que só valida fixture é verde enquanto o catálogo envelhece.
    const r = await checkFlowMermaidSync({ repoRoot: '.' });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
