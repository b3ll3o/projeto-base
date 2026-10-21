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
import {
  contarUsuarios,
  limparBase,
  tokensDoHarness,
  semearUsuario,
  type ParDeTokens,
  type UsuarioWire,
} from './dados';
import { semearAdmin } from './rbac';

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
  /**
   * Browser COM sessão, sem passar pela tela de login.
   *
   * Fixture sem valor: o que importa é o efeito colateral no contexto.
   */
  comSessao: void;
  /**
   * Browser COM sessão de ADMIN (`isAdmin` semeado por `rbac.ts`).
   *
   * ⚠️ Depende de `comSessao` de propósito, e a dependência é a mecânica:
   * `comSessao` é `auto`, e uma fixture `auto` roda ANTES de qualquer fixture
   * que o teste peça. Declarando `comSessao` como dependência, o Playwright
   * garante que o cookie de sessão já foi plantado — e é aí que esta escreve
   * por cima. Sem a dependência seria uma corrida entre duas escritas no mesmo
   * cookie, e o vencedor dependeria da ordem de resolução do framework.
   */
  comoAdmin: void;
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

  /**
   * Planta o par de tokens como cookie de sessão do browser.
   *
   * pt-BR (2026-10-13, demanda `login-usuario-senha`): `/users` chama
   * `exigirSessao()`, que redireciona para `/login` quando não há access
   * token. Sem esta fixture os specs F1–F6 eram TODOS redirecionados, e cada
   * um passava a afirmar "a tela de login apareceu" num arquivo cujo nome e
   * cujo inventário prometem medir outra coisa.
   *
   * ⚠️ `/users/novo` DEIXOU de chamar `exigirSessao()` no mesmo dia (ver o
   * comentário do `page.tsx`): proteger a tela de cadastro não impedia ninguém
   * de criar conta, já que `POST /users` é público — só impedia a pessoa, num
   * beco sem saída. A fixture continua valendo para os specs que navegam por
   * `/users`.
   *
   * ⚠️ Por que plantar o cookie em vez de autenticar pela tela: o login pela
   * tela É o F7, e é um caminho com asserções próprias. Se ele virasse o preço
   * de entrada dos outros specs, uma falha no formulário de login derrubaria
   * a listagem, a validação e a navegação — três arquivos vermelhos por uma
   * causa que não é deles. É a mesma classe de falha que o cabeçalho deste
   * arquivo já descreve ("verde que mente"), com o sinal trocado.
   *
   * O cookie precisa ser httpOnly porque `lib/sessao.ts` grava httpOnly, e
   * browser nenhum — nem o Playwright por `evaluate` — consegue ler um cookie
   * httpOnly. `addCookies` escreve direto no contexto, que é o único caminho
   * possível. Os nomes estão escritos à mão em vez de importados de
   * `lib/sessao.ts` porque aquele módulo importa `next/headers`: carregá-lo no
   * processo do Playwright não funciona. Um desatualização aqui não passa
   * silenciosa — o cookie errado faz `exigirSessao()` redirecionar, e os seis
   * specs ficam vermelhos.
   *
   * `auto: true` porque o preço de NÃO ser automática é maior: quem escreve um
   * spec novo não tem como saber que precisa lembrar, e o esquecimento seria
   * silencioso. Um spec que precisa medir o estado DESLOGADO faz
   * `context.clearCookies()` dentro do próprio teste — é uma afirmação
   * explícita do que o teste quer, e é o que o F8 faz.
   */
  comSessao: [
    async ({ page }, use) => {
      const { webUrl } = exigirEstado();
      // ⚠️ O par em cache, e NÃO um `parDeTokens()` novo. A conta de sessão é
      // soft-deleted assim que nasce (ver `semearELogar`), então um login novo
      // com aquele e-mail dá 401 — `findByEmail` filtra soft-deleted. O token
      // já emitido continua válido (stateless). MEDIDO: com o login novo,
      // 29 de 29 specs caíam em `INVALID_CREDENTIALS`.
      const { accessToken, refreshToken } = await tokensDoHarness();
      await page.context().addCookies([
        { name: 'access_token', value: accessToken, url: webUrl, httpOnly: true, sameSite: 'Lax' },
        {
          name: 'refresh_token',
          value: refreshToken,
          url: webUrl,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
      await use();
    },
    { auto: true },
  ],

  comoAdmin: async ({ page, comSessao, baseLimpa }, use) => {
    // ⚠️ `void` explícito: sem ele o `no-unused-vars` reclama das dependências
    // que existem SÓ pela ordem. Nenhuma das duas é usada — são os gatilhos.
    //
    // ⚠️ `baseLimpa` na dependência é ORDEM DECLARADA, não conserto medido.
    // Ela também é `auto`, e Playwright roda `auto` antes de qualquer fixture
    // pedida — então hoje a dependência é redundante. Fica porque é a única
    // forma de dizer "isto precisa da base limpa" no código em vez de num
    // comentário, e porque `auto` é detalhe do framework, não contrato.
    //
    // 📌 O que o F9 mediu de verdade: o "Acesso restrito" do admin NÃO era
    // ordem de fixture. Era `lib/perfil.ts` prefixando `/api/v1` num
    // `API_BASE_URL` que já o trazia — `/api/v1/api/v1/me/profile`, 404, e o
    // `catch` de `obterMeuPerfil` devolvendo "sem perfil". Causa oposta,
    // mesmo sintoma: por isso o comentário antigo apontava para a ordem.
    void comSessao;
    void baseLimpa;
    const admin = await semearAdmin();
    await plantarSessao(page, admin.tokens);
    await use();
  },
});

export { expect };

/**
 * Troca o par de cookies de sessão pelo par informado.
 *
 * ⚠️ `addCookies` e não `context.clearCookies()` + write: os mesmos nomes de
 * cookie com o mesmo `url` SUBSTITUEM o valor, então o par do harness sai sem
 * passar por um estado sem cookie — que é o estado que o F8 mede, e que aqui
 * faria a tela cair no redirecionamento antes de chegar na de "Acesso
 * restrito". Os dois motivos-produzem-a-tela-errada, e o spec não diria qual.
 */
export async function plantarSessao(page: Page, tokens: ParDeTokens): Promise<void> {
  const { webUrl } = exigirEstado();
  await page.context().addCookies([
    {
      name: 'access_token',
      value: tokens.accessToken,
      url: webUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'refresh_token',
      value: tokens.refreshToken,
      url: webUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

/**
 * Planta a EMPRESA da sessão — o cookie `tenant_id`.
 *
 * pt-BR (onboarding de empresa, 2026-10-21): sem este cookie a sessão age no
 * bucket GLOBAL (`users.profile_id`), e a listagem volta recortada para a
 * PRÓPRIA linha — a tela mostra uma pessoa e não diz por quê. O cookie é o
 * que faz o `X-Tenant-Id` sair.
 *
 * ⚠️ NÃO é httpOnly, e não por descuido: `lib/sessao.ts` grava assim, e o id
 * da empresa não é segredo.
 */
export async function plantarEmpresa(page: Page, tenantId: string): Promise<void> {
  const { webUrl } = exigirEstado();
  await page
    .context()
    .addCookies([
      { name: 'tenant_id', value: tenantId, url: webUrl, httpOnly: false, sameSite: 'Lax' },
    ]);
}

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

/**
 * Erro de UM campo (`nome`, `email` ou `senha`). O id é o que o
 * `aria-describedby` aponta.
 *
 * pt-BR (2026-10-13): `senha` entrou na união quando o campo entrou no
 * formulário. A união é o que impede o caller de passar um campo que não tem
 * `#<campo>-erro` — o locator viraria um não-casado silencioso.
 */
export function erroDoCampo(page: Page, campo: 'nome' | 'email' | 'senha') {
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

/**
 * Esqueça a sessão do browser.
 *
 * pt-BR: existe porque `comSessao` é `auto` — o browser entra em TODO spec
 * autenticado. Um teste que precisa medir o estado deslogado chama isto, e a
 * chamada fica visível no corpo do teste em vez de ser um detalhe do
 * fixture: é a diferença entre "este spec mede a porta fechada" e "este spec
 * mede a porta fechada, porque apagou o cookie".
 */
export async function clearCookies(page: Page): Promise<void> {
  await page.context().clearCookies();
}

/** Itens da listagem — um por usuário. */
export function itensDaLista(page: Page) {
  return page.locator('main ul > li');
}
