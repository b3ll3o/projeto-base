# Glossário — projeto-base

> O vocabulário do domínio. Um termo aqui é **canônico**: quando o repositório
> fala de "empresa", ele fala de `Tenant`, e não de "tenant", "cliente" ou
> "organização".
>
> **Ele é criado lazy.** Um termo entra quando ele é **de fato resolvido** —
> quando há código, migration ou decisão que o usa. Vocabulário que o repo
> ainda não usa não entra aqui: entra como pergunta, não como definição.
>
> A regra de uso está em
> [`docs/agents/domain.md`](./docs/agents/domain.md); a convenção que exige a
> documentação ser parte do código, em
> [`documentacao.md`](./.agents/specs/conventions/documentacao.md).

## Termos do domínio

| Termo | Definição | Onde aparece |
|---|---|---|
| **Conta** (`user`) | Identidade **global** da pessoa. Login resolve por `users.email`, que é `UNIQUE`; a conta não pertence a uma empresa. | `model User` em [`apps/api/prisma/schema.prisma`](./apps/api/prisma/schema.prisma) · [ADR-0004](./docs/adr/0004-tenancy-multi-empresa.md) |
| **Empresa** (`tenant`) | A organização que os dados protegem. Tem `slug` global (é o identificador de URL). Sem soft-delete: apagar cascateia perfis, memberships e convites. | `model Tenant` em [`schema.prisma`](./apps/api/prisma/schema.prisma) · [ADR-0004](./docs/adr/0004-tenancy-multi-empresa.md) |
| **Membership** | Vínculo entre **uma conta** e **uma empresa**, com o `role` e o perfil efetivo que a pessoa veste **naquela** empresa. Uma conta pode estar em N empresas, mas só uma vez em cada. | `model TenantMembership` em [`schema.prisma`](./apps/api/prisma/schema.prisma) · [ADR-0004](./docs/adr/0004-tenancy-multi-empresa.md) |
| **Perfil** (`profile`) | Agregado de permissões. `slug` imutável e `name` editável; `tenantId` nulo = perfil global. `isAdmin` é bypass total; `isSystem` protege contra delete. | `model Profile` em [`schema.prisma`](./apps/api/prisma/schema.prisma) · [ADR-0005](./docs/adr/0005-rbac-por-perfil.md) |
| **Claim de permissão** | A permissão que um perfil carrega. No repo é a `permission_key` da relação `authorizations` — string de pontos (`users.read`), comparada por igualdade exata, **sem hierarquia**. | [`permissions-catalog.ts`](./apps/api/src/shared/auth/permissions-catalog.ts) · `model Authorization` em [`schema.prisma`](./apps/api/prisma/schema.prisma) · [ADR-0005](./docs/adr/0005-rbac-por-perfil.md) |
| **Administrador do sistema** | O ator que atravessa empresas: `tenantId === null` **e** `isAdmin`. O bucket de sistema **sem** `isAdmin` não administra — é o que o `viewer` global veste. | [`eh-administrador-de-sistema.ts`](./apps/api/src/shared/auth/eh-administrador-de-sistema.ts) · [ADR-0005](./docs/adr/0005-rbac-por-perfil.md) |
| **Bucket de sistema** | O recorte de dados **sem empresa** — perfis globais, contas de sistema. É alcançado pela **credencial** `app_system` (`SYSTEM_DATABASE_URL`), nunca por um valor que a sessão escolhe. | [`escopo.ts`](./apps/api/src/shared/infrastructure/prisma/escopo.ts) · [ADR-0004](./docs/adr/0004-tenancy-multi-empresa.md) |
| **Escopo de empresa** | O recorte de dados **de uma empresa**, aplicado no banco pelo GUC de sessão `app.tenant_id` e pelas policies de RLS. Rota sem escopo lê **zero linhas** — fail-closed por omissão. | [`escopo.ts`](./apps/api/src/shared/infrastructure/prisma/escopo.ts) · [`dados.md`](./docs/system-design/dados.md) · [ADR-0004](./docs/adr/0004-tenancy-multi-empresa.md) |
| **Ator** (`ator`) | A identidade autenticada mínima que as travas leem: `userId`, `tenantId` e `isAdmin`. Vem do `req.user` publicado pelo `JwtAuthGuard`; `tenantId` ausente vira `null`, e `isAdmin` ausente vira `false`. | [`eh-administrador-de-sistema.ts`](./apps/api/src/shared/auth/eh-administrador-de-sistema.ts) |
| **Feature flag** | Chave que liga ou desliga uma **funcionalidade** no sistema inteiro. Não tem perfil, não tem empresa, não tem concessão. | [`feature-flag-catalog.ts`](./apps/api/src/shared/auth/feature-flag-catalog.ts) · [ADR-0006](./docs/adr/0006-feature-flags-como-excecao.md) |
| **Chave ausente = ATIVADA** | A semântica da flag: a tabela guarda **só as exceções** (o que está desligado). Chave nova no catálogo não apaga nada. | [`schema.prisma`](./apps/api/prisma/schema.prisma) (`model FeatureFlag`) · [ADR-0006](./docs/adr/0006-feature-flags-como-excecao.md) |
| **Auditoria** / **histórico de usuário** | A trilha de mudanças de uma conta: `users_history` (versão a versão) e `users_archive` (a linha apagada). Os snapshots **nunca** carregam o hash da senha. | [`schema.prisma`](./apps/api/prisma/schema.prisma) (`model UserHistory`, `model UserArchive`) · [`docs/api/users.md`](./docs/api/users.md) §6 |
| **Soft-delete** | A exclusão que marca (`deletedAt`, `deletedBy`) em vez de apagar. A linha continua no banco; a restauração devolve a entidade. | [`schema.prisma`](./apps/api/prisma/schema.prisma) (`model User`) · [`docs/api/users.md`](./docs/api/users.md) §3.5, §3.6 |
| **Refresh token** | O token de uso único que renova a sessão. Não é stateless: o servidor mantém o **registro** dele, e o registro é que prova que ele ainda vale. | [`jwt-token.service.ts`](./apps/api/src/modules/auth/infrastructure/security/jwt-token.service.ts) · [ADR-0007](./docs/adr/0007-refresh-token-revogavel.md) |
| **`jti`** | Identificador único de um token emitido (`randomUUID()` por token). No refresh token é a **chave primária** do registro `refresh_tokens`. | [`schema.prisma`](./apps/api/prisma/schema.prisma) (`model RefreshToken`) · [ADR-0007](./docs/adr/0007-refresh-token-revogavel.md) |
| **Rotação de refresh token** | O `POST /auth/refresh` que **consome** o `jti` apresentado (grava `revoked_at`) e emite um par novo. O token velho deixa de valer. | [`prisma-refresh-token.repository.ts`](./apps/api/src/modules/auth/infrastructure/persistence/prisma-refresh-token.repository.ts) · [ADR-0007](./docs/adr/0007-refresh-token-revogavel.md) |
| **Chave de idempotência** | Chave **do cliente** (`Idempotency-Key`) que torna o retry de escrita seguro: o par (`key`, `actor`) é a chave primária do registro, e o replay repõe a resposta guardada. | [`schema.prisma`](./apps/api/prisma/schema.prisma) (`model IdempotencyKey`) · [ADR-0011](./docs/adr/0011-idempotencia-de-escrita.md) |
| **Convite** (`invitation`) | Convite **por e-mail e por empresa**, com `token` próprio. Consumir o convite cria a membership. | [`schema.prisma`](./apps/api/prisma/schema.prisma) (`model Invitation`) |
| **Bounded context** | Uma unidade de domínio com fronteira própria: um módulo em `apps/api/src/modules/<bc>/`, dividido em `domain/`, `application/` e `infrastructure/`. São **6** no repo (`ls apps/api/src/modules/ \| wc -l` → 6, em 2026-11-18). | [`apps/api/src/modules/`](./apps/api/src/modules/) · [ADR-0001](./docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md) |
| **Port** | A interface que o `domain` declara para falar com o exterior (`domain/ports/<x>.port.ts`). A dependência aponta **para dentro**: o `domain` não conhece o adapter. | [`apps/api/src/modules/users/domain/ports/`](./apps/api/src/modules/users/domain/ports/) · [ADR-0001](./docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md) |
| **Adapter** | A implementação da port, em `infrastructure/`. É quem conhece Prisma, HTTP e o banco. | [`apps/api/src/modules/users/infrastructure/`](./apps/api/src/modules/users/infrastructure/) · [ADR-0001](./docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md) |
| **Request id / traceparent** | A correlação de uma requisição: o `traceId` W3C do span ativo, o `request.id` do Fastify, ou um UUID fixado no request — **uma única derivação**, compartilhada pelo log e pelo corpo do erro. | [`trace-id.ts`](./apps/api/src/shared/infrastructure/http/trace-id.ts) |
| **Gate** | Um instrumento **executável** que cobra uma regra. Regra que só existe em prosa é defeito. | [`.tooling/scripts/ci/`](./.tooling/scripts/ci/) · [`guard-classes.md`](./.agents/specs/conventions/guard-classes.md) |
| **ADR** | Registro datado de uma **decisão** arquitetural, com contexto, decisão, consequências e alternativas rejeitadas. O índice canônico é o de `docs/agents/domain.md`. | [`docs/adr/`](./docs/adr/) · [`docs/agents/domain.md`](./docs/agents/domain.md) |
| **TDR** | Decisão com **alternativas avaliadas, riscos, rollout e revisão** — mais largo que o ADR, que registra o porquê já fechado. | [`docs/tdr/`](./docs/tdr/) |
| **PRD** | O **problema de produto** e as métricas de sucesso, no formato one-pager. | [`docs/prd/`](./docs/prd/) |
| **HLD** | O **desenho** do sistema em camadas — topologia, contêineres, módulo, dados, segurança, operação — mais o contrato de extensão. | [`docs/system-design/README.md`](./docs/system-design/README.md) · [ADR-0010](./docs/adr/0010-system-design-canonico.md) |
| **C4** | A notação de níveis de abstração usada nos diagramas: **nível 1** (contexto), **nível 2** (contêineres), **nível 3** (módulo). O nível "código" não é documento — é o repositório. | [`contexto.md`](./docs/system-design/contexto.md) · [ADR-0010](./docs/adr/0010-system-design-canonico.md) |
| **Runbook** | O **procedimento** de uma operação, por ambiente: subir, observar, rodar o e2e, publicar na borda. | [`docs/runbooks/`](./docs/runbooks/) |
| **Lacuna nomeada** | Ausência de doc **declarada** num lugar canônico, com o motivo. O oposto do silêncio. | [`documentacao.md`](./.agents/specs/conventions/documentacao.md) §1 |

