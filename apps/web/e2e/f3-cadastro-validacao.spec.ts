// FLUXO: F3 — Cadastro recusado pela validação do cliente
// Cobre: formulário vazio, email malformado, nome acima do limite, e o foco
//        indo para o primeiro campo inválido.
//
// pt-BR (o que este arquivo mede, e o que ele NÃO conta): ele não conta
// requisições de browser para provar que a API não foi chamada. Não há o que
// contar.
//
// Todo o tráfego de API deste app é SERVER-SIDE — o Server Component de
// `/users` e a Server Action de `/users/novo` leem `API_BASE_URL` no processo
// Node, e o browser nunca fala com a API. Um `page.on('request')` filtrando
// por `3000` casaria vazio em TODOS os cenários, bloqueado e bem-sucedido: o
// teste passaria com a validação desligada. Seria verde por construção —
// pior que não ter teste, porque ocupa o slot da cobertura.
//
// O que os testes medem, então, é o EFEITO: a contagem de usuários não sobe.
//
// ⚠️ MEDIDO em 2026-10-08, e este arquivo estava errado sobre o próprio
// alcance: só o EFEITO não dava dente. Com a validação do cliente desligada,
// os quatro primeiros testes continuaram VERDES — a Server Action revalida com
// o mesmo schema Zod e devolve as mesmas mensagens. O quinto teste existe
// porque disso: ele conta o POST do browser para `/users/novo`, que é o
// despacho da Action, e é a única forma de distinguir "o cliente segurou" de
// "o servidor recusou". O par com `f2-cadastro-sucesso.spec.ts` fecha a cadeia
// do outro lado.

import { expect, alertaDoFormulario, botaoEnviar, erroDoCampo, test } from './support/fixtures';
import type { Page } from '@playwright/test';

/**
 * Rotas para as quais o BROWSER fez POST, a partir de agora.
 *
 * pt-BR (MEDIDO em 2026-10-08, e o que este arquivo estava devendo): o
 * cabeçalho deste arquivo diz que não há o que contar, porque todo o tráfego de
 * API é server-side. Isso é verdade para a API — e FALSO para a Server Action.
 * O despacho de `useActionState` é um POST do BROWSER na própria rota da tela
 * (`/users/novo`), com o header `Next-Action`. Medido nos dois sentidos:
 * barreira do cliente ligada → `[]`; desligada → `["POST …/users/novo"]`.
 *
 * Sem esta medida, os outros quatro testes deste arquivo medem o RENDIZADO da
 * mensagem de erro, e não a barreira: com a validação do cliente desligada eles
 * continuam verdes, porque a Server Action revalida com o mesmo schema Zod e
 * devolve os mesmos `fieldErrors`. Quatro verdes que não afinam do que o
 * arquivo promete.
 */
function rotasPostadasPeloBrowser(page: Page): string[] {
  const rotas: string[] = [];
  page.on('request', (requisicao) => {
    if (requisicao.method() === 'POST') rotas.push(new URL(requisicao.url()).pathname);
  });
  return rotas;
}

