# ADR-0005: RBAC por perfil (Profile + Authorization + `isAdmin`)

- **Status:** Aceito
- **Data:** 2026-10-29
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [`../superpowers/plans/2026-10-16-multi-tenant-plan.md`](../superpowers/plans/2026-10-16-multi-tenant-plan.md) · [`../superpowers/plans/2026-10-19-admin-editar-perfil.md`](../superpowers/plans/2026-10-19-admin-editar-perfil.md)
- **ADR anterior:** [`0004-tenancy-multi-empresa.md`](./0004-tenancy-multi-empresa.md)
- **ADR seguinte:** [`0006-feature-flags-como-excecao.md`](./0006-feature-flags-como-excecao.md)

## Contexto

O cadastro de usuário nasceu com auditoria de 3 tabelas (ADR-0001) e **sem
autorização**: existia `users`, e qualquer rota que lesse dado de usuário
estava aberta. O primeiro pedido foi "autorização por **funcionalidade**" —
não por papel, não por papel do banco, mas por *o que o ator pode fazer*.

Três ambiguidades precisaram ser fechadas antes de escrever a migration:

1. **O que é um "papel"?** Um rótulo (`admin`, `viewer`) que o código
   interpreta, ou um conjunto de permissões que o banco guarda?
2. **Onde mora a permissão de um ator?** Uma coluna na conta, ou um conjunto
   que pode ser reutilizado e tweaked sem tocar na conta?
3. **Um usuário pode ter papéis diferentes em empresas diferentes?** O ADR-0004
   já decidiu que a conta é global e o vínculo é a membership — então o papel
   efetivo **não pode** morar em `users`.

## Decisão

### 1. `Profile` é o agregado; `Authorization` é a relação dentro dele

Duas tabelas (`apps/api/prisma/schema.prisma`):

- **`profiles`** — o conjunto de permissões. `slug` (canônico, kebab-case),
  `name` (rótulo editável), `description`, `tenantId` (nulo = perfil global),
  `isAdmin`, `isSystem`, `version`.
- **`authorizations`** — a relação "perfil TEM permissão X". Chave única
  `(profile_id, permission_key)`, e a permissão é uma string de pontos
  (`users.read`, `admin.manage-profiles`).

`Authorization` **não** tem agregado próprio: é value object dentro de
`Profile`. O ciclo é `profile.adicionarAutorizacao(chave, agora)` /
`removerAutorizacao`, que bumpam `version` e emitem evento.

### 2. `isAdmin` é bypass total, independente das permissões

`Profile.isAdmin` dá passagem total no `PermissionsGuard` **sem consultar
`authorizations`**. É defesa em profundidade: mesmo que o perfil "admin"
perca todas as `Authorization`, o guard continua deixando passar.

⚠️ E o inverso também é verdade: `isAdmin` **não** é sinônimo de "todas as
permissões". O perfil `gerente` de uma empresa tem `isAdmin: true` e as
permissões do catálogo inteiro, e o `gerente` **não** é administrador do
sistema — o que o distingue é `ehAdministradorDeSistema(ator)`, isto é
`tenantId === null && isAdmin`. Um `isAdmin` de empresa só tem bypass
**dentro da empresa em que o perfil efetivo é o dele**.

### 3. `isSystem` é perfil protegido — não se mexe

`isSystem: true` marca perfil gerenciado por seed/migration **ou pelo
onboarding da empresa** (o trio `gerente`/`coordenador`/`funcionario`). O
agregado lança `ProfileSystemProtectedException` em `deletar()`, e as use
cases recusam `atualizar`, `atribuir` e `revogar` sobre ele. Sem essa trava,
um admin distraído apagaria "admin" e perderia o acesso a si próprio.

**Perfil de sistema é congelado, não editável.** O trio que toda empresa
nasce (`gerente`, `coordenador`, `funcionario`) é `isSystem: true` e **não
muda depois** — o conjunto é o catálogo de
`apps/api/src/modules/tenancy/domain/perfis-da-empresa.ts`, e o
`isSystem: true` é gravado na criação
(`apps/api/src/modules/tenancy/infrastructure/persistence/prisma-tenant-onboarding.repository.ts:353`).
Quem precisa de um papel sob medida **cria um perfil** e ajusta esse.

⚠️ `isAdmin` e `isSystem` **não são repassados do body** em
`POST /admin/profiles`: saíram do contrato de entrada (`CreateProfileInput`
não tem os campos) e `Profile.criar()` grava `props.isAdmin === true` — ou
seja, `false` quando o chamador não passa. Quem os escreve, direto no Prisma,
é o **seed** e o **onboarding da empresa** (que cria o `gerente` com
`isAdmin: true` e o trio com `isSystem: true`) — nunca um endpoint.

### 4. O catálogo de permissões vive em código