## Como usar este glossário

**O termo do glossário ganha do termo genérico.** Quando você escrever um
título de issue, o nome de um caso de teste, o rótulo de um campo ou a
descrição de uma feature, use o termo **como está definido aqui** — `empresa`,
não `tenant`; `membership`, não `associação`; `perfil`, não `papel`; `claim de
permissão`, não `flag de permissão`. Não derive sinônimo: um segundo nome para
o mesmo conceito é a metade do caminho para um termo que significa duas
coisas.

**O que não está aqui, não está resolvido.** Se você usa um conceito que não
encontra nesta lista, isso é uma de duas coisas:

1. **Linguagem que o projeto não usa** — reconsidere o termo; talvez o
   correto seja outro que já existe aqui.
2. **Uma lacuna real** — o conceito é usado no código mas não foi registrado.
   **Anote a lacuna** (issue, ou o backlog de `domain-modeling`) em vez de
   inventar o sinônimo. Um termo definido ad-hoc na issue vira um termo
   divergente no código seis meses depois.

O glossário **cresce lazy**: um termo entra quando ele é de fato resolvido —
quando há código, migration ou decisão que o usa. Nenhum termo entra por
antecipação.

**Quem está no comando.** Se a saída contradisser um termo aqui ou um
[ADR](./docs/adr/), diga isso na cara em vez de sobrescrever em silêncio: um
ADR aceito é decisão vigente, e violá-lo é erro de review, não preferência.

**Ao acrescentar um termo:** uma linha na tabela acima, com o **caminho real**
onde ele aparece — e, quando houver decisão por trás, o ADR que a decide. Um
termo sem caminho é um termo inventado.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
**Versão do documento:** 1.30.0
