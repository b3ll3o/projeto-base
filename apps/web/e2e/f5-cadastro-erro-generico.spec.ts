// FLUXO: F5 — Cadastro que falha atrás da tela
// Cobre: a API responde 500 (com `traceId`), e a rede cai (sem `traceId`). Os
//        dois precisam virar mensagem na tela — e não um error boundary.
//
// pt-BR (por que dois estados): eles exercitam caminhos DIFERENTES da Server
// Action, e a diferença é exatamente o que o teste precisa pinning.
//
//  - 500 → `ApiError` → `estadoDeErro()` → `comTraceId(ERRO_GENERICO, traceId)`.
//    A mensagem ganha "Código de rastreamento: …", que é o que permite retomar
//    a conversa com o suporte.
//  - rede caída → a `fetch` LANÇA, e o throw não é `ApiError`. Cai no
//    `if (erro)` genérico, sem traceId — e sem isso a pessoa ficaria sem
//    nenhuma explicação visível.
//
// pt-BR (como se produz o 500 sem fabricar): com um nome de 110 caracteres —
// acima do VO de domínio (100), abaixo de `NOME_MAX` (120, o limite do Zod do
// cliente). O cliente aceita, a API recusa, e a recusa sai como erro interno.
// É um caminho REAL de produção, alcançado por digitação normal, e por isso
// este teste não precisa fabricar resposta nenhuma.

import { derrubarApiDoTeste, subirApiDoTeste } from './support/api';
import { expect, alertaDoFormulario, botaoEnviar, test } from './support/fixtures';
import { emailUnico } from './support/dados';

const ERRO_GENERICO =
  'Não foi possível cadastrar o usuário. Verifique a conexão e tente novamente.';

/** Comprimento aceito pelo Zod do cliente (120) e recusado pelo VO de domínio (100). */
const NOME_ACIMA_DO_VO = 'H'.repeat(110);

test.describe('F5 — Erro genérico no cadastro', () => {
  test('500 da API vira mensagem no topo, com código de rastreamento', async ({
    page,
    irPara,
    contarUsuarios,
  }) => {
    await irPara('/users/novo');
    await page.getByLabel('Nome').fill(NOME_ACIMA_DO_VO);
    // pt-BR: nenhum spec digita um email que VAI criar. Aqui o POST não cria
    // nada — é justamente esse o motivo do teste — mas um literal aqui seria
    // o padrão copiado para o próximo spec que PRECISA criar, e aí volta o 412
    // do soft-delete. (O F3 digita literais de propósito: são emails que a
    // validação recusa, e recusado nunca ocupa o `@unique`.) Ver `emailUnico`.
    await page.getByLabel('Email').fill(emailUnico('ines'));
    await botaoEnviar(page).click();

    await expect(alertaDoFormulario(page)).toHaveText(
      new RegExp(`${ERRO_GENERICO.replace(/[. ]/g, '\\$&')} Código de rastreamento: .+\\.`),
    );

    // Nenhum erro por campo: um erro que não pertence a nenhum input não pode
    // ser apresentado como se pertencesse a um.
    await expect(page.locator('form [role="alert"]')).toHaveCount(1);
    await expect(page).toHaveURL(/\/users\/novo$/);
    expect(await contarUsuarios()).toBe(0);
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
