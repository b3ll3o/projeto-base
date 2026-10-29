# ADR-0004: Tenancy multi-empresa (membership + escopo de banco + RLS)

- **Status:** Aceito
- **Data:** 2026-10-29
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [`../superpowers/plans/2026-10-16-multi-tenant-plan.md`](../superpowers/plans/2026-10-16-multi-tenant-plan.md) · [`../superpowers/plans/2026-10-21-onboarding-empresa.md`](../superpowers/plans/2026-10-21-onboarding-empresa.md)
- **ADR anterior:** [`0003-backends-locais-de-telemetria.md`](./0003-backends-locais-de-telemetria.md)
- **ADR seguinte:** [`0005-rbac-por-perfil.md`](./0005-rbac-por-perfil.md)

## Contexto

O produto passou a servir **várias empresas** na mesma instalação. A conta é
global — `users.email` é `UNIQUE` e o login resolve por e-mail —, mas cada
empresa tem seus próprios dados, seus próprios membros e seus próprios
perfis. A decisão estrutural (D4 do plano) é: **uma conta, N empresas**, e o
vínculo mora em `tenant_memberships`, não em uma coluna `tenant_id` na conta.

Isso cria três problemas que não têm solução só na aplicação:

1. **Qual empresa a requisição está falando?** O token carrega identidade, não
   contexto de empresa — trocar de empresa dentro da mesma sessão não é trocar
   de token.
2. **O que impede uma sessão de ler a empresa vizinha?** Um `where` num
   repositório protege enquanto o código estiver certo. A camada de banco
   protege quando o código errar.
3. **Quem enxerga tudo?** O administrador do sistema precisa atravessar
   empresas, e essa exceção não pode ser um valor que a sessão escolhe.

O item 3 é o que restringe todo o resto: **com uma credencial só, qualquer
coisa que a sessão possa escolher, o atacante escolhe.**

## Decisão

### 1. O contexto vem do header `X-Tenant-Id`, não do token

`JwtAuthGuard` lê `X-Tenant-Id` e publica `req.user.tenantId`
(`apps/api/src/modules/auth/infrastructure/http/jwt-auth.guard.ts`). O header
é **opcional**: ausente → `null` (bucket global); presente e malformado →
`400 INVALID_TENANT`; presente e a conta não pertence à empresa →
`403 TENANT_MEMBERSHIP_REQUIRED`.

A membership é conferida **a cada request** e o veredito **não é cacheado** —
o cache de 5 s do perfil carrega `isAdmin`/`permissions`, nunca a autorização.
A garantia que sobra é o *request em voo*, não o TTL.

### 2. O escopo de banco é um GUC de sessão, escrito num único lugar

`apps/api/src/shared/infrastructure/prisma/escopo.ts` é o **único** escritor do
parâmetro `app.tenant_id` (`PARAMETRO_DE_ESCOPO`). Três helpers, três
escopos:

| Helper | Credencial | GUC | Para quê |
|---|---|---|---|
| `comEscopo(prisma, escopo, fn)` | a que o chamador trouxer | o `escopo` | escopo explícito |
| `comEscopoDeSistema(fn)` | `app_system` (`SYSTEM_DATABASE_URL`) | `'*'` | bucket de sistema |
| `comEscopoDeEmpresa(prisma, tenantId, fn)` | **escolhida pelo `tenantId`** | `tenantId` ou `'*'` | o caminho normal |

`comEscopoDeEmpresa` é a regra: **`tenantId` nulo é o bucket de sistema, e o
bucket de sistema é a credencial de sistema.** O chamador não decide com que
credencial abre — e não pode decidir errado.

O GUC é sempre escrito **dentro de `$transaction`** (`set_config(..., true)`):
com `false` o parâmetro vaza no pool e a requisição seguinte herda o escopo da
anterior. `abrirEscopo` normaliza para minúsculas, porque o Postgres
canoniza `uuid` para minúsculas e a policy compara por texto — um escopo em
caixa alta não casa com nada, e o efeito é **zero linhas**, não erro.

### 3. A RLS é a segunda linha — e ela só vale com a conexão certa

`apps/api/prisma/schema.prisma` separa `url` (a **aplicação**, papel
`app_runtime`) de `directUrl` (o **dono**, que o CLI do Prisma usa). As
policies valem para quem conecta por um papel comum: `app_runtime` é
`NOSUPERUSER NOBYPASSRLS`.

**9 tabelas** têm `ENABLE ROW LEVEL SECURITY` e existem **29 policies**
distintas — 30 declarações `CREATE POLICY`, das quais uma recria
`users_insercao` (descartada e refeita pela `20261027000001`, que trocou o GUC
pela credencial) (medido em 2026-10-29):

