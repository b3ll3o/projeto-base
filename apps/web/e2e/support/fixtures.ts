// apps/web/e2e/support/fixtures.ts
//
// `test`/`expect` estendidos com o que todo spec de fluxo precisa: a URL do
// app, os seletores que a tela realmente usa, e o banco limpo.
//
// ── Por que os seletores vivem aqui e não em cada spec ──────────────────────
//
// Duas das três telas de erro são ambíguas por construção, e o erro aí é
// silencioso. Medido no navegador:
//
//  1. `page.locator('[role="alert"]')` na página inteira devolve **3**
//     elementos, um deles vazio — a região de live-region do Next Dev Tools.
//     Um `toHaveText()` page-wide passaria esbarrando no elemento errado, ou
//     falharia por `strict mode violation` sem dizer qual. Todo locator de
//     erro aqui é escopado a `form` ou ao heading da listagem.
//  2. O texto `Cadastrar usuário` é `<h1>` em `/users/novo` e `<link>` em
//     `/users`. `getByText('Cadastrar usuário')` page-wide casa os dois. Por
//     isso o seletor distingue `heading` de `link`.
//  3. `Cadastrar` é substring de `Cadastrando…` (U+2026). Uma regex solta
//     casa o botão nos dois estados — justamente o estado que o teste do
//     envio em andamento precisa NEGAR. Daí o nome exato.
//
// ── O banco limpo é automático ─────────────────────────────────────────────
//
// `limparBase()` roda em `beforeEach` para todo spec. Declarar isso em cada
// arquivo é uma chance de esquecer, e "o spec passou porque herdou estado do
// spec anterior" é verde que mente — a mesma classe de falha que a convenção
// `guard-classes.md` cataloga. Um spec que precisa de estado prévio semeia
// DEPOIS do `beforeEach`, dentro do próprio teste.

import { test as base, expect, type Page } from '@playwright/test';
import { exigirEstado } from './estado';
import { contarUsuarios, limparBase, semearUsuario, type UsuarioWire } from './dados';

export interface FixturesE2E {
  /** URL absoluta de um caminho do app. */
  appUrl: (caminho: string) => string;
  /** `page.goto` na URL absoluta. */
  irPara: (caminho: string) => Promise<void>;
  /**
   * Registra o estado prévio que o teste consome, e devolve o usuário criado.
   *
   * pt-BR: falha se o POST não voltar 201. Devolver `{status, corpo}` sem
   * olhar era verde por ausência — o pré-requisito sumia e a asserção
   * seguinte reprovava por outro motivo (medido em 2026-10-08, ver
   * `semearUsuario`).
   *
   * O `version` faz parte do tipo desde 2026-10-08 porque `apagarUsuario` exige
   * ele no `If-Match`. A interface declarava o retorno SEM `version` e o spec
   * lia mesmo assim: o Playwright transpila sem typecheck, então o spec rodava
   * verde e `tsc --noEmit` era quem acusava. `e2e/` está fora do gate de
   * cobertura, mas NÃO do typecheck — o `include` do `apps/web/tsconfig.json`
   * cobre qualquer `.ts`.
   *
   * (O glob literal NÃO pode ser escrito aqui: a sequência de barra-estrela
   * fecha o próprio comentário JSDoc no meio da frase.)
   */
  semear: (nome: string, email: string) => Promise<UsuarioWire>;
  /** Quantos usuários a listagem da API devolve. */
  contarUsuarios: () => Promise<number>;
  /**
   * Fixture sem valor: só garante a base limpa. `auto` faz o Playwright
   * montá-la antes de qualquer fixture que o teste peça (`page`, `irPara`),
   * porque um spec que abre com `irPara('/users')` precisa da base já vazia
   * no momento em que a tela é desenhada.
   */
  baseLimpa: void;
}

// pt-BR: o `({}, use)` das fixtures sem dependência NÃO é estilo, é exigência
// da API: `base.extend` valida que o primeiro argumento da fixture é um
// padrão de desestruturação de objeto, e aborta a suíte inteira com
// "First argument must use the object destructuring pattern" se não for.
// MEDIDO 2026-10-08: a primeira tentativa de silenciar o `no-empty-pattern`
// foi trocar `{}` por um parâmetro nomeado (`_fixtures`), e o resultado foi a
// suíte inteira vermelha na carga dos specs — o lint ficou verde trocando um
// contrato do framework por um estilo. A regra é que se desliga, e só para
// `e2e/`: ver o bloco `no-empty-pattern` em `apps/web/eslint.config.mjs`.
export const test = base.extend<FixturesE2E>({
  baseLimpa: [
    async ({}, use) => {
      await limparBase();
      await use();
    },
    { auto: true },
  ],

  appUrl: async ({}, use) => {
    const { webUrl } = exigirEstado();
    await use((caminho: string) => `${webUrl}${caminho}`);
  },

  irPara: async ({ appUrl, page }, use) => {
    await use(async (caminho: string) => {
      await page.goto(appUrl(caminho));
    });
  },

  semear: async ({}, use) => {
    await use((nome: string, email: string) => semearUsuario(nome, email));
  },

  contarUsuarios: async ({}, use) => {
    await use(() => contarUsuarios());
  },
});

export { expect };

// ── Seletores ───────────────────────────────────────────────────────────────

/**
 * Alertas do formulário de cadastro.
 *
 * pt-BR: escopado a `form` de propósito — ver o ponto 1 do cabeçalho. Mesmo
 * escopo vale para o `formError` do topo, que é o mesmo elemento visual.
 */
export function alertaDoFormulario(page: Page) {
  return page.locator('form [role="alert"]');
}

/** Erro de UM campo (`nome` ou `email`). O id é o que o `aria-describedby` aponta. */
export function erroDoCampo(page: Page, campo: 'nome' | 'email') {
  return page.locator(`#${campo}-erro`);
}

/** Botão de envio, pelo nome EXATO — ver o ponto 3 do cabeçalho. */
export function botaoEnviar(page: Page) {
  return page.getByRole('button', { name: 'Cadastrar usuário', exact: true });
}

/**
 * Botão de envio já em voo.
 *
 * pt-BR: o nome com reticências (U+2026) é o que o componente renderiza
 * enquanto `pendente` é verdadeiro. Um locator separado é o que permite
 * afirmar o estado intermediário, que é onde mora o `startTransition` e o
 * travamento dos campos.
 */
export function botaoEnviando(page: Page) {
  return page.getByRole('button', { name: 'Cadastrando…', exact: true });
}

/** Link "Cadastrar usuário" da listagem. */
export function linkCadastrar(page: Page) {
  // pt-BR: quando a lista está vazia existem DOIS com este rótulo (o do
  // cabeçalho e o do estado vazio). O do cabeçalho vem primeiro no DOM.
  return page.getByRole('link', { name: 'Cadastrar usuário' }).first();
}

/** Itens da listagem — um por usuário. */
export function itensDaLista(page: Page) {
  return page.locator('main ul > li');
}
