// FLUXO: F2 — Cadastro de usuário com sucesso
// Cobre: o envio cria o usuário no backend, redireciona para a listagem, e o
//        usuário criado aparece lá.
//
// pt-BR: este arquivo e o `f3-cadastro-validacao.spec.ts` são um PAR, e vale
// explicar por quê antes de ler qualquer um dos dois.
//
// O modo de falha que a suíte precisa impedir é "a tela diz que o formulário
// recusou, e não grava nada" — mas também o oposto: "a tela diz que gravou, e
// nada foi gravado". Um teste que só olha a mensagem passa nos dois casos.
//
// Por isso F3 afirma que a contagem NÃO sobe, e F2 afirma que ela SOBE — e os
// dois leem a MESMA contagem, pela mesma API pública que a tela consome. F3
// verde com a validação desligada significaria que a barreira não é a que
// segura; F2 vermelho com o redirecionamento quebrado significaria que a
// tela mente. Nenhum dos dois é redundante.

import { expect, botaoEnviar, itensDaLista, test } from './support/fixtures';
import { emailUnico } from './support/dados';

test.describe('F2 — Cadastro com sucesso', () => {
  test('cria o usuário, redireciona para a listagem e mostra o que foi criado', async ({
    page,
    irPara,
    contarUsuarios,
  }) => {
    expect(await contarUsuarios(), 'a listagem deve começar vazia').toBe(0);

    // pt-BR: email por execução. `limparBase()` faz soft-delete e o
    // `email @unique` da linha apagada continua tomado — com literal, o
    // `--repeat-each 2` reprovava e o sintoma era "a tela não cadastrou".
    // Ver `emailUnico`.
    //
    // O código de resposta dessa colisao mudou em 2026-10-08: era 412
    // `CONCURRENCY_CONFLICT`, hoje é 409 `EMAIL_IN_USE` (o `catch` sem binding
    // do `PrismaUserRepository.save` convertia P2002 de email em conflito de
    // versão). A causa do reprovar — a linha apagada segurar o índice — é a
    // mesma.
    const email = emailUnico('carla');

    await irPara('/users/novo');
    await page.getByLabel('Nome').fill('Carla E2E');
    await page.getByLabel('Email').fill(email);
    await botaoEnviar(page).click();

    // O redirecionamento é parte do fluxo, não um detalhe: `redirect()` está
    // FORA do try/catch da Server Action de propósito (NEXT_REDIRECT é uma
    // exceção), e um `try/catch` que a engolisse deixaria a pessoa parada no
    // formulário com o usuário já criado.
    await expect(page).toHaveURL(/\/users$/);

    // pt-BR (MEDIDO): o nome na listagem é um `<div>`, não um heading — ver o
    // mesmo registro em `f1-listagem.spec.ts`. Aqui o escopo é o item da
    // lista, porque o nome também pode aparecer no formulário.
    await expect(itensDaLista(page).getByText('Carla E2E')).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(itensDaLista(page)).toHaveCount(1);

    // A prova de que atravessou o backend, e não só a tela: a API devolve
    // o mesmo usuário. Um `toBeVisible` na lista passaria mesmo se a página
    // renderizasse o que foi digitado a partir de estado local do cliente.
    expect(await contarUsuarios(), 'o usuário tem de existir na API').toBe(1);
  });

  test('o nome é aparado e o email normalizado como a API define', async ({
    page,
    irPara,
    contarUsuarios,
  }) => {
    // pt-BR: a API normaliza `trim().toLowerCase()` no email e colapsa
    // whitespace no nome. O que é digitado aqui discorda do que é gravado em
    // três dimensões ao mesmo tempo — caixa,Espaço nas pontas e espaço no meio
    // — e é a versão GRAVADA que a listagem tem de mostrar.
    const email = emailUnico('diego');
    await irPara('/users/novo');
    await page.getByLabel('Nome').fill('  Diego   E2E  ');
    await page.getByLabel('Email').fill(`  ${email.toUpperCase()}  `);
    await botaoEnviar(page).click();

    await expect(page).toHaveURL(/\/users$/);

    // ⚠️ `exact: true` NÃO é picky-ness, é o que dá a esta asserção o poder de
    // falhar. Sem ele o `getByText` casa por SUBSTRING e sem distinção de
    // caixa (é o default documentado do Playwright), então procurar
    // `diego.e2e.n@example.com` encontraria `DIEGO.E2E.N@EXAMPLE.COM` — que é
    // exatamente o defeito que este teste existe para pegar, normalização
    // ausente. MEDIDO 2026-10-08, `pnpm exec playwright test e2e/f2-cadastro-sucesso.spec.ts`:
    // apagando o `.toLowerCase()` do `Email.create`, o resultado foi
    // **`1 failed | 1 passed`**, e o vermelho é a linha de baixo.
    //
    // O escopo é o item da lista porque o email também aparece no formulário.
    await expect(itensDaLista(page).getByText(email, { exact: true })).toBeVisible();
    // E o nome, que é a outra metade do que a API normaliza.
    //
    // ⚠️ MEDIDO, e é o contrário do que eu esperava: esta asserção NÃO pega a
    // ausência do colapso de whitespace. MEDIDO 2026-10-08,
    // `pnpm exec playwright test e2e/f2-cadastro-sucesso.spec.ts`: removendo o
    // `.replace(/\s+/g, ' ')` do `UserName.create`, o spec segue **`2 passed`**
    // — porque o Playwright normaliza whitespace em TODO casamento de texto,
    // então `Diego   E2E` e `Diego E2E` são a mesma string para ele. E não é um
    // defeito do teste: o HTML também colapsa whitespace ao renderizar, então a
    // diferença não é visível para a pessoa na tela — o e2e não TEM como medir
    // isso. Onde ela é medida é na camada certa, `user-name.vo.spec.ts`, que já
    // afirma `' João   Silva  Santos '` → `'João Silva Santos'`.
    await expect(itensDaLista(page).getByText('Diego E2E', { exact: true })).toBeVisible();

    expect(await contarUsuarios()).toBe(1);
  });
});
