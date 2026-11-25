# Notas do BC `profiles` — modelo de dados e armadilhas

> Documento irmão de [`profiles.md`](./profiles.md) (a referência do **contrato
> HTTP** do BC `profiles`). O que mora aqui é o **modelo** (as tabelas, as
> políticas de banco) e as **armadilhas** do domínio — o que não é contrato de
> rota, mas é o que impede de escrever o código errado.
>
> A fonte do contrato HTTP continua sendo [`profiles.md`](./profiles.md) e o
> `apps/api/openapi.json` versionado.

## §5. Modelo de dados

Modelos Prisma do BC (`apps/api/prisma/schema.prisma`):

| Model | Tabela | Papel |
|-------|--------|-------|
| `Profile` | `profiles` | o perfil. `slug`, `name`, `description`, `tenantId` (nulo = perfil global), `isAdmin` (bypass total), `isSystem` (congelado). Sem soft-delete |
| `Authorization` | `authorizations` | "perfil TEM a permissão X". `@@unique([profileId, permissionKey])` |

⚠️ **O `slug` do perfil NÃO tem `@unique` no Prisma.** A unicidade vem de **dois
índices parciais em SQL puro** (migration
`20261017000000_tenant_membership_invitation`): `profiles_slug_global_uniq`
(`slug` onde `tenant_id IS NULL`) e `profiles_tenant_slug_uniq`
(`tenant_id`+`slug` onde `tenant_id IS NOT NULL`). O motivo: no Postgres
`NULL != NULL`, então um `@@unique([tenantId, slug])` deixaria o seed duplicar o
`admin` global em silêncio.

⚠️ **As duas colunas de vínculo do perfil.** `users.profile_id` é o bucket GLOBAL (o
perfil de sistema do seed); `tenant_memberships.profile_id` é o perfil **daquela
empresa** — é o que a Fase 4 passou a ler. O hard-delete é protegido pela contagem
de usos (§6).

⚠️ **O que a RLS implica.** `profiles` tem `ENABLE ROW LEVEL SECURITY` e as
policies comparam `tenant_id` com o escopo da sessão (`no_escopo_atual(...)`,
migration `20261020000000_rls_isolation_empresa`). A leitura "todos os perfis" só
devolve a base inteira na **credencial de sistema**. E a RLS **não** fecha a
escalada no caminho do bucket global: sob o escopo `'*'` a policy aceita qualquer
`profile_id` — quem fecha é a trava de escalada da aplicação.

## §6. Notas e armadilhas

⚠️ **Um perfil `isSystem: true` é intocável.** `PATCH` e `DELETE` devolvem
`403 PROFILE_SYSTEM_PROTECTED`. O trio `gerente`/`coordenador`/`funcionario` que
toda empresa nasce com é criado **congelado** (`isSystem: true`) — é o CATÁLOGO,
e uma empresa que apaga o seu `coordenador` deixa de ter os três perfis que toda
empresa tem. Quem precisa de um papel sob medida cria um perfil
(`POST /admin/profiles`) e ajusta esse.

⚠️ **Um perfil `isAdmin: true` também é intocável** — `403 PROFILE_ADMIN_PROTECTED`
no `PATCH` e no `DELETE`. E só um ator com `isAdmin` pode **vestir** um perfil
admin. O campo `isAdmin` que a listagem devolve é o bypass total do
`PermissionsGuard`, lido do perfil e não do `Authorization`: um perfil `isAdmin`
sem nenhuma autorização continua passando em tudo.

⚠️ **`DELETE` só passa com ZERO usos.** A trava soma as **duas** contagens —
`users.profile_id` (bucket global) e `tenant_memberships.profile_id` (por empresa) —
e devolve `409 PROFILE_HAS_USERS` se houver algum. Sem a segunda contagem, a
trava passaria e o `ON DELETE RESTRICT` do banco estouraria `P2003` — `500` onde
o certo é `409`.

⚠️ **Dentro da empresa ninguém altera o próprio perfil** (nem para vestir outro,
nem para tirar o que tem) — `403 PRIVILEGE_ESCALATION`. O motivo é a
irreversibilidade: `emitirConvite` grava `role: 'member'` fixo, então não existe
rota que devolva `gerente` a ninguém. Fora da empresa (`X-Tenant-Id` ausente) a
regra não se aplica.

⚠️ **`PUT /admin/users/{id}/profile` escreve em coluna diferente conforme o
header.** Com `X-Tenant-Id`, grava `tenant_memberships.profile_id`; sem header,
grava `users.profile_id`. Sem header, um ator não-admin com
`admin.manage-users` desligava o perfil `isAdmin` do root — hoje o `403` sai
antes. E **o motivo da escalada não vai para o corpo**: a
`ProfilePrivilegeEscalationException` o carrega no campo `motivo`, que é o que
o log lê — o `detail` do RFC 7807 sai com o **nome da classe**, porque dizer
qual regra impediu a escalada é mapear o sistema.
