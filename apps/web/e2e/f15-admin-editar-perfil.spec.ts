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

import { expect, plantarSessao, test } from './support/fixtures';
import { prismaE2E } from './support/dados';
import { semearContaComPerfil, semearPerfil } from './support/rbac';
import { exigirEstado } from './support/estado';

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

  test('espaços em volta aparam para vazio — o `.trim()` que impede gravar o invisível', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    const slug = 'perfil-f15-espacos';
    const id = await semearPerfil(slug, []);

    await irPara(`/admin/profiles/${slug}`);
    await page.locator('input[name="description"]').fill('   ');
    await page.getByRole('button', { name: 'Salvar metadados' }).click();

    // A espera é pelo BANCO pelo mesmo motivo do caso anterior: o `name` não
    // muda, então não existe estado de tela para esperar.
    //
    // ⚠️ ESTE CASO SÓ TEM DENTE ENQUANTO O `fill('   ')` SOBREVIVER. O caso
    // acima também afirma `.toBe('')` no banco, e a diferença entre os dois fica
    // SÓ no `fill` — que o `expect.poll` não lê. Trocar por `fill('')` deixa
    // este caso VERDE com o `.trim()` removido de `[slug]/page.tsx:94`, porque
    // `''` sem trim ainda dá `''`.
    //
    // O motivo do `.trim()` está em `page.tsx:89-92`: sem ele o admin "limpa" o
    // campo e grava `" "`, que é invisível em todo render — o estado que a
    // tela não denuncia e que o caso do `''` sozinho não alcançava.
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

  test('ator SEM nenhuma chave admin.* não alcança o formulário, e a API também recusa', async ({
    irPara,
    page,
  }) => {
    // O ator que NINGUÉM spec usava contra `/admin/*`.
    //
    // F9/F10/F11/F12/F14 medem a recusa com `semearQuaseAdmin()`, que tem as
    // TRÊS chaves `admin.manage-*`: ele PASSA no `PermissionsGuard` da API e é
    // barrado só pelo `me.isAdmin` do front. A duplicação é deliberada e está
    // documentada — mas ela deixa uma premissa sem prova: que a API também
    // recusaria quem não tem chave nenhuma. Essa afirmação vivia só em prosa
    // (cabeçalho de F9, `app/admin/profiles/page.tsx:6-11`).
    //
    // O par é o que fecha: se só a tela mudasse, o ator sem chave veria o
    // formulário; se só a API mudasse, ele veria "Acesso restrito" e o PATCH
    // dele passaria. Nenhum dos dois verdes sozinho prova a fronteira.
    const slug = 'perfil-f15-indesejado';
    const id = await semearPerfil(slug, ['users.read']);
    // Perfil COMUM de propósito: sem `isAdmin` e sem nenhuma chave `admin.*`.
    const comum = await semearContaComPerfil('Pessoa Comum', id);
    await plantarSessao(page, comum.tokens);

    await irPara(`/admin/profiles/${slug}`);

    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    // O formulário INTEIRO, não só o slug: `input[name="name"]` é o que o
    // admin usaria para gravar. Sem esta linha um gate que barrasse a página
    // mas deixasse o form renderizado passaria.
    await expect(page.locator('input[name="name"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salvar metadados' })).toHaveCount(0);
    // E o slug, que é o dado que a tela promete não entregar.
    await expect(page.locator('main code')).toHaveCount(0);

    // A metade da API. Sem ela, um gate de tela que recusa todo mundo
    // continua verde com a API aberta para qualquer sessão — e essa é a
    // fronteira que de fato protege o dado.
    const { apiBaseUrl } = exigirEstado();
    const resposta = await page.request.patch(`${apiBaseUrl}/admin/profiles/${id}`, {
      headers: { authorization: `Bearer ${comum.tokens.accessToken}` },
      data: { name: 'Renomeado por quem nao pode' },
    });
    expect(resposta.status()).toBe(403);

    // E o banco confirma que a recusa não foi só visual: o nome segue o de
    // `semearPerfil`, que é o próprio slug.
    const guardado = await prismaE2E().profile.findUniqueOrThrow({ where: { id } });
    expect(guardado.name).toBe(slug);
  });

  test('slug inexistente é 404 — o `notFound()` da rota, que é alcançável', async ({
    appUrl,
    comoAdmin,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    // Nenhum spec chega aqui: as seis navegações para `/admin/profiles/<slug>`
    // da suíte (F11×3, F15×3 antes deste) vão todas para um slug semeado.
    //
    // E o ramo é ALCANÇÁVEL, ao contrário do que o comentário em
    // `lib/perfil.ts:180-187` sugere ao dizer que o `notFound()` "não é
    // alcançável hoje": ele fala do `Promise.all` correr com o catálogo. Para
    // o ADMIN, `listarPermissoes()` resolve — o `isAdmin` é bypass — e o
    // `Promise.all` completa com `profile === null`.
    //
    // `page.goto` e não `irPara`: a afirmação abaixo é pelo STATUS, e é o
    // `goto` que devolve o `Response`. `irPara` faz o mesmo `goto` e joga a
    // resposta fora — usar os dois era navegar duas vezes para ler o status
    // só na segunda.
    const resposta = await page.goto(appUrl('/admin/profiles/slug-que-nao-existe'));

    // O 404 default do Next, porque o app não tem `not-found.tsx` (MEDIDO:
    // `find apps/web/app -name 'not-found*'` → vazio). A afirmação é pelo
    // STATUS, não pelo texto: o texto é o do Next e muda de versão para
    // versão, e um spec que dependesse dele reprovaria numa upgrade.
    expect(resposta?.status()).toBe(404);
    // E o formulário não aparece: um 404 que renderizasse o form de edição
    // deixaria o admin gravando num perfil que não existe.
    await expect(page.locator('input[name="name"]')).toHaveCount(0);
  });
});
