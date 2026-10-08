// FLUXO: F5 — Cadastro que falha atrás da tela
// Cobre: a API responde 5xx (com `traceId`), e a rede cai (sem `traceId`). Os
//        dois precisam virar mensagem na tela — e não um error boundary.
//
// pt-BR (por que dois estados): eles exercitam caminhos DIFERENTES da Server
// Action, e a diferença é exatamente o que o teste precisa pinning.
//
//  - 5xx → `ApiError` → `estadoDeErro()` → `comTraceId(ERRO_GENERICO, traceId)`.
//    A mensagem ganha "Código de rastreamento: …", que é o que permite retomar
//    a conversa com o suporte.
//  - rede caída → a `fetch` LANÇA, e o throw não é `ApiError`. Cai no
//    `if (erro)` genérico, sem traceId — e sem isso a pessoa ficaria sem
//    nenhuma explicação visível.
//
// pt-BR (como se produz o 5xx sem fabricar): a versão anterior usava um nome
// de 110 caracteres — acima do VO de domínio (100), abaixo de `NOME_MAX` (120,
// o limite do Zod do cliente). O cliente aceitava, a API recusava, e a recusa
// saía como erro interno: um caminho real de produção, alcançado por digitação
// normal.
//
// ⚠️ MEDIDO 2026-10-08: esse caminho DEIXOU DE EXISTIR, e a correção deste
// arquivo é consequência direta do conserto que o matou. O VO de domínio
// passou a lançar `UserValidationException`, o boundary importa os números do
// VO, e o formulário usa os mesmos números — então o `maxlength` do input
// barra o 101º caractere e o POST nunca sai do navegador. Não há mais entrada
// que produza 500.
//
// Fabricar a resposta (`page.route` com um 500 de mentira) seria o atalho, e
// é o que este arquivo se recusa a fazer: passaria a medir o que a resposta
// fabricada diz, não o que a aplicação faz. O que resta — e é real — é o 5xx de
// infraestrutura: **banco fora do ar**, API no ar. O Prisma não fala com o
// Postgres, e o `GlobalExceptionFilter` responde 500 INTERNAL com `traceId`.
// Ver `support/banco.ts` para por que derrubar o banco e não a API.

import { derrubarBancoDoTeste, subirBancoDoTeste } from './support/banco';
import { derrubarApiDoTeste, subirApiDoTeste } from './support/api';
import { expect, alertaDoFormulario, botaoEnviar, test } from './support/fixtures';
import { emailUnico } from './support/dados';

const ERRO_GENERICO =
  'Não foi possível cadastrar o usuário. Verifique a conexão e tente novamente.';

