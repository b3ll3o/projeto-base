// FLUXO: F4 — Cadastro com email já cadastrado
// Cobre: a API responde 409, a Server Action traduz o conflito para o campo
//        `email`, a pessoa continua na tela, e o que ela digitou permanece.
//
// pt-BR (o porquê de semear pela API e não pela tela): o estado prévio deste
// fluxo é um usuário JÁ cadastrado. Criá-lo navegando até o formulário
// mediria o fluxo de cadastro — que é o F2 — dentro do F4, e um defeito em F2
// derrubaria F4 sem que o teste diga qual dos dois quebrou. A API é o ponto
// de partida mais direto para o estado que o fluxo consome.

import { expect, botaoEnviar, erroDoCampo, test } from './support/fixtures';
import { apagarUsuario, emailUnico } from './support/dados';

const JA_CADASTRADO = { nome: 'Helena E2E' };

test.describe('F4 — Email duplicado', () => {
  test('mostra o conflito no campo email e mantém o que foi digitado', async ({
    page,
    irPara,
    semear,
    contarUsuarios,
  }) => {
    // MEDIDO em 2026-10-08: com um email LITERAL em `JA_CADASTRADO`, o segundo
    // teste do arquivo semeava e falhava, e o primeiro passava. A causa não era
    // o formulário: `limparBase()` faz soft-delete, o `email @unique` da linha
    // apagada continua tomada, e o `findByEmail` do repositório filtra
    // soft-delado — a aplicação respondia "livre" enquanto o Postgres
    // respondia "ocupado". Um literal por execução resolve; ver `emailUnico`.
    //
    // O sintoma dessa colisão mudou no mesmo dia: era 412
    // `CONCURRENCY_CONFLICT`, porque o `catch` sem binding do
    // `PrismaUserRepository.save` transformava o P2002 de email em
    // `ConcurrencyException(0, null)` (o find por `id` devolve `null` — a
    // linha vencedora tem outro id). Hoje é 409 `EMAIL_IN_USE`.
    //
    // O que NÃO mudou, e é a decisão em aberto: a aplicação continua dizendo
    // "livre" no pré-check para um email soft-deleted. O desfecho está certo
    // (409), mas só porque o banco é a autoridade e o repositório agora conta
    // que é colisão de email. Se algum dia essa resposta virar 200 em vez de
    // 409, a causa será o pré-check dizer uma coisa que o índice não concorda.
    const email = emailUnico('helena');
    await semear(JA_CADASTRADO.nome, email);

    await irPara('/users/novo');
    await page.getByLabel('Nome').fill('Outra Pessoa');
    await page.getByLabel('Email').fill(email);
    await botaoEnviar(page).click();

    // O erro é por CAMPO, não no topo: a Server Action mapeia
    // `EMAIL_IN_USE` para `fieldErrors.email`, e é esse campo que a pessoa
    // precisa corrigir.
    await expect(erroDoCampo(page, 'email')).toHaveText('Este email já está cadastrado.');

    // A pessoa não vai para a listagem: o cadastro não aconteceu.
    await expect(page).toHaveURL(/\/users\/novo$/);

    // Perder o que foi digitado é o defeito que este teste existe para pegar.
    // O componente re-põe `estado.valores` num `useEffect`, e esse repõe é
    // seguro só porque os campos ficam travados durante o envio.
    await expect(page.getByLabel('Nome')).toHaveValue('Outra Pessoa');
    await expect(page.getByLabel('Email')).toHaveValue(email);

    // Um só usuário: o segundo POST não criou nada.
    expect(await contarUsuarios()).toBe(1);
  });

  test('o campo email é marcado como inválido para leitores de tela', async ({
    page,
    irPara,
    semear,
  }) => {
    const emailCadastrado = emailUnico('helena');
    await semear(JA_CADASTRADO.nome, emailCadastrado);

    await irPara('/users/novo');
    await page.getByLabel('Nome').fill('Outra Pessoa');
    await page.getByLabel('Email').fill(emailCadastrado);
    await botaoEnviar(page).click();

    // `aria-invalid` + `aria-describedby` é o que liga a mensagem ao campo
    // para quem não enxerga o vermelho. O id do erro é o alvo do
    // `aria-describedby` — se os dois divergirem, a pessoa ouve o erro sem
    // saber de qual campo é.
    const campoEmail = page.getByLabel('Email');
    await expect(campoEmail).toHaveAttribute('aria-invalid', 'true');
    await expect(campoEmail).toHaveAttribute('aria-describedby', 'email-erro');
    await expect(page.getByLabel('Nome')).toHaveAttribute('aria-invalid', 'false');
  });

  test('email de um usuário APAGADO dá o mesmo erro de campo, não erro genérico', async ({
    page,
    irPara,
    semear,
    contarUsuarios,
  }) => {
    // pt-BR (2026-10-08): este é o caso que produzia 412, e ele é o que o
    // conserto do `PrismaUserRepository.save` mudou. A cadeia, toda ela
    // plausível só de relance:
    //
    //   `apagarUsuario` faz soft-delete → a linha continua com o `email`
    //   `@unique` → `findByEmail` do repositório filtra soft-deleted → o
    //   pré-check do use-case diz "livre" → o `create` estoura P2002 →
    //   o `catch` sem binding virava `ConcurrencyException(0, null)` → 412.
    //
    // 412 é conflito de VERSÃO. A tela tradutor de 409 `EMAIL_IN_USE` para o
    // campo `email`; qualquer outro código cai no erro genérico do topo. Então a
    // diferença observável aqui é o LUGAR do erro, não só o texto — e é por
    // isso que este teste afirma a MESMA mensagem do primeiro teste, num estado
    // de banco diferente.
    //
    // Sem este teste, um conserto que devolvesse 200 passaria: o formulário
    // voltaria para a listagem e nenhum outro spec deste arquivo notaria.
    const emailApagado = emailUnico('helena');
    const usuario = await semear(JA_CADASTRADO.nome, emailApagado);
    await apagarUsuario(usuario.id, usuario.version);

    // O apagado some da listagem — senão este teste seria o mesmo do primeiro,
    // com um soft-delete a mais no meio que a tela não sabe que houve.
    expect(await contarUsuarios()).toBe(0);

    await irPara('/users/novo');
    await page.getByLabel('Nome').fill('Outra Pessoa');
    await page.getByLabel('Email').fill(emailApagado);
    await botaoEnviar(page).click();

    // O ponto do teste: o erro é NO CAMPO, como no email ocupado por um usuário
    // ativo. Se a API voltar 412 (ou qualquer coisa que não seja
    // `EMAIL_IN_USE`), a Server Action joga no topo e esta asserção falha.
    await expect(erroDoCampo(page, 'email')).toHaveText('Este email já está cadastrado.');
    await expect(page).toHaveURL(/\/users\/novo$/);
    expect(await contarUsuarios()).toBe(0);
  });
});
