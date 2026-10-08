// apps/web/playwright-isolamento.spec.ts
//
// GUARD: a suíte e2e depende de rodar com UM worker, e nada amarra isso.
//
// pt-BR: o motivo de `workers: 1` já estava escrito em `playwright.config.ts`
// quando `e2e/support/banco.ts` ainda não existia — e o motivo de lá era o de
// sempre: o isolamento é "a listagem está vazia", afirmação sobre o BANCO
// INTEIRO, e com dois workers o spec que passa é o que rodou primeiro.
//
// `banco.ts` acrescentou um segundo motivo, mais forte: `derrubarBancoDoTeste()`
// faz `docker stop` no container COMPARTILHADO. Com mais de um worker, o F5
// derruba o Postgres enquanto outro worker está no meio de um spec, e o
// resultado é exatamente o que o próprio cabeçalho do F5 registra como
// observado — specs de outro fluxo morrendo em `limparBase()` com
// `Can't reach database server`, a dois arquivos dali.
//
// MEDIDO 2026-10-08: `grep -rn "workers" --include=*.ts --include=*.md` sobre
// `.tooling/scripts`, `tooling/scripts`, `apps/web` e `.agents/specs` traz 6
// ocorrências e ZERO delas são uma trava — são a config, comentários e a
// convenção. A dependência existia sem amarra.
//
// ⚠️ O que este guard NÃO promete: ele lê o arquivo, e o Playwright aceita
// `--workers` na linha de comando, que sobrescreve o valor sem deixar rastro
// aqui. Alguém rodando `playwright test --workers 4` local passa por cima
// deste guard. O CI não passa (não passa a flag), e é por isso que o gate vale.

import { describe, expect, it } from 'vitest';
import config from './playwright.config';

describe('isolamento da suíte e2e', () => {
  it('roda com um worker só, porque o banco do teste é um só', () => {
    // MEDIDO 2026-10-08: mutação verificada — trocar `workers: 1` por
    // `workers: 2` em `playwright.config.ts` faz ESTE teste ficar vermelho.
    // Sem a mutação, um guard que nunca disparou é indistinguível de um que
    // funciona.
    expect(
      config.workers,
      '`workers` deixou de ser 1 em `playwright.config.ts`. Um segundo worker ' +
        'divide com o F5 o único Postgres da suíte: `e2e/support/banco.ts` faz ' +
        '`docker stop` nele, e o spec do outro worker morre em `limparBase()` ' +
        "com `Can't reach database server` — um erro que não é dele. " +
        'Se a intenção era paralelizar, o banco do teste precisa deixar de ser ' +
        'compartilhado primeiro.',
    ).toBe(1);
  });
});
