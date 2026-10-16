// apps/web/e2e/support/rbac.ts
//
// Semente de perfis para os fluxos `/admin/*` (F9–F12).
//
// ⚠️ SEGUNDA EXCEÇÃO à regra de `dados.ts` ("tudo pela API HTTP pública,
// nunca pelo banco direto"). A primeira é `limparBase()`; esta é a segunda, e
// ela é FORÇADA pelo produto, não escolhida:
//
//   Não existe rota HTTP que crie um profile `isAdmin`. O campo não aparece em
//   DTO nenhum, o `CreateProfileInputDto` ignora o que vier no body, e o
//   `page.tsx` de `/admin/profiles/new` nem oferece o input. Decisão do #97
//   ("isAdmin só via seed"). Consequência medida: sem semear `isAdmin` pelo
//   banco, `obterMeuPerfil()` devolve `isAdmin: false` para TODO mundo, as 4
//   telas admin caem no ramo "Acesso restrito" e os specs medem uma tela de
//   erro repetida 4 vezes — verde sobre quatro arquivos que não medem o que o
//   inventário promete.
//
// A verificação continua pela API (os specs conferem por `GET`), que é onde a
// propriedade do cabeçalho de `dados.ts` vale. O banco entra só para PRODUZIR
// estado que a aplicação proíbe produzir por fora.
//
// 📌 Semear DENTRO do teste, nunca em `globalSetup` ou `beforeEach`: a fixture
// `baseLimpa` é `auto` e trunca `profiles`/`users`/`authorizations` antes de
// qualquer teste. Semeado antes, o pré-requisito morre no primeiro `beforeEach`.

import { PrismaClient } from '../../../api/test/testcontainers-helper.js';
import { exigirEstado } from './estado';
import { emailUnico, parDeTokens, semearUsuario, SENHA_DE_TESTE, type ParDeTokens } from './dados';

let prisma: PrismaClient | undefined;

function prismaDoE2E(): PrismaClient {
  prisma ??= new PrismaClient({ datasourceUrl: exigirEstado().databaseUrl });
  return prisma;
}

/** Cria um profile direto no banco e devolve o id (UUID). */
export async function semearPerfil(
  slug: string,
  chaves: readonly string[] = [],
  flags: { isAdmin?: boolean; isSystem?: boolean } = {},
): Promise<string> {
  const criado = await prismaDoE2E().profile.create({
    data: {
      slug,
      name: slug,
      isAdmin: flags.isAdmin ?? false,
      isSystem: flags.isSystem ?? false,
    },
    select: { id: true },
  });
  if (chaves.length > 0) {
    await prismaDoE2E().authorization.createMany({
      data: chaves.map((permissionKey) => ({ profileId: criado.id, permissionKey })),
    });
  }
  return criado.id;
}

export interface SessaoComPerfil {
  email: string;
  id: string;
  tokens: ParDeTokens;
}

/**
 * Conta real (`POST /users`, o mesmo caminho do F2) ligada a um profile, com
 * token real de `POST /auth/login`.
 *
 * ⚠️ A LIGAÇÃO vem ANTES do login, e a ordem é o comportamento, não estilo:
 * o `JwtAuthGuard` hidrata `isAdmin`/permissões no primeiro request e depois
 * serve de cache (5s). Logar antes de ligar produziria um token certo com
 * claims de um perfil que ainda não existia — e a tela mostraria "Acesso
 * restrito" por um motivo que nenhum spec conseguiria explicar.
 *
 * ⚠️ A conta NÃO é soft-deleted (ao contrário da conta de sessão de
 * `dados.ts`): `GET /me/profile` resolve o usuário no banco, e um soft-delete
 * faria a tela cair em "Acesso restrito" por falta de sessão, não por falta de
 * `isAdmin` — o mesmo sintoma, causa oposta.
 */
export async function semearContaComPerfil(
  nome: string,
  perfilId: string,
): Promise<SessaoComPerfil> {
  const email = emailUnico('admin');
  const conta = await semearUsuario(nome, email);

  await prismaDoE2E().user.update({ where: { id: conta.id }, data: { profileId: perfilId } });

  return { email, id: conta.id, tokens: await parDeTokens(email, SENHA_DE_TESTE) };
}

/**
 * Admin de verdade: profile `isAdmin`, conta ligada, tokens válidos.
 *
 * Admin nasce SEM permissões porque `isAdmin` é bypass total no guard
 * (`UserProfileCacheService`): as telas admin verificam `me.isAdmin`, não a
 * lista de chaves. Semeá-lo com as três chaves `admin.manage-*` seria medir
 * um caminho que a aplicação não usa.
 */
export async function semearAdmin(): Promise<SessaoComPerfil> {
  const perfilId = await semearPerfil('e2e-admin', [], { isAdmin: true });
  return semearContaComPerfil('Admin E2E', perfilId);
}

/**
 * Ator NÃO-admin com as três chaves de gestão — o "quase admin".
 *
 * Existe para o par RECUSA/LIBERDADE do gate de front: com estas chaves o
 * `PermissionsGuard` da API LIBERA, e mesmo assim `app/admin/*` exige
 * `me.isAdmin` e mostra "Acesso restrito". É a duplicação deliberada
 * documentada no `app/admin/profiles/page.tsx`, e sem este seed o gate de front
 * é indistinguível do gate da API.
 */
export async function semearQuaseAdmin(): Promise<SessaoComPerfil> {
  const perfilId = await semearPerfil('e2e-quase-admin', [
    'admin.manage-profiles',
    'admin.manage-authorizations',
    'admin.manage-users',
  ]);
  return semearContaComPerfil('Quase Admin E2E', perfilId);
}