test.describe('F5 — Erro genérico no cadastro', () => {
  // Rede de segurança do banco, e arazão dela não é "boa prática".
  //
  // O `finally` do teste de baixo é a recuperação primária, e é o que não roda
  // quando o teste estoura o prazo. Sem esta segunda camada, o estado que
  // sobra é "banco parado" e ela acende em specs de outros fluxos, a dois
  // arquivos dali — foi o sintoma medido.
  //
  // MEDIDO 2026-10-08 (Playwright 1.60, config real deste repo): depois de um
  // timeout o `afterEach` **roda**, e recebe orçamento PRÓPRIO — um hook
  // assíncrono que esperou 2002 ms completou os 2002 ms com o orçamento do
  // teste já esgotado. É isto que torna a camada válida: ela não depende do
  // `finally`, que é justamente o que o estouro consome.
  //
  // Ser idempotente é o que a torna barata. MEDIDO: `docker start` num
  // container já em pé sai **EXIT=0**, duas vezes seguidas, sem stderr — e o
  // `/health` responde 200 na primeira volta, então o custo no caminho normal
  // é um `docker start` e um fetch.
  //
  // ⚠️ Fica no `describe`, e não dentro do primeiro teste, para que uma falha
  // que mude a ordem dos testes não deixe o banco para trás.
  test.afterEach(async () => {
    await subirBancoDoTeste();
  });

  test('5xx da API vira mensagem no topo, com código de rastreamento', async ({ page, irPara }) => {
    // MEDIDO 2026-10-08: o prazo padrão (30 s) não basta, e o motivo é
    // instructive. Este teste é o ÚNICO que mexe no banco compartilhado: se ele
    // estoura o prazo, o Playwright mata o teste **sem rodar o `finally`** — e
    // o `finally` é justamente o que levanta o banco. O sintoma medido foram
    // três specs do F6 vermelhos em `limparBase()`, a dois arquivos dali, com
    // `Can't reach database server` — um banco derrubado por um teste que já
    // tinha acabado. O prazo maior é margem para o `docker stop` + o 5xx + o
    // `docker start` com espera de prontidão. E o prazo é defesa, não garantia:
    // o `afterEach` do `describe` é quem levanta o banco quando ele estoura.
    //
    // A margem é folga, não orçamento: com a porta do banco fixa (ver
    // `support/banco.ts`), este teste inteiro roda em **977 ms** — suíte
    // inteira em 52,8 s, 19/19 verdes (`pnpm --filter @projeto/web test:e2e`).
    // Antes da correção da porta, o mesmo teste estourava 30 s e depois 120 s,
    // sem nunca recuperar o banco.
    test.setTimeout(120_000);

    // O banco sai ANTES da navegação — e a ordem NÃO é por causa de listagem.
    // Uma versão anterior deste comentário dizia que "a listagem do `/users/novo`
    // é server-side e cairia no mesmo 5xx". MEDIDO: é falso — `app/users/novo/
    // page.tsx` não tem fetch nenhum e diz no próprio cabeçalho que "a página não
    // busca nada, ela só entrega o formulário". Derrubar antes ou depois
    // renderizaria igual. A ordem real é outra, e menor: põe uma falha do
    // `docker stop` no PRIMEIRO passo do teste, com a tela ainda intacta, em vez
    // de no meio do preenchimento. O que este spec mede é o 5xx do POST.
    await derrubarBancoDoTeste();
    try {
      await irPara('/users/novo');
      await page.getByLabel('Nome').fill('Ines E2E');
      // pt-BR: nenhum spec digita um email que VAI criar. Aqui o POST não cria
      // nada — é justamente esse o motivo do teste — mas um literal aqui seria
      // o padrão copiado para o próximo spec que PRECISA criar, e aí volta a
      // colisão do soft-delete (409 `EMAIL_IN_USE` desde 2026-10-08; era 412
      // `CONCURRENCY_CONFLICT` antes do conserto do `PrismaUserRepository`).
      // (O F3 digita literais de propósito: são emails que a validação recusa, e
      // recusado nunca ocupa o `@unique`.) Ver `emailUnico`.
      await page.getByLabel('Email').fill(emailUnico('ines'));
      await botaoEnviar(page).click();

      await expect(alertaDoFormulario(page)).toHaveText(
        new RegExp(`${ERRO_GENERICO.replace(/[. ]/g, '\\$&')} Código de rastreamento: .+\\.`),
      );

      // Nenhum erro por campo: um erro que não pertence a nenhum input não pode
      // ser apresentado como se pertencesse a um.
      await expect(page.locator('form [role="alert"]')).toHaveCount(1);
      await expect(page).toHaveURL(/\/users\/novo$/);
    } finally {
      await subirBancoDoTeste();
    }
  });

  test('rede caída vira mensagem no topo, sem código de rastreamento', async ({ page, irPara }) => {
    await derrubarApiDoTeste();
    try {
      await irPara('/users/novo');
      await page.getByLabel('Nome').fill('Joana E2E');
      await page.getByLabel('Email').fill(emailUnico('joana'));
      await botaoEnviar(page).click();

      // Sem traceId porque não houve resposta para extrair um. O texto exato
      // importa: um erro que "quase" é o mesmo, com uma promessa que o
      // backend não pode cumprir, é pior do que nenhum.
      await expect(alertaDoFormulario(page)).toHaveText(ERRO_GENERICO);
    } finally {
      await subirApiDoTeste();
    }
  });
});
