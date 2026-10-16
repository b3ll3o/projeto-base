// FLUXO: F9 — Listagem de perfis (admin)
// Cobre: o admin vê a tabela de perfis; um ator que PASSA pelo guard da API e
// mesmo assim não chega na tela.
//
// pt-BR — o que este fluxo segura.
//
// `/admin/profiles` faz DUAS checagens que não são a mesma: `obterMeuPerfil()`
// no front e, lá atrás, `PermissionsGuard`. A primeira é mais ESTRITA — exige
// `isAdmin`, não a chave `admin.manage-profiles`. A duplicação é deliberada
// (está no cabeçalho do `page.tsx`), e é por isso que este fluxo tem dois
// testes que precisam ser lidos juntos:
//
//   1. Admin de verdade → tabela.
//   2. "Quase admin" (as TRÊS chaves `admin.manage-*`, que o guard da API
//      LIBERA) → "Acesso restrito".
//
// Sem o segundo, o primeiro passa sozinho com qualquer sessão — inclusive a
// do harness, que não tem perfil nenhum. E sem o primeiro, o segundo passa
// com uma tela que recusa todo mundo, que é o que a API sozinha já faria.

import { expect, plantarSessao, test } from './support/fixtures';
import { semearPerfil, semearQuaseAdmin } from './support/rbac';

test.describe('F9 — Listagem de perfis (admin)', () => {
  test('admin vê os perfis semeados na tabela', async ({ comoAdmin, irPara, page }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    await semearPerfil('leitor', ['users.read']);
    await semearPerfil('escritor', ['users.read', 'users.write'], { isSystem: true });

    await irPara('/admin/profiles');

    await expect(page.getByRole('heading', { name: 'Perfis de acesso' })).toBeVisible();
    const linhas = page.locator('main table tbody tr');
    // O contentamento: os DOIS perfis semeados aparecem. Um slug solto na
    // página passaria num `toHaveText` do `<main>` inteiro sem provar que a
    // LISTAGEM renderiza.
    await expect(linhas.filter({ hasText: 'leitor' })).toHaveCount(1);
    await expect(linhas.filter({ hasText: 'escritor' })).toHaveCount(1);
    // E o conteúdo da célula, não só o slug: as flags e a contagem são o que
    // a tela promete entregar. A ordem das colunas é a do `<thead>` do
    // `page.tsx` — Slug · Nome · Admin? · Sistema? · Permissões.
    const leitor = linhas.filter({ hasText: 'leitor' });
    await expect(leitor.getByRole('cell').nth(2)).toHaveText('—'); // Admin?
    await expect(leitor.getByRole('cell').nth(4)).toHaveText('1'); // Permissões
    const escritor = linhas.filter({ hasText: 'escritor' });
    await expect(escritor.getByRole('cell').nth(3)).toHaveText('✅'); // Sistema?
    await expect(escritor.getByRole('cell').nth(4)).toHaveText('2');
  });

  test('quem tem as TRÊS chaves admin.* mas não é admin vê "Acesso restrito"', async ({
    page,
    irPara,
  }) => {
    // A RECUSA que é o motivo do fluxo existir. Este ator PASSA no
    // `PermissionsGuard` da API (as três chaves estão lá) e é barrado só pelo
    // `me.isAdmin` do front — que é a duplicação que o `page.tsx` declara em
    // comentário. Se a tela passasse a mostrar a tabela aqui, a afirmação
    // "duplicada de propósito" seria falsa e ninguém veria.
    const quase = await semearQuaseAdmin();
    await plantarSessao(page, quase.tokens);

    await irPara('/admin/profiles');

    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Perfis de acesso' })).toHaveCount(0);
    // O conteúdo: a tabela inteira é o dado que não pode ter vazado.
    await expect(page.locator('main table')).toHaveCount(0);
  });
});