`apps/api/src/shared/auth/permissions-catalog.ts` é a fonte da verdade de
**todas** as permission keys — hoje **8** (medido em 2026-10-29):

```bash
sed -n '/^export const PERMISSIONS = \[/,/\] as const;/p' \
  apps/api/src/shared/auth/permissions-catalog.ts | grep -cE "^  '"   # → 8
```

`PermissionKey` é o tipo derivado do array (`(typeof PERMISSIONS)[number]`),
e `isPermissionKey()` é o type guard. Consequência prática: `@RequirePermission('typo')`
não compila, e `Profile.adicionarAutorizacao()` recusa chave fora do catálogo
com `InvalidPermissionKeyException` (400, não 500).

**As permissões não são hierárquicas.** `admin.*` é namespace visual, não
curinga: ter `admin.manage-profiles` **não** dá `admin.audit`. O guard
compara a string exata, e sem match nega (deny-by-default).

### 5. O perfil efetivo é por **membership**, e o global é o fallback

O perfil que um ator veste **naquela empresa** mora em
`tenant_memberships.profile_id`. `users.profile_id` continua existindo — mas
como o **bucket global** (o perfil de sistema do seed, `tenant_id IS NULL`).

A resolução é de um único dono:
`apps/api/src/modules/tenancy/domain/perfil-efetivo.ts` (`temPerfilEfetivo`).
O filtro Prisma (`profile: { OR: [{ tenantId: null }, { tenantId }] }`) mora
na query, e é de propósito: "um filtro que ninguém pode esquecer porque está
no `where`".

⚠️ `null` no bucket de empresa resolve para **zero permissões** — não para o
perfil de sistema. Membership sem perfil atribuído é estado legítimo
(convite aceito, aguardando o admin da empresa).

### 6. `PermissionsGuard` hidrata; `JwtAuthGuard` só lê

O `JwtAuthGuard` publica `req.user.isAdmin` e `req.user.permissions` a partir
de um **cache em processo** (`UserProfileCacheService`, TTL **5 s** — medido
em `apps/api/src/shared/infrastructure/security/user-profile-cache.service.ts`,
`const TTL_MS = 5_000`). A chave é o **par `(tenantId, userId)`**: chavear
só pelo usuário é vazamento horizontal de privilégio — a mesma conta em duas
empresas herdaria o `isAdmin` da anterior.

O cache **não** é produtor do `PermissionsGuard`: ele **hidrata** via
`obterMeuPerfil` (read-through) e escreve de volta em `req.user`. Sem isso,
cache frio ⇒ todo request a uma rota `admin.*` receberia 403, inclusive de
quem tem a permissão — inclusive o admin de `isAdmin`, porque o bypass
depende do `isAdmin` hidratado.

O TTL de 5 s é teto de staleness, não o mecanismo de invalidação: toda
escrita (update de perfil, atribuir/revogar autorização, atribuir perfil a
usuário) invalida o cache.

### 7. As travas de escalada moram na aplicação, e são cinco

O `PermissionsGuard` diz **o que** a rota exige; quem impede o abuso é a
use case. As travas que existem, todas com uma linha de recusa:

| Trava | O que impede |
|---|---|
| `exigePerfilDoEscopo` | ator de empresa administrar perfil de outra |
| `recusaAutoConcessao` | ator sem `isAdmin` alterar as permissões do próprio perfil |
| `recusaConcessaoQueNaoTem` | ator conceder a alguém uma permissão que ele não tem |
| `recusaConcessaoInicial` | ator criar perfil já com permissão que ele não tem |
| R5 (em `atribuirProfileAoUser`) | alguém, dentro da empresa, alterar o próprio perfil |

⚠️ `revogar` **não** passa por `recusaAutoConcessao`: remover permissão nunca
é escalada, e aplicar a mesma trava ali trancaria o ator dentro de um perfil
com concessão indevida que só outro admin poderia desfazer.

⚠️ O subconjunto que o ator concede tem de ser o do perfil que ele veste **na
empresa em que está agindo** — comparar o global deixaria a trava medindo o
perfil errado em toda chamada com `X-Tenant-Id`.

## Consequências

### Positivas

- **Permissão é dado, não código.** Um papel novo nasce de um registro, sem
  deploy. O catálogo é o *vocabulário*, não a *atribuição*.
- **Deny-by-default com erro explícito.** Chave fora do catálogo é recusada na
  fronteira (400), não silenciosamente aceita.
- **Perfil reutilizável e ajustável.** O `coordenador` não tem nada de
  `admin.*` — justamente para não poder se dar `admin.manage-profiles` e
  editar o perfil do gerente.
- **Bypass do `isAdmin` sobrevive à perda de permissões.** Defender em
  profundidade é o que impede que um erro de seed tire o acesso de todos.
- **O perfil efetivo tem um dono.** Uma regra escrita em três lugares
  divergiria em silêncio, e o sintoma (perfil que a API resolve e a tela não)
  é invisível.

