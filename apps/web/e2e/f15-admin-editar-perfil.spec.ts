// FLUXO: F15 — Edição dos metadados do perfil (admin)
//
// Cobre `/admin/profiles/[slug]` no eixo que o F11 não toca: o nome e a
// descrição, que viraram formulário (Server Action `salvarMetadados`).
//
// ⚠️ Por que este spec lê o BANCO e não a tela: `input` sem `key` é
// uncontrolled e CONSERVA o que foi digitado mesmo depois do re-render. Um
// `expect(input).toHaveValue('...')` passaria com a gravação inteiramente
// perdida — o valor do atributo nunca foi lido do servidor. A prova é
// `prismaE2E()`, e na tela o que se afirma é o `<h1>`, que é derivado do
// servidor.

import { expect, test } from './support/fixtures';
import { prismaE2E } from './support/dados';
import { semearPerfil } from './support/rbac';

test.describe('F15 — Edição dos metadados do perfil (admin)', () => {
  test('perfil comum: renomeia, descreve, e o banco guarda os dois', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    const slug = 'perfil-f15';
    const id = await semearPerfil(slug, []);

    await irPara(`/admin/profiles/${slug}`);
    await page.locator('input[name="name"]').fill('Editor de conteúdo');
    await page.locator('input[name="description"]').fill('Quem escreve e publica conteúdo');
    await page.getByRole('button', { name: 'Salvar metadados' }).click();

    // Sem `reload` e sem `waitForTimeout`: o `click()` resolve no despacho
    // (MEDIDO 2026-10-18, ver F14 na convenção), e recarregar trocaria "o
    // servidor devolveu o salvo" por "o banco tem o salvo" — verde mesmo com
    // a gravação quebrada, que é o que o banco abaixo existe para provar.
    await expect(page.getByRole('heading', { name: 'Perfil: Editor de conteúdo' })).toBeVisible();

    const guardado = await prismaE2E().profile.findUniqueOrThrow({ where: { id } });
    expect(guardado.name).toBe('Editor de conteúdo');
    expect(guardado.description).toBe('Quem escreve e publica conteúdo');
  });

  test('descrição vazia limpa o campo — "apagar" não é "manter"', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    const slug = 'perfil-f15-limpar';
    const id = await semearPerfil(slug, []);
    // `semearPerfil` não aceita descrição (é helper de 5 specs); o `update`
    // fica local em vez de estender um helper compartilhado por um caso só.
    await prismaE2E().profile.update({
      where: { id },
      data: { description: 'Descrição que tem de sumir' },
    });

    await irPara(`/admin/profiles/${slug}`);
    await page.locator('input[name="description"]').fill('');
    await page.getByRole('button', { name: 'Salvar metadados' }).click();

    // A espera é pelo BANCO, e é a única honesta aqui: o `name` não muda, então
    // não existe estado de tela para esperar, e `waitForTimeout` só mediria o
    // relógio. `expect.poll` relê o Postgres até a escrita aparecer.
    //
    // A mutação que este caso existe para pegar: reintroduzir o
    // `...(description !== '' ? { description } : {})` de `new/page.tsx:57`.
    // O efeito NÃO é "não apagar" — é apagar para `NULL`: o controller omite o
    // campo, `input.description ?? null` vira `null`, `alterarDescricao(null)`
    // roda, e o banco volta `null` em vez de `''`. A tela não denuncia a
    // diferença (o input faz `profile.description ?? ''`), então só a leitura do
    // banco separa as duas — e é por isso que a afirmação é `.toBe('')`, e não
    // "a descrição sumiu". Os outros dois casos deste arquivo seguem verdes
    // sob essa mutação, porque nenhum deles limpa a descrição.
    await expect
      .poll(
        async () => (await prismaE2E().profile.findUniqueOrThrow({ where: { id } })).description,
      )
      .toBe('');
  });

  test('perfil isAdmin: nome e descrição são somente leitura, sem formulário', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    const slug = 'perfil-f15-admin';
    await semearPerfil(slug, ['users.read'], { isAdmin: true });

    await irPara(`/admin/profiles/${slug}`);

    // Escopado na seção de Metadados: "somente leitura" aparece duas vezes na
    // tela quando o perfil também é de sistema, e um locator page-wide
    // quebraria em `strict mode violation`.
    const metadados = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Metadados' }) });
    await expect(metadados.getByText('somente leitura')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salvar metadados' })).toHaveCount(0);
  });
});
