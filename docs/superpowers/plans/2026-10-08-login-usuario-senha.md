---
name: login-usuario-senha
slug: login-usuario-senha
version: 1.0
created: 2026-10-08
state_snapshot: ../../../.agents/runs/state-snapshot-20261009T020757Z.md
specialists: [nestjs-specialist, nextjs-specialist, ux-design-specialist, security-auditor, test-writer, doc-writer]
reviewers: [stack-code-reviewer, security-auditor, prisma-db-specialist, openapi-contract-specialist, ux-design-specialist, test-writer, doc-sync]
status: em-execucao
---

# Login de usuário com senha obrigatória

> Plano gerado sob a convenção [`state-aware-planning`](../../../.agents/specs/conventions/state-aware-planning.md)
> (camada 0) e roteado pelo [`specialist-routing`](../../../.agents/specs/conventions/specialist-routing.md) (camada 1).
> Implementar com `superpowers:subagent-driven-development`. TDD Red→Green→Refactor em toda task de código.

**Objetivo:** todo usuário tem senha definida no cadastro; existe login que emite sessão JWT;
as rotas de leitura/escrita de `/users` exigem sessão válida.

## Decisões do solicitante (D-1 … D-3)

| # | Decisão | Efeito |
|---|---|---|
| **D-1** | Sessão = **JWT Bearer stateless** | A API assina e valida assinatura por request, sem consultar tabela. `POST /auth/login` devolve `{accessToken, refreshToken}`. Refresh token é um JWT com claim `typ: 'refresh'` — **sem tabela nova**, o que também evita estender `cleanDatabase()` e o `docker-compose`. |
| **D-2** | Escopo = **proteger `/users`** | `POST /users` fica público (cadastro aberto); todo o resto exige sessão. `GET /auth/me` nasce. `AuditContext.actorId` deixa de ser `null` hardcoded. |
| **D-3** | Hash = **argon2** | `argon2id`, default da lib (`m=65536,t=3,p=4`), **medido em 48 ms/hash**. Substitui o bcrypt inicialmentecotado. |

## Trade-offs aceitos

**JWT stateless não revoga.** Não existe logout no servidor: `sair()` no web apaga os cookies
e o usuário perde o acesso no próximo request, mas um token vazado continua válido até `exp`.
Refresh token de 7 dias amplia a janela. É a contrapartida conhecida de D-1; o ADR registra.
Uma tabela de revogação resolveria e é a porta de entrada natural de uma demanda futura.

**O token não é acessível ao JS do browser.** O web é todo server-side (medido: nenhum
`fetch` para a API sai do browser — é a razão pela qual o filtro `page.on('request')` do F3
casaria vazio). As Server Actions gravam os dois tokens em cookies **httpOnly** e injetam
`Authorization: Bearer` pelo `ApiClient.getToken?` que já existe e está morto. D-1 é
respeitado no lado que importa — a API é stateless — sem criar a exceção de XSS que o
armazenamento em `localStorage` abriria.

**Hash fora do `UserOutput`.** `users_history.snapshot` e `users_archive.snapshot` recebem
`toUserOutput(user)`. Duas barreiras independentes impedem o hash de vazar:
`PasswordHash.toString()` devolve `[redacted]`, e `toUserOutput` não lê o campo.

## Fases

| Fase | Foco | TDD | Arquivos principals |
|---|---|---|---|
| 1 | Persistência | — | `prisma/schema.prisma`, migration nova, `user.prisma-mapper.ts` |
| 2 | Domínio | sim | `password-hash.vo.ts`, `password-hasher.port.ts`, `user.aggregate.ts` |
| 3 | Aplicação users | sim | `user-use-cases.ts`, `users.schemas.ts`, `create-user.input.ts`, `shared-types` |
| 4 | Infra de segurança | sim | `argon2-password-hasher.ts`, `jwt-token.service.ts` |
| 5 | Módulo auth | sim | `auth-use-cases.ts`, `auth.controller.ts`, `auth.module.ts` |
| 6 | Guard + auditoria | sim | `jwt-auth.guard.ts`, `users.controller.ts`, `domain-exception-to-http.ts` |
| 7 | Front: senha no cadastro | sim | `cadastro-usuario-schema.ts`, `state.ts`, `actions.ts`, form |
| 8 | Front: login + sessão | sim | `lib/sessao.ts`, `app/login/**`, `components/login-form.tsx` |
| 9 | E2E Playwright | — | `e2e/support/**`, F1–F6, F7–F8, inventário de fluxos |
| 10 | Docs + ADR | — | `docs/adr/0002-*.md`, convenções tocadas |

## Ordem e por quê

Topologia primeiro (1 → 2 → 3 → 4 → 5 → 6): o agregado não compila sem o VO, e o VO não faz
sentido sem a coluna. O frontend só vem depois da API responder, porque o `parity.spec.ts` do
web **lê o fonte dos VOs da API** e falha se os limites divergirem.

**Sentido da dependência entre módulos:** `auth → users`, nunca o inverso. O
`PASSWORD_HASHER_PORT` mora em `users/domain/ports/` (é uma necessidade do caso de uso de
cadastro) e é **implementado** pelo módulo `auth`. Se o port morasse em `auth`, `users`
importaria `auth` e `auth` importaria `users` — ciclo de import ES.

## Portas HTTP

| Método | Rota | Sessão | Sucesso |
|---|---|---|---|
| POST | `/api/v1/auth/login` | pública | `201` `{accessToken, refreshToken, user}` |
| POST | `/api/v1/auth/refresh` | pública (refresh token no body) | `201` `{accessToken, refreshToken}` |
| GET | `/api/v1/auth/me` | exigida | `200` `UserOutput` |
| POST | `/api/v1/users` | **pública** | `201` (cadastro aberto) |
| GET/PATCH/DELETE `/api/v1/users*` | **exigida** | | |

Erro novo: `401 INVALID_CREDENTIALS` — mensagem genérica em login, sem distinguir
"e-mail não existe" de "senha errada" (enumeração de contas).

## Gates que esta demanda vai acionar

| Gate | Como dispara |
|---|---|
| `stack-code-reviewer` (pre-commit + CI) | toca `domain/`, `application/`, `infrastructure/` |
| `security-auditor` (**blocking**) | `diff_pattern` casa `argon2.hash(`, `jwt.sign(`/`jwt.verify(`, `process.env.` |
| `prisma-db-specialist` | `prisma.*.findUnique/findMany` no repositório |
| `openapi-contract-specialist` | `@ApiTags`/`@ApiResponse` novos no controller; `openapi.json` versionado precisa regerar |
| `ux-design-specialist` | `<input type=password>`, `aria-invalid`, `autoComplete` |
| `test-writer` | todo `*.spec.ts` novo |
| `doc-sync` | `docs/**`, `.agents/specs/**`, `apps/api/prisma/**` |
| `check-e2e-flow-coverage` | **dois** fluxos novos (F7, F8) exigem 2 linhas novas no inventário — meio-feito é vermelho |
| `format:check`, `test:coverage` (80%), `test:integration`, `test:e2e` | automático |

## Configuração nova

| Var | Onde | Default |
|---|---|---|
| `JWT_SECRET` | `apps/api/.env.example`, `docker-compose.yml` (serviço `api`) | **sem default** — boot falha se ausente em produção |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | idem | `15m` / `7d` |

## Fora do escopo (registrado, não implementado)

Revogação de token · troca/reset de senha · rate limiting no `/auth/login` ·
`role`/`isActive` · campo "confirme a senha" no formulário · refresh transparente no front.

---

**Mantido por:** projeto-base contributors · **Licença:** MIT