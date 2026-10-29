# Plano — correções da revisão do PR #127 (visão de admin do tenancy)

> Origem: 15 achados inline da revisão automatizada + 2 avisos + 2 melhorias da
> revisão do Hermes Agent (2026-10-28). Data: 2026-10-29.

## 1. As três decisões que mudam o desenho

### D-1 — UMA rota e UM snapshot (`GET /admin/tenancy`)

O achado 8 exige que as DUAS listas contem a mesma história. Duas rotas HTTP são
dois requests e, portanto, dois snapshots: **só uma resposta garante o
invariante**. E uma resposta é também o menor código:

| | duas rotas (hoje) | uma rota (proposto) |
|---|---|---|
| transactions | 2 (uma por lista) | 1 (as duas leituras no mesmo `comEscopoDeSistema`) |
| requests do web | 2, em `Promise.all` | 1 |
| wire format | declarado 2× na API + 2× no shared-types | 1 tipo, importado pelos dois lados |
| falha de uma leitura | descarta a que deu 200 | não existe esse caso |

O repositório já tem `GET /admin/profiles` e `GET /admin/feature-flags` — um
recurso por rota. O inventário é **um read-model** (a tenancy vista nos dois
sentidos), não dois recursos. `GET /admin/tenancy` substitui
`GET /admin/tenants` e `GET /admin/users` (este último, por sinal, se
sobrepunha em nome ao `PUT /admin/users/:id/profile` do `AdminUsersController`).

### D-2 — Sem paginação agora; o PRAZO da transação fica explícito

O achado 2 mediu o defeito real: a leitura roda numa transação interativa com
o default implícito do Prisma (5 s) e estoura em `P2028` → 500. A paginação é
⚠️ **não bloqueante** para o revisor e exigiria UI que ninguém pediu.

O que entra: `transactionOptions` explícito nas leituras de inventário + um
`shortcut:` no código registrando o limite ("a base é pequena") e a condição
de upgrade. A paginação, quando vier, vai no PORT — como o revisor pediu duas
vezes.

### D-3 — O port do inventário sai do módulo de infraestrutura compartilhado

O achado 15: `ADMIN_TENANCY_REPOSITORY_PORT` é exportado por
`PrismaPersistenceModule`, que `AuthModule`, `UsersModule`, `ProfilesModule`,
`FeatureFlagsModule` e `TenancyModule` importam — e o portão D2 vive dois
níveis acima. O binding passa para o `TenancyModule`, que é o único que o
consome: o portão passa a estar a UMA camada.

## 2. As tarefas

| # | Tarefa | Achados | Arquivos |
|---|---|---|---|
| T1 | `shared/auth/eh-administrador-de-sistema.ts` vira o dono de `atorDe` e de `exigeAdministradorDoSistema` | 10, 11 | o dono + 5 controllers + 2 use cases |
| T2 | O "perfil efetivo" tem UM dono (domínio) | 9, melhoria 1 | novo `tenancy/domain/perfil-efetivo.ts` + 3 repositórios |
| T3 | O repositório: ordem com desempate, ordem na relação aninhada, UMA transação, prazo explícito | 2, 6, 7, 8 | `prisma-admin-tenancy.repository.ts`, `escopo.ts` |
| T4 | O port e a use case: um inventário, um portão, e o registro da leitura sensível | 8, 15, melhoria 2 | port, use case, `tenancy.module.ts`, `prisma-persistence.module.ts` |
| T5 | O controller: o wire format É o tipo compartilhado | 4 | controller + `shared-types/src/tenant.ts` |
| T6 | `lib/tenancy.ts`: o token entra por parâmetro (o padrão de `lib/empresas.ts`) | 14 | `lib/tenancy.ts` + a página |
| T7 | A tela: uma leitura, e a falha vai para a tela certa | 5 | `app/admin/tenancy/page.tsx` |
| T8 | O menu: o link aparece sob o sinal que a tela exige | 3 | `components/Sidebar.tsx` |
| T9 | `/admin/flags` passa a usar o guard compartilhado | 13 | `app/admin/flags/page.tsx` |
| T10 | A credencial de SISTEMA: a mensagem diz o que acontece de fato | aviso 1 | `escopo.ts` |
| T11 | Os specs (e2e da API com e-mail por login; unit, integração e web) | 1 | specs |
| T12 | OpenAPI versionado, docs e PR | — | `openapi`, plano, corpo do PR |

## 3. Fora do escopo, e por quê

- **Paginação** (achado 2, aviso 2): ⚠️ não bloqueante; o lugar é o PORT, e ela
  exige UI que ninguém pediu. Fica o prazo explícito + o `shortcut:`.
- **Auditoria de leitura** (melhoria 2): o `AuditContext` é auditoria de
  ESCRITA com versionamento (`INSERT|UPDATE|DELETE|RESTORE` + snapshot da
  entidade); uma leitura não é uma entidade. O precedente do repo para
  operação sensível é o `Logger` dedicado (`ProfilePrivilegeEscalation`,
  `FeatureFlagBloqueio`) — e é o que entra, com o ator e o tamanho do
  inventário. A auditoria de leitura de verdade é uma decisão de produto.
- **O gate que não vê a regra do perfil efetivo** (melhoria 1): o
  `check-bloco-duplicado` tem janela de 16 linhas e o predicado tem 5 — o gate
  é cego para ESTA classe, e fechar a classe é uma mudança de gate (uma forma
  nova), não deste PR. O que este PR faz é dar o dono à regra: uma cópia passa
  a ser um import faltando.

## 4. Como se prova

- `pnpm ci:local` (a camada local inteira) antes de push.
- Cada achado que tinha dente continua tendo: o e2e 14 (D2, escopo, atravessar
  empresas), o F17 do web (recusa do quase-admin + o menu), os specs de
  integração do repositório (perfil efetivo, ordem).
- **Achado 1** (o limite de login): o e2e 14 passa a usar um e-mail por login
  — e o spec mede que os 5 logins caem em baldes diferentes.