```bash
grep -rh "ALTER TABLE .* ENABLE ROW LEVEL SECURITY" \
  apps/api/prisma/migrations/*/migration.sql | awk '{print $3}' | sort -u | wc -l   # → 9
grep -rh "^CREATE POLICY" apps/api/prisma/migrations/*/migration.sql \
  | awk '{print $3}' | sort -u | wc -l                                              # → 29
grep -rh "^CREATE POLICY" apps/api/prisma/migrations/*/migration.sql | wc -l       # → 30
```

Sem escopo definido, a sessão é **fail-closed**: `no_escopo_atual()` exige
`escopo_atual() IS NOT NULL`, então uma rota nova que esqueça de abrir o
escopo devolve **zero linhas**, não dado de outra empresa.

### 4. O bucket de sistema é uma CREDENCIAL, não um valor de GUC

O `'*'` continua sendo o valor que a aplicação escreve, mas **ele não concede
nada sozinho**. Quem concede é `current_user = 'app_system'`
(`migrations/20261027000001_papel_de_sistema/migration.sql`). A medição é
a do próprio código — `apps/api/src/shared/infrastructure/prisma/escopo.ts`
registra o resultado no Postgres 16 real, com a migration `20261027000001`
aplicada:

```text
sessão de RUNTIME, escopo '*'  ->  empresas=0  usuarios=0
sessão de SISTEMA, escopo '*'  ->  empresas=2  usuarios=1
```

`app_runtime` **não** é membro de `app_system` — se fosse, um `SET ROLE`
bastaria e o furo voltaria pela porta dos fundos. `app_system` é um papel
comum (`NOSUPERUSER NOBYPASSRLS`), com os mesmos privilégios de tabela do
runtime: a diferença é **a credencial**, e só ela.

O dono do schema (`DIRECT_DATABASE_URL`) é superuser e ignora RLS por
construção. Ele continua existindo — migrar e semear exigem `CREATE ROLE`,
`ENABLE ROW LEVEL SECURITY` e `GRANT`, que um papel sem `BYPASSRLS` não pode
aplicar.

### 5. A credencial da membership é escrita por uma função assinada

`tenant_memberships` é a **credencial** que a RLS de `users` mede: quem é
membro da empresa do escopo é quem o `EXISTS` de `usuario_no_escopo()` acha.
Logo, poder escrever nessa tabela é poder fabricar autorização.

Por isso: `REVOKE INSERT ON tenant_memberships FROM app_runtime` e a escrita
passa por `criar_membership()` — `SECURITY DEFINER`, `search_path` fixado, e
**assinatura HMAC-SHA256** conferida na hora do insert. O segredo mora em
`chaves_de_assinatura`, tabela que o runtime **não lê** (`REVOKE ALL`) e que
tem RLS ligada **sem policy** — o fail-closed do Postgres: mesmo com o
privilégio de volta, quem não for o dono lê zero linhas.

O `UPDATE` é por coluna (`GRANT UPDATE (profile_id, updated_at)`) e o `DELETE`
foi retirado inteiro — não há consumidor. O lado Node do contrato está em
`apps/api/src/shared/infrastructure/prisma/assinatura-de-membership.ts`.

### 6. O guard de boot recusa credencial exposta e placeholder

`verificarCredenciaisDoBanco()`
(`apps/api/src/shared/infrastructure/prisma/credenciais-do-banco.ts`) roda
**antes de conectar** e recusa:

- senha do runtime na denylist (a que o repositório já publicou) ou com
  prefixo de exemplo (`change_me`, `***`);
- `SYSTEM_DATABASE_URL` ausente — **em qualquer ambiente que não seja
  `development`**. É default-deny: `prod`, `staging` e `NODE_ENV` ausente
  passariam, a API subiria, e o primeiro login estouraria 500.

A senha dos papéis **não está em migration**: a migration cria o papel
`NOLOGIN` e o setup aplica a senha a partir do ambiente. Uma migration não lê
env — foi por isso que a senha do runtime ficou versionada em texto puro.

### 7. `Profile.slug` perdeu o `@unique` — a unicidade são dois índices parciais

`@@unique([tenantId, slug])` **não serve**: no Postgres `NULL != NULL`, então
dois perfis de sistema com `tenant_id` nulo e o mesmo `slug` passariam. A
unicidade vem de dois índices parciais em SQL puro
(`migrations/20261017000000_tenant_membership_invitation`): um para o slug
global (`tenant_id IS NULL`), outro para o slug por empresa
(`tenant_id IS NOT NULL`). No Prisma, `slug` ficou só com `@@index`.

## Consequências

### Positivas

- **Isolamento que sobrevive ao erro de código.** A policy é a segunda linha;
  a aplicação é a primeira.