### Negativas, e o que fica proibido daqui pra frente

- **`slug` não tem `@unique` no Prisma.** A unicidade são dois índices
  parciais em SQL puro (`profiles_slug_global_uniq` para o global,
  `profiles_tenant_slug_uniq` para o por-empresa). Um `@@unique` novo no
  schema **quebra** uma das duas regras.
- **`Profile` não tem soft-delete.** É config de admin, não dado de negócio:
  hard delete, com `FK ON DELETE RESTRICT` e a contagem explícita
  (`countByProfile` no repositório de usuários **+** `countByProfile` das
  memberships, porque o mesmo perfil pode estar em uso nos dois lugares)
  devolvendo 409 em vez de 500.
- **Proibido: criar `PermissionKey` fora do catálogo.** A chave nasce no
  array de `permissions-catalog.ts`; o type union é derivado dele.
- **Proibido: matcher por prefixo de namespace.** `admin.*` não é curinga, e
  a comparação é por string exata.
- **Proibido: ler `users.profile_id` como perfil de empresa.** A coluna é o
  bucket global; o perfil de empresa é `tenant_memberships.profile_id`.
- **Proibido: escrever `isAdmin`/`isSystem` por endpoint.** `Profile.criar()`
  fixa `false`; só o seed e o onboarding da empresa os escrevem, direto no
  Prisma.
- **Proibido: cachear a autorização.** O `profileCache` é cacheado de
  propósito (5 s de staleness); o **veredito** de membership não é — o que
  limita a revogação à janela do request em voo.
- **O cache é em processo.** Com mais de uma instância, o TTL de 5 s deixa de
  ser um teto uniforme. A decisão de trocar por Redis está anotada no código
  (`user-profile-cache.service.ts`), e é um PR próprio.

### Em aberto

- **O isolamento de `users` é mais caro que o das outras tabelas.** `users`,
  `users_history` e `users_archive` não têm `tenant_id` — o vínculo é a
  membership, e a policy de `users` é o `EXISTS` quantificado sobre
  `tenant_memberships` (`usuario_no_escopo()`), com o `EXISTS` correndo sob a
  RLS de *quem lê*. O desenho foi escolhido na `20261020000001` (a saída (a)
  da `20261020000000` §5); a saída (b) — `REVOKE UPDATE, DELETE` e escrita por
  função — continua fora.
- **A remoção de membro continua sem operação.** A `tenant_memberships` não
  tem `DELETE` de runtime; o que existe é a garantia de que **ninguém
  escreveu**, e ela morre no primeiro endpoint que escrever.

## Alternativas consideradas

- **Papel como rótulo (`role`) com a lógica no código** — rejeitado: o
  rótulo não guarda o que o ator pode fazer, e cada permissão nova viraria
  um `if` no guard. `tenant_memberships.role` sobreviveu, mas como **rótulo
  do vínculo** (`gerente` | `member`) — o que libera convidar — e não como
  autorização fina, que continua em `profiles.authorizations`.
- **Coluna de permissão na conta (`users.permissions`) em vez de perfil** —
  rejeitado: não dá para reutilizar um conjunto nem ajustá-lo sem tocar na
  conta; e com tenancy (ADR-0004) a conta é global, então a permissão
  também seria — e "perfil diferente por empresa" não seria representável.
- **Permissões hierárquicas (`admin.*` como curinga)** — rejeitado: o
  namespace é visual. Com curinga, `admin.manage-authorizations` puxaria
  `admin.manage-profiles` e o `coordenador` escalaria sozinho.
- **`@@unique([tenantId, slug])` no Prisma em vez de dois índices parciais** —
  rejeitado: no Postgres `NULL != NULL`, então dois perfis de sistema com
  `tenant_id` nulo e o mesmo `slug` passariam, e o seed duplicaria `admin` em
  silêncio. `UNIQUE NULLS NOT DISTINCT` (PG 15+) resolveria, mas os índices
  parciais expressam as duas regras sem depender da versão do Postgres.
- **Recuo de permission a partir do código (sem cache)** — a versão inicial
  lia o perfil a cada request. O cache de 5 s entrou por causa do custo
  medido; a contrapartida é o teto de staleness, e ele está anotado.

## Ver Também

- [`../agents/domain.md`](../agents/domain.md) — o índice de decisões
  arquiteturais do repo.
- [`../api/profiles.md`](../api/profiles.md) — contrato HTTP do BC `profiles`.
- [`./0004-tenancy-multi-empresa.md`](./0004-tenancy-multi-empresa.md) — a
  empresa cujo perfil efetivo este ADR resolve.
- [`./0006-feature-flags-como-excecao.md`](./0006-feature-flags-como-excecao.md)
  — a outra forma de desligar comportamento, que **não** é permissão.