test.describe('F3 — Validação no cliente', () => {
  test('formulário vazio mostra a primeira mensagem de cada campo e não grava', async ({
    page,
    irPara,
    contarUsuarios,
  }) => {
    await irPara('/users/novo');
    await botaoEnviar(page).click();

    // pt-BR: o email vazio reprova em DOIS issues do Zod (`min(1)` e
    // `email()`), e o componente mostra só o primeiro — "Informe o email.",
    // não "Email inválido. Exemplo: ...". Afirmar a segunda seria testar um
    // texto que a tela nunca mostra.
    await expect(erroDoCampo(page, 'nome')).toHaveText('Informe o nome do usuário.');
    await expect(erroDoCampo(page, 'email')).toHaveText('Informe o email.');

    await expect(page).toHaveURL(/\/users\/novo$/);
    expect(await contarUsuarios(), 'validação bloqueada não pode gravar').toBe(0);
  });

  test('email malformado é recusado com o exemplo do formato esperado', async ({
    page,
    irPara,
    contarUsuarios,
  }) => {
    await irPara('/users/novo');
    await page.getByLabel('Nome').fill('Elena E2E');
    await page.getByLabel('Email').fill('elena.e2e@');
    await botaoEnviar(page).click();

    // pt-BR: sem ponto final. O texto vem do schema
    // (`cadastro-usuario-schema.ts`) e um `.` a mais aqui passaria a
    // descrever uma mensagem que a tela não tem.
    await expect(erroDoCampo(page, 'email')).toHaveText(
      'Email inválido. Exemplo: nome@empresa.com',
    );
    await expect(erroDoCampo(page, 'nome')).toHaveCount(0);

    expect(await contarUsuarios()).toBe(0);
  });

  test('o foco vai para o primeiro campo inválido', async ({ page, irPara }) => {
    await irPara('/users/novo');
    await page.getByLabel('Nome').fill('Fabio E2E');
    await page.getByLabel('Email').fill('nao-e-email');
    await botaoEnviar(page).click();

    // pt-BR: é para onde a pessoa está olhando depois de apertar o botão. Um
    // campo genérico perderia o teclado de quem navega por ele.
    await expect(page.getByLabel('Email')).toBeFocused();
    await expect(page.getByLabel('Nome')).not.toBeFocused();
  });

  test('o campo nome não aceita mais de 120 caracteres — o limite é do formulário', async ({
    page,
    irPara,
    contarUsuarios,
  }) => {
    await irPara('/users/novo');
    await page.getByLabel('Nome').fill('G'.repeat(121));

    // MEDIDO em 2026-10-08 no Chrome, e a versão anterior deste teste
    // afirmava o contrário. `fill()` NÃO escreve o valor direto no DOM: ele
    // passa por `Input.insertText`, e o browser APLICA o `maxlength`. Com
    // `maxLength={NOME_MAX}` no input, `inputValue()` devolveu **120** para as
    // 121 teclas. A versão anterior preenchia 121 e esperava a mensagem do
    // Zod falhava com "element(s) not found" — uma falha que parece "a
    // validação não rodou", e era o valor que nunca chegou ao schema.
    //
    // O que sobra de observável é o atributo, e ele é real: é o que impede a
    // pessoa de digitar o 121º caractere. O `.max(120)` do Zod fica
    // INALCANÇÁVEL pela tela — o atributo barra antes — e quem o exercita de
    // verdade é o F5, com 110 caracteres (abaixo de 120, acima do VO de 100).
    await expect(page.getByLabel('Nome')).toHaveValue('G'.repeat(120));
    await expect(page.getByLabel('Nome')).toHaveAttribute('maxlength', '120');

    // E nada foi gravado: o limite age antes de qualquer envio.
    expect(await contarUsuarios()).toBe(0);
  });

  test('a mensagem de erro fica dentro do formulário, não solta na página', async ({
    page,
    irPara,
  }) => {
    await irPara('/users/novo');
    await botaoEnviar(page).click();

    // pt-BR: `page.locator('[role="alert"]')` na PÁGINA INTEIRA devolve três
    // elementos, um deles vazio — é a live-region do Next. Sem o escopo, a
    // contagem aqui seria 3 e o teste passaria por uma razão que não é a
    // que ele mede.
    await expect(alertaDoFormulario(page)).toHaveCount(2);
  });

  test('a barreira é do cliente: a Server Action nem chega a ser chamada', async ({
    page,
    irPara,
    contarUsuarios,
  }) => {
    const rotas = rotasPostadasPeloBrowser(page);

    await irPara('/users/novo');
    await botaoEnviar(page).click();
    await expect(erroDoCampo(page, 'nome')).toBeVisible();

    // A janela antes da asserção negativa. Sem ela, "nenhum POST" também é o
    // que se observa nos primeiros milissegundos de um fluxo que POSTARIA
    // depois — o teste passaria por não ter esperado, e não por medida.
    await page.waitForTimeout(500);

    expect(
      rotas,
      'a validação do cliente precisa segurar ANTES de despachar a Action — ' +
        'é o que separa "o navegador não saiu" de "o servidor recusou"',
    ).toEqual([]);
    expect(await contarUsuarios()).toBe(0);
  });
});
