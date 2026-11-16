// FLUXO: F6 — Navegação entre as telas
// Cobre: a home renderiza, o link da listagem leva ao formulário, o
//        "Cancelar" do formulário devolve para a listagem, a tela reflowa a
//        320px (WCAG 1.4.10) e o anel de foco aparece no instante.
//
// pt-BR: este é o primeiro arquivo da suíte de propósito — o caminho mais curto
// do fluxo inteiro.
//
// ⚠️ A versão anterior deste cabeçalho prometia que este arquivo "não precisa de
// banco nem de API" e que, quebrando aqui, "o problema está antes da aplicação".
// MEDIDO 2026-10-08: `grep -n "auto: true" e2e/support/fixtures.ts` → linha 85,
// e `baseLimpa` chama `limparBase()` na linha 82 — as duas frases deste cabeçalho
// são falsas. `limparBase()` faz `GET /users`, então sem API o fixture derruba
// TODOS os testes deste arquivo, inclusive o da home, que não precisa de API
// nenhuma. O sintoma que sobraria ("GET /users respondeu 500" no teste da home)
// aponta para FLUXO e a causa está em BOOTSTRAP: o oposto do que se prometia.
//
// pt-BR (por que a home fica fora do teste de navegação): ela é uma tela
// estática e não tem link para a listagem — o acesso é por URL direta.
// Testar "chegar em / e ver o título" basta; inventar navegação de onde não
// há seria escrever o teste contra o app imaginado, não contra o app.

import { expect, linkCadastrar, test } from './support/fixtures';

test.describe('F6 — Navegação', () => {
  test('a home apresenta o título do projeto', async ({ page, irPara }) => {
    await irPara('/');

    await expect(page.getByRole('heading', { name: 'Projeto Base' })).toBeVisible();
  });

  test('o link da listagem leva ao formulário de cadastro', async ({ page, irPara }) => {
    await irPara('/users');
    await linkCadastrar(page).click();

    await expect(page).toHaveURL(/\/users\/novo$/);
    await expect(page.getByRole('heading', { name: 'Cadastrar usuário' })).toBeVisible();
  });

  test('"Cancelar" no formulário devolve para a listagem', async ({ page, irPara }) => {
    await irPara('/users/novo');
    await page.getByRole('link', { name: 'Cancelar' }).click();

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
    // ⚠️ `<h1>Usuários</h1>` e o link do cabeçalho estão FORA do ternário que
    // escolhe entre erro / vazio / lista (`app/users/page.tsx`), então os dois
    // testes acima passam igualmente no estado de ERRO — que é o que a tela
    // mostra quando o Next não consegue falar com a API. As duas asserções
    // abaixo são o que distingue "voltou para a listagem" de "voltou para uma
    // página que não conseguiu carregar nada".
    await expect(page.getByText('Nenhum usuário cadastrado')).toBeVisible();
    // ⚠️ REGEX, e não a frase exata (MEDIDO 2026-11-16, revisão do PR #168):
    // a mensagem de erro passou a dizer o que a pessoa pode fazer ("Tente de
    // novo em instantes."), e uma asserção de string exata passaria a casar
    // com o texto que ela queria EXCLUIR. O regex casa com o começo da
    // mensagem — que é o estado de erro.
    await expect(page.getByText(/Não foi possível carregar a lista/)).toHaveCount(0);
  });

  /**
   * A 320px, a tela NÃO rola na horizontal (WCAG 1.4.10).
   *
   * ⚠️ MEDIDO 2026-11-16 no Chromium: com o layout `flex` fixo e o `Sidebar`
   * `w-64 shrink-0`, a coluna de conteúdo ficava com 320 − 256 = 64px e a
   * tela rolava na horizontal (`scrollWidth` 393 em `/login`, 437 em
   * `/users/novo`, 378 em `/`). Este teste é a rede de segurança da correção
   * — o chrome colapsa abaixo de `md`, e o conteúdo fica com a largura toda.
   */
  test('a 320px a tela não rola na horizontal', async ({ page, irPara }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await irPara('/login');

    const medida = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(medida.scrollWidth).toBeLessThanOrEqual(medida.clientWidth);
  });

  /**
   * O anel de foco aparece NO INSTANTE — e não transita.
   *
   * ⚠️ A regressão que a revisão achou: `transition-colors` inclui
   * `outline-color`, e o anel passava a SURGIR em 150ms (MEDIDO 2026-11-16).
   * A regra `estilizacao/no-estilizacao-informal` proíbe a combinação — e
   * esta é a MEDIDA, do lado do browser.
   *
   * Os valores são os do token `--color-ring` (`hsl(221 83% 40%)`), medidos
   * no Chromium 1223.
   */
  test('o anel de foco aparece no instante e não transita', async ({ page, irPara }) => {
    await irPara('/login');
    await page.keyboard.press('Tab');

    const anel = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null) throw new Error('sem elemento focado');
      const cs = getComputedStyle(el);
      return {
        outlineColor: cs.outlineColor,
        outlineWidth: cs.outlineWidth,
        outlineOffset: cs.outlineOffset,
        transitionProperty: cs.transitionProperty,
        transitionDuration: cs.transitionDuration,
      };
    });

    expect(anel.outlineColor).toBe('rgb(17, 71, 187)');
    expect(anel.outlineWidth).toBe('2px');
    expect(anel.outlineOffset).toBe('2px');
    // O anel NÃO é uma propriedade que transita: ou ela não está na lista,
    // ou a transição é de duração zero.
    const transitaOAnel =
      anel.transitionProperty.includes('outline-color') && anel.transitionDuration !== '0s';
    expect(transitaOAnel).toBe(false);
  });
});