- **Fail-closed por omissão.** Rota nova sem escopo lê zero linhas, e a
  ausência de escopo no banco significa "não vê nada".
- **O bucket de sistema não é um valor que a sessão escreve.** Ele é uma
  credencial — a raiz do furo da issue #118.
- **Fronteira única de escopo.** `escopo.ts` concentra a escrita do GUC, o
  que torna a afirmação "toda leitura multi-tenant abre o escopo" verificável
  por leitura de código.
- **Escalada de membership fecha no banco.** `INSERT`, `UPDATE` e `DELETE` na
  tabela de credenciais são privilégio por coluna/função, com assinatura.

### Negativas, e o que fica proibido daqui pra frente

- **`FORCE ROW LEVEL SECURITY` não é usado** — de propósito: as migrations e
  o seed precisam escrever em tudo. Quem audita isolamento tem de perguntar
  **quem conecta**, não só se a policy existe.
- **O `SECURITY DEFINER` é uma exceção deliberada** à doutrina de não
  atravessar RLS em função. A exposição é mínima (uma tabela, sem `UPDATE` nem
  `DELETE`, `search_path` fixado), mas ela existe e precisa de olho.
- **`tenant_memberships` não tem `DELETE` de runtime** — logo **remover um
  membro não é operação de aplicação hoje**. E o que a policy garante é a
  *janela do request em voo*, não a revogação imediata.
- **Proibido: escrever `tenant_memberships` fora de `criar_membership()`.**
  Um `INSERT` novo reabre a escalada que a assinatura fecha.
- **Proibido: abrir o bucket de sistema com `comEscopo(prisma, '*', …)`.**
  Isso não abre nada — a policy exige a credencial — e ainda assim parece que
  abre. O caminho é `comEscopoDeSistema`.
- **Proibido: escolher a credencial no call site.** O repositório que aceita
  `tenantId: string | null` escolhe pelo próprio `tenantId`.
- **Proibido: reintroduzir senha de papel em migration ou no repositório.**
  A denylist existe porque o valor publicado não pode voltar a valer.
- **`users`, `users_history` e `users_archive` não têm `tenant_id`** — o
  isolamento delas é o `EXISTS` sobre `tenant_memberships`, que é o join
  quantificado que o isolamento mais caro buys.

### Em aberto

- **Revogação de membership ainda não é operação.** O `REVOKE DELETE` e a
  ausência de escritor fecham o caminho; quando a feature existir, é uma
  decisão nova (e a `20261020000005` já deixou o `REVOKE` preparado).
- **O `EXISTS` de `usuario_no_escopo()` é caro.** Ele é o que impede a
  escalada em `users`; a alternativa — `tenant_id` duplicado nas tabelas sem
  vínculo — é o que o plano §3 deixou como decisão adiada.

## Alternativas consideradas

- **Bucket de sistema concedido por GUC (`escopo_atual() = '*'`)** — foi o
  desenho original e foi **medido e rejeitado**: com `app_runtime`, o `SET
  app.tenant_id = '*'` via a sessão de runtime enxergava todos os usuários de
  todas as empresas (`NOBYPASSRLS` impede o papel de *pular* a policy, não de
  *escolher* o valor do GUC). A correção é a credencial, e é o que a
  migration `20261027000001_papel_de_sistema` faz.
- **Contexto de empresa no claim do JWT** — **não feito, por decisão
  consciente** (plano multi-tenant, Fase 3.1): o claim novo seria descartado
  em silêncio pelo `TokenSubject` de 3 campos, e pior — o tenant muda dentro
  da mesma sessão, e trocar de empresa não emite token novo.
- **Schema-per-tenant e DB-per-tenant** — rejeitados por D1: ops único, uma
  migração, aguenta N empresas. Registrados como fora de escopo no plano.
- **RLS só, sem coluna `tenant_id` em toda tabela** — rejeitado: o vínculo
  da conta é a membership, e `users` é global por desenho (uma conta, N
  empresas). O plano registra a ausência de `tenant_id` em `users` como
  decisão, não esquecimento.
- **Coluna `tenant_id` na conta, em vez de tabela de membership** — rejeitado
  por D4: uma conta pode estar em N empresas; uma coluna `tenant_id` na conta
  guarda **uma**.

## Ver Também

- [`../agents/domain.md`](../agents/domain.md) — o índice de decisões
  arquiteturais do repo.
- [`../api/tenancy.md`](../api/tenancy.md) — contrato HTTP do BC `tenancy`.
- [`./0005-rbac-por-perfil.md`](./0005-rbac-por-perfil.md) — o perfil efetivo
  dentro da empresa escolhida aqui.
- [`0002-autenticacao-jwt-argon2.md`](./0002-autenticacao-jwt-argon2.md) — o
  token que **não** carrega o tenant.
