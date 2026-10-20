// FLUXO: F11 — Detalhe de perfil e troca de permissões (admin)
//
// Cobre: as DUAS renderizações de `/admin/profiles/[slug]` — a editável
// (perfil comum, com form) e a somente-leitura (perfil de sistema). O par é o
// que fecha o M1 do #97, cujo sintoma era o botão "Salvar" parecer funcionar
// sobre um perfil que a API recusa alterar.

import { expect, itensDaLista, plantarSessao, test } from './support/fixtures';
import { prismaE2E, emailUnico } from './support/dados';
import { exigirEstado } from './support/estado';
import { semearAdmin, semearContaComPerfil, semearPerfil, semearQuaseAdmin } from './support/rbac';

test.describe('F11 — Detalhe de perfil (admin)', () => {
  test('perfil comum: marca uma permissão, salva, e a tela reflete', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    const slug = 'perfil-editavel';
    await semearPerfil(slug, []);

    await irPara(`/admin/profiles/${slug}`);

    const caixa = page.locator('input[name="permissionKey"][value="users.read"]');
    await expect(caixa).not.toBeChecked();
    await caixa.check();
    // `exact`: a tela ganhou um segundo botão que CONTAÉM "Salvar" (o de
    // metadados, F15), e `getByRole` casa por substring — sem isto, strict
    // mode violation nos DOIS.
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();

    // Sem `reload`: o Server Action responde com a árvore re-renderizada, e
    // recarregar aqui transformaria "a tela mostra o salvo" em "a tela mostra
    // o que está no banco" — verde se o PUT tivesse sido um no-op.
    await expect(page.getByRole('heading', { name: 'Permissões (1)' })).toBeVisible();
    await expect(caixa).toBeChecked();
  });

  test('perfil de sistema: somente leitura, sem form e sem botão', async ({
    comoAdmin,
    irPara,
    page,
  }) => {
    // Fixture sem valor: o que importa é o cookie de admin plantado.
    void comoAdmin;
    const slug = 'perfil-sistema';
    await semearPerfil(slug, ['users.read'], { isSystem: true });

    await irPara(`/admin/profiles/${slug}`);

    await expect(page.getByRole('heading', { name: 'Flags' })).toBeVisible();
    await expect(page.locator('li', { hasText: 'isSystem' })).toHaveText(/✅/);
    // O conteúdo: a tela de sistema lista as permissões COMO TEXTO, num
    // `<ul>` sem input. Afirmar a ausência do checkbox é o que prova que o
    // bloqueio é de renderização — a API, sozinha, recusaria o POST depois.
    await expect(page.locator('input[name="permissionKey"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0);
    await expect(page.locator('li', { hasText: 'users.read' })).toHaveText(/✅/);
  });

  test('quem não é admin vê "Acesso restrito" em vez do perfil', async ({ page, irPara }) => {
    const slug = 'perfil-indesejado';
    await semearPerfil(slug, ['users.read']);
    const quase = await semearQuaseAdmin();
    await plantarSessao(page, quase.tokens);

    await irPara(`/admin/profiles/${slug}`);

    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    // O slug não pode aparecer: ele é o dado que a tela promete não entregar.
    await expect(page.locator('main code')).toHaveCount(0);
  });

  test('desmarcar a permissão a REVOGA, e o ator perde a chave do seu conjunto efetivo', async ({
    irPara,
    page,
    semear,
  }) => {
    // O ramo `remover` de `trocarPermissoes` (`lib/perfil.ts:261-264`) nunca era
    // exercitado: o teste acima marca, e desmarcar não é o caminho inverso do
    // mesmo código — `diffPermissoes` produz a lista `remover`, que vira uma
    // chamada `DELETE .../authorizations/:key` que nenhuma outra spec fazia.
    //
    // Sem ele, "salvar" no F11 provava que a tela escreve, não que a permissão
    // some: um `trocarPermissoes` que só adicionasse deixaria este arquivo
    // inteiro verde com o botão de desmarcar decorativo.
    //
    // ⚠️ `comoAdmin` NÃO é usada aqui: a sessão do ator muda DUAS vezes (pessoa
    // → admin → pessoa) e a fixture planta um cookie só, sem devolver tokens.
    // `semearAdmin()` devolve os tokens e o cookie é replantado por
    // `plantarSessao` a cada troca — sem a colisão de slug `e2e-admin` que uma
    // segunda chamada de `comoAdmin` provocaria.
    const slug = 'perfil-f11-revogar';
    const perfilId = await semearPerfil(slug, ['users.read']);
    const pessoa = await semearContaComPerfil('Pessoa Com Permissão', perfilId);
    // Uma segunda conta é o que dá dente ao "deixou de ver": sem ela o diretório
    // teria uma linha só e a asserção de ausência não distinguiria "perdeu o
    // acesso" de "a lista sumiu".
    await semear('Outra Pessoa', emailUnico('outra'));
    const admin = await semearAdmin();

    // 1. Quem TEM `users.read` vê o diretório inteiro.
    await plantarSessao(page, pessoa.tokens);
    await irPara('/users');
    await expect(itensDaLista(page).getByText('Outra Pessoa')).toBeVisible();

    // 2. O admin desmarca e salva.
    await plantarSessao(page, admin.tokens);
    await irPara(`/admin/profiles/${slug}`);
    const caixa = page.locator('input[name="permissionKey"][value="users.read"]');
    await expect(caixa).toBeChecked();
    await caixa.uncheck();
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Permissões (0)' })).toBeVisible();

    // 3. O banco confirma que a revogação aconteceu de verdade. A tela acima já
    // diria "Permissões (0)" com um diff que mentisse — ela renderiza o que o
    // RENDER mandou, não o que o banco tem.
    await expect
      .poll(async () => await prismaE2E().authorization.count({ where: { profileId: perfilId } }))
      .toBe(0);

    // 4. E o EFEITO no ator: a chave sai do conjunto efetivo DELE, e não só do
    // perfil.
    //
    // ⚠️ O `poll` NÃO é pelo TTL de 5s do `UserProfileCacheService`:
    // `AuthorizationUseCases.revogar` faz `await this.cache.invalidateAll()`
    // (`profiles.use-cases.ts:515`) no MESMO request que revoga, então o cache
    // já nasce limpo na resposta seguinte. O `poll` fica como folga para o caso
    // de réplica/ordem de chegada, e um `waitForTimeout` fixo seria o inverso —
    // acertaria num CI lento e reprovaria num rápido.
    //
    // ⚠️ O que este teste NÃO afirma, e é uma lacuna conhecida e NÃO um
    // descuido: revogar `users.read` NÃO tira a visibilidade do diretório
    // `/users`. `users.controller.ts` só recorta quando
    // `findProfileId(ator, null) === null` — e toda conta com um perfil GLOBAL
    // (`tenant_id IS NULL`, que é o que `semearPerfil` faz) satisfaz o outro
    // lado. MEDIDO 2026-10-20 contra a API acesa, depois de revogar:
    // perfil global sem `users.read` → diretório inteiro (4 linhas);
    // conta sem perfil nenhum → 1 linha, a própria. O recorte existe e
    // funciona; ele é só mais estreito do que o comentário do controller sugere
    // ao escrever "NÃO é admin global e NÃO tem `users.read`" como se fossem
    // condições independentes.
    //
    // Travar o comportamento atual aqui seria fossilizar um bug de segurança
    // como se fosse contrato; não afirmar nada é o que resta. A decisão de
    // mudar a condição é de produto, não de teste.
    const { apiBaseUrl } = exigirEstado();
    await expect
      .poll(
        async () => {
          const r = await page.request.get(`${apiBaseUrl}/me/profile`, {
            headers: { authorization: `Bearer ${pessoa.tokens.accessToken}` },
          });
          // O status ANTES do corpo, e o motivo é o que dá dente a este passo:
          // `ProblemDetailsDto` (`shared-types/src/user.ts:162`) não tem campo
          // `permissions`, então um 401/403/500 devolveria um corpo sem ele — e
          // o `?? []` transformaria QUALQUER erro no `[]` que a asserção logo
          // abaixo exige. O teste passaria por motivo errado, mais rápido ainda,
          // e sem que a revogação tivesse lido algo.
          if (!r.ok()) return `status ${r.status()}`;
          const corpo = (await r.json()) as { permissions?: string[] };
          return corpo.permissions ?? [];
        },
        { timeout: 15_000 },
      )
      .toEqual([]);
    // E o que a tela mostra dessa pessoa é o mesmo conjunto — o `/me/profile`
    // desenhado com a sessão dela, não com a do admin.
    //
    // Âncora POSITIVA, e não `not.toContainText`: um 401 redireciona para
    // `/login` e um 5xx devolve `ServicoIndisponivel()`, e as DUAS telas têm
    // `<main>` sem `users.read` — a negação ficaria verde com a tela errada na
    // tela. Este heading só existe quando o perfil carregou.
    await plantarSessao(page, pessoa.tokens);
    await irPara('/me/profile');
    await expect(page.getByRole('heading', { name: 'Permissões (0)' })).toBeVisible();
  });
});
