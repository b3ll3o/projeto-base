import { describe, expect, it } from 'vitest';
import {
  ARQUIVOS,
  ARQUIVO_DO_GATE,
  checkPrReviewWired,
  SCRIPT_DO_GATE,
  scriptsDoPackage,
  verificarLigacao,
} from './check-pr-review-wired';
import type { Entradas } from './check-pr-review-wired';

/** Um repo ligado, para cada item virar o que falta. */
function ligado(): Entradas {
  return {
    workflow: [
      'name: pr-review',
      'on:',
      '  pull_request:',
      '    types: [opened]',
      '  pull_request_review:',
      '    types: [submitted]',
      '',
      'jobs:',
      '  review-comment:',
      '    runs-on: ubuntu-24.04',
      '    steps:',
      `      - run: pnpm ${SCRIPT_DO_GATE}`,
    ].join('\n'),
    packageJson: JSON.stringify({
      scripts: { [SCRIPT_DO_GATE]: `tsx ${ARQUIVO_DO_GATE}` },
    }),
    convencao: '# Convenção: pr-review',
    indiceConvencoes: '| Revisão de PR | [`pr-review.md`](./pr-review.md) | regra |',
    agentsMd: '| Revisão de PR | [`pr-review.md`](./.agents/specs/conventions/pr-review.md) |',
    workflowDoc: '# Workflow: `pr-review-mode`',
    indiceWorkflows: '| `pr-review-mode` | "revisar o PR" | parallel |',
  };
}

describe('verificarLigacao', () => {
  it('verde com tudo ligado', () => {
    const r = verificarLigacao(ligado());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('acusa o workflow ausente', () => {
    const e = ligado();
    delete e.workflow;
    const r = verificarLigacao(e);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain(ARQUIVOS.workflow);
  });

  it('acusa o workflow que não escuta pull_request_review', () => {
    // O DENTE: neutralizar a checagem do evento deixa o gate vermelho para
    // sempre, e nada mais no repo accuse.
    const e = ligado();
    e.workflow = e.workflow?.replace('pull_request_review', 'pull_request');
    const r = verificarLigacao(e);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('pull_request_review');
  });

  it('NÃO conta o evento dito num COMENTÁRIO do workflow', () => {
    // MEDIDO 2026-11-17: a primeira versão procurava o evento com regex no
    // arquivo inteiro, e o cabeçalho do workflow o menciona numa linha de
    // comentário — com o evento REMOVIDO do `on:`, o gate continuava verde.
    // Era a classe 3 do `guard-classes.md` ("guard que dispara em si mesmo"),
    // e a mutação foi o que a revelou. Este teste é o dente do conserto.
    const e = ligado();
    e.workflow = e.workflow?.replace(
      '  pull_request_review:\n    types: [submitted]\n',
      '  # o evento `pull_request_review` fecha o laço\n',
    );
    const r = verificarLigacao(e);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('pull_request_review');
  });

  it('acusa o workflow que não invoca o gate', () => {
    const e = ligado();
    e.workflow = e.workflow?.replace(`pnpm ${SCRIPT_DO_GATE}`, 'pnpm ci:preflight');
    const r = verificarLigacao(e);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('não invoca o gate');
  });

  it('acusa o script ausente do package.json', () => {
    const e = ligado();
    e.packageJson = JSON.stringify({ scripts: {} });
    const r = verificarLigacao(e);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain(SCRIPT_DO_GATE);
  });

  it('acusa o script que aponta para o path errado', () => {
    const e = ligado();
    e.packageJson = JSON.stringify({ scripts: { [SCRIPT_DO_GATE]: 'tsx outro/lugar.ts' } });
    const r = verificarLigacao(e);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain(ARQUIVO_DO_GATE);
  });

  it('acusa a convenção fora do índice das convenções', () => {
    const e = ligado();
    e.indiceConvencoes = '| Idioma pt-BR | [`idioma.md`](./idioma.md) |';
    const r = verificarLigacao(e);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain(ARQUIVOS.indiceConvencoes);
  });

  it('acusa a convenção fora do AGENTS.md', () => {
    // Os DOIS índices são o mesmo índice: um só com a linha é convenção
    // órfã.
    const e = ligado();
    e.agentsMd = 'AGENTS.md sem a linha';
    const r = verificarLigacao(e);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain(ARQUIVOS.agentsMd);
  });

  it('acusa o doc do workflow fora do índice de workflows', () => {
    const e = ligado();
    e.indiceWorkflows = 'WORKFLOWS.md sem a linha';
    const r = verificarLigacao(e);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain(ARQUIVOS.indiceWorkflows);
  });

  it('acusa o doc do workflow ausente', () => {
    const e = ligado();
    delete e.workflowDoc;
    const r = verificarLigacao(e);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain(ARQUIVOS.workflowDoc);
  });

  it('acusa TUDO que falta, e não só o primeiro', () => {
    const r = verificarLigacao({});
    // 6 itens: workflow, script, convenção, índice das convenções, AGENTS.md,
    // doc do workflow, índice de workflows — o script e a convenção contam
    // como itens próprios.
    expect(r.errors.length).toBeGreaterThanOrEqual(6);
  });
});

describe('scriptsDoPackage', () => {
  it('devolve os scripts de um package.json válido', () => {
    expect(scriptsDoPackage('{"scripts":{"a":"b"}}')).toEqual({ a: 'b' });
  });

  it('devolve objeto vazio para JSON inválido ou ausente', () => {
    expect(scriptsDoPackage('lixo')).toEqual({});
    expect(scriptsDoPackage(undefined)).toEqual({});
  });
});

describe('o repo real', () => {
  it('o processo está ligado no repo de verdade', () => {
    // DIFERENCIAL contra o repo real: é o único teste que prova que o
    // instrumento está medindo O QUE ESTÁ NO REPO, e não um fixture.
    const r = checkPrReviewWired({ repoRoot: process.cwd() });
    expect(r.errors).toEqual([]);
  });
});
