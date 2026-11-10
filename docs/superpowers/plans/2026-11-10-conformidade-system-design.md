---
name: plano-conformidade-system-design
description: "Plano da conformidade do código com o system design — fecha as 4 divergências medidas entre o que o conjunto docs/system-design/ afirma e o que apps/ e infra/ fazem: a rota de health contada pelo rate limit, o papel de runtime sem statement_timeout, a escrita sem chave de idempotência e a correlação que diverge entre resposta e auditoria."
version: 1.1.0
updated: 2026-11-10
status: executado
state_snapshot: .agents/runs/state-snapshot-20261110T123209Z.md
---

# Plano — conformidade do código com o system design

> **Demand:** *"analise as alterações feitas na branch e implemente o system
> design"*.
>
> **Leitura:** o conjunto `docs/system-design/` (PR #164, aberto e verde)
> **descreve** o desenho do sistema. Este plano fecha as divergências
> **medidas** entre o que o desenho afirma e o que o código faz — a
> conformidade, que é o que falta para o desenho ser verdade.
>
> **Snapshot de estado:**
> [`.agents/runs/state-snapshot-20261110T123209Z.md`](../../../.agents/runs/state-snapshot-20261110T123209Z.md)
> (`proceed: true`, `gap_blocker: false`).

---

## §1. As 4 divergências medidas

Cada linha tem o **fato do desenho**, o **fato do código** e a **medida**.

| # | O desenho afirma | O código faz | Medida |
|---|---|---|---|
| **X1** | `operacao.md` §5: *"Rotas com `@SkipThrottle()` (ex: `/health`) não são contadas"* | **não existe `@SkipThrottle`** no código — e dois comentários (`main.ts:74`, `app.module.ts:22`) **afirmam que existe** | `curl -i http://localhost:3000/api/v1/health` → **429** `TOO_MANY_REQUESTS`, `retry-after: 52` (MEDIDO 2026-11-10, container `projeto-base-api`) |
| **X2** | `operacao.md` §6: *"API → banco: **nenhum** timeout — não há `statement_timeout` no papel de runtime"* | o papel `app_runtime` não tem `statement_timeout` — a query espera o Postgres desistir | `ALTER ROLE app_runtime` não tem `SET statement_timeout` em nenhuma migration |
| **X3** | `dados.md` §6: *"retry não é seguro — não há `Idempotency-Key`"* | nenhum header é lido, nenhuma tabela guarda a chave | `grep -rn "Idempotency" apps/api/src/` → **0** |
| **X4** | `dados.md` §5: *"o `traceId` da resposta e o `correlationId` da auditoria **divergem** quando não há span"* | `buildContext()` usa `w3cTraceId ?? randomUUID()`, e `traceIdDe()` usa `w3c ?? req.id ?? uuid` — **duas derivações** | `users.controller.ts:620-625` vs `trace-id.ts:47-58` |

> **X1 é o mais grave:** não é só um doc desatualizado — são **dois
> comentários do código affirmando um controle que não existe**, e o
> controle ausente é o que impede o probe de derrubar o container.

### O que NÃO entra (medido, para não crescer escopo)

| Lacuna | Por que fica |
|---|---|
| **SLO / error budget** (`operacao.md` §4) | exige backend de métricas; o `Prometheus` local não tem o que um SLI precisa |
| **Resiliência entre serviços** (§4) | **não há** segundo serviço — não há o que resiliar |
| **Fila / cache distribuído** (`dados.md` §3) | o Postgres é a fonte única; introduzir fila é **ADR novo**, não tarefa |
| **`/health` público fora do prefixo** | o probe usa `/api/v1/health`; a versão não duplicada é o `docker-compose` antigo |

---

## §2. Decisões fechadas

| # | Decisão | Escolha | Por que |
|---|---------|---------|--------|
| **D1** | Escopo | as 4 divergências de §1, nesta ordem: X1 → X4 → X2 → X3 | do mais barato e mais grave ao mais caro |
| **D2** | Health | `@SkipThrottle()` no **controller** do health (não no método) — e os **2 comentários falsos saem** | o decorator no controller vale para todas as rotas dele; e o comentário que afirma o que não existe é o que mentiu |
| **D3** | Timeout do banco | `ALTER ROLE app_runtime SET statement_timeout = '8s'` numa **migration** | o papel é do **cluster** (ver ADR-0007), e a migration é o lugar versionado; `8s` é **menor** que o fallback de `10s` do cliente web, para a API responder antes de o cliente desistir |
| **D4** | Idempotência | header **opt-in** `Idempotency-Key`, só em **POST**, **fora de `/auth`** | sem header, nada muda (compatibilidade); `/auth` tem semântica de **sessão** (rotação e revogação) — replay ali devolve token morto |
| **D5** | Tabela da idempotência | espelha `refresh_tokens`: **sem RLS**, `REVOKE` do `app_runtime`, `GRANT` do `app_system`, acessada por `comEscopoDeSistema` | a resposta guardada é PII de outra empresa; o papel de runtime **não** pode ler a tabela inteira (o RLS é o que impede) |
| **D6** | Correlação | **uma** derivação: `buildContext()` passa a usar `traceIdDe(request)` | o repo já tem a função; a segunda cópia é a divergência |
| **D7** | Contrato HTTP | o header é **opcional** e **não** entra no OpenAPI como requisito — mas a resposta de replay devolve `Idempotency-Replayed: true` | nenhum cliente existente quebra |
| **D8** | Docs | o conjunto de `docs/system-design/` passa a **descrever o que existe**; cada afirmação "não existe" vira "existe, com o link" | doc que mente é defeito P0 (`documentacao.md` §1) |

---

## §3. As tarefas

| # | Tarefa | Arquivo | Aceite (verificável por comando) |
|---|--------|---------|-------------------------------|
| **T1** | Health fora do rate limit | `apps/api/src/modules/health/health.controller.ts` · `main.ts` · `app.module.ts` | e2e novo: **101** requisições a `/api/v1/health` → **todas 200** (hoje: a 101ª é 429) · `grep -rn "@SkipThrottle" apps/api/src/` → **1** ocorrência |
| **T2** | Correlação única | `apps/api/src/modules/users/infrastructure/http/users.controller.ts` | sem span: o `correlationId` da auditoria **iguala** o `traceId` da resposta · spec nova |
| **T3** | `statement_timeout` do runtime | migration nova | `SHOW statement_timeout` numa sessão `app_runtime` → `8s` · `apps/api/prisma/migrations/**` com o `ALTER ROLE` |
| **T4** | Idempotência de escrita | schema + migration + `shared/idempotency/**` + interceptor | spec unit do interceptor (replay, payload diferente, chave em voo) · spec e2e (POST /users repetido com a mesma chave → **mesma** resposta, **um** usuário) |
| **T5** | Decisões | `docs/adr/0011-*.md` · `docs/adr/0012-*.md` | 2 ADRs com Contexto/Decisão/Consequências/Alternativas · `docs/agents/domain.md` lista os 12 |
| **T6** | Docs | `docs/system-design/dados.md` §6 · `docs/system-design/operacao.md` §5/§6 · `docs/adr/0010-*.md` §Em aberto · `docs/api/users.md` | nenhum doc afirma o que o código não faz · `pnpm ci:preflight` verde |
| **T7** | Versão e índices | os 6 footers + `docs/superpowers/README.md` + `docs/agents/domain.md` | `1.26.0` → `1.27.0` com a linha no **Histórico de Versões** dos 4 que têm tabela |
| **T8** | Validação | — | `pnpm ci:local` verde · revisão por `code-reviewer` + `security-auditor` |

### §3.1 Ordem

```text
T1 (health) → T2 (correlação) → T3 (timeout) → T4 (idempotência)
   → T5 (ADRs) → T6 (docs) → T7 (versão) → T8 (validação) → PR
```

X1 e X2 são **correção de defeito** (o controle já foi decidido — está
escrito nos comentários e no desenho). X3 é **decisão nova** (o desenho
diz que ela exige ADR) — por isso o ADR vem **depois** do código, e não
antes.

---

## §4. O desenho da idempotência (T4)

```text
cliente ──► POST /api/v1/users
            Idempotency-Key: 8f1c…

            ┌─ interceptor (global) ───────────────────────────────┐
            │ 1. sem header, ou método ≠ POST, ou rota de /auth   │
            │    → passa direto (comportamento atual, intacto)      │
            │ 2. imprime o PEDIDO (método + rota + corpo)          │
            │ 3. reserva a chave (INSERT)                          │
            │    chave já reservada, MESMA impressão → REPLAY      │
            │    chave já reservada, impressão DIFERENTE → 409      │
            │    chave em voo (sem resposta) → 409                 │
            │ 4. executa o handler                                 │
            │ 5. guarda a resposta (2xx) e devolve                │
            │    erro → libera a chave (o cliente pode repetir)    │
            └──────────────────────────────────────────────────────┘
```

| Decisão | Valor | Por que |
|---|---|---|
| **Escopo da chave** | `(ator, chave)` | duas contas não dividem chave — o replay devolve a resposta de **outro**, o que seria vazamento |
| **Ator anônimo** | `POST /users` é `@Public()` → escopo `anônimo` | a impressão (corpo) segue sendo exigida: quem repete tem que mandar o **mesmo** pedido |
| **Impressão do pedido** | SHA-256 de `método + rota + corpo` | mesma chave com corpo diferente é **erro do cliente**, não um replay |
| **O que se guarda** | status + corpo da resposta | é o que o replay devolve |
| **Validade** | 24 h, com poda no `prepara-papeis.sh` | o retry de um cliente acontece em minutos, não em dias |
| **Credencial** | `app_system` (`comEscopoDeSistema`) | a resposta guardada é PII de outra empresa; o runtime não a lê |

---

## §5. Riscos

| Risco | Como o plano o trata |
|---|---|
| **Replay vaza PII entre empresas** | a tabela é do caminho de **sistema** (D5); o runtime não a alcança |
| **Chave em voo trava o cliente** | 409 explícito, e a chave é liberada quando o handler **erra** |
| **`statement_timeout` derruba query legítima** | 8 s é **acima** do prazo de transação do Prisma (5 s, `escopo.ts:96-101`) e **abaixo** do timeout do cliente web (10 s) |
| **`ALTER ROLE` afeta todo o cluster** | é o que a ADR-0007 já registra: o papel é do cluster, e o `statement_timeout` é do papel |
| **Doc que envelhece** | T6 atualiza o conjunto de `docs/system-design/` **no mesmo PR** |
| **Mudança de contrato HTTP** | o header é opcional; nenhum cliente existente muda (D7) |

---

## §6. O que este plano NÃO entrega

- **Não** SLO, error budget nem dashboard (exige backend de métricas).
- **Não** fila, cache distribuído nem event store (o Postgres é a fonte
  única; mudar isso é ADR).
- **Não** `Idempotency-Key` em `PATCH`/`DELETE` (a lacuna documentada é de
  **criação**; e `PATCH` já tem `If-Match`/`version`).
- **Não** `Idempotency-Key` em `/auth` (semântica de sessão).
- **Não** idempotência **implícita** por conteúdo (exigiria guardar o corpo
  de todo POST — custo e risco de colisão que o header opcional não tem).

---

## O que a execução produziu

> **v1.1.0** — a execução rodou em 2026-11-10, e o plano mudou no caminho:
> a **T4** (idempotência) ganhou a tabela `idempotency_keys` e o
> interceptor global; e o **preço** da D5 (credencial de sistema) foi
> medido, não presumido.

| # | Tarefa | Artefato | Estado |
|---|---|---|---|
| T1 | Health fora do rate limit | `health.controller.ts` (`@SkipThrottle()`) · `app.module.ts` e `main.ts` (os 2 comentários que mentiam) | ✅ |
| T2 | Correlação única | `users.controller.ts` (`traceIdDe(request)`) · `user-persistence.exceptions.ts` (`AuditContextStore.tryGet()`) | ✅ |
| T3 | `statement_timeout` do papel | migration `20261110000000_statement_timeout_do_papel` · `papel-de-runtime.ts` (o dono do número) | ✅ |
| T4 | Idempotência de escrita | schema + migration `20261110000001_chave_de_idempotencia` · `shared/idempotency/**` · `prepara-papeis.sh` (poda) | ✅ |
| T5 | Decisões | `docs/adr/0011-idempotencia-de-escrita.md` · `docs/adr/0012-orcamento-de-tempo-no-banco.md` | ✅ |
| T6 | Docs | `dados.md` §5/§6 · `operacao.md` §5/§6/§Correlação · `modulo.md` · `api/health.md` · `api/users.md` · `system-design/README.md` §6 | ✅ |
| T7 | Versão e índices | os 6 footers → `1.27.0` + a linha no Histórico dos 4 · `docs/agents/domain.md` · `docs/superpowers/README.md` | ✅ |

### Um acerto que o plano não previu

O replay devolvia o status e o **corpo**, e não o `ETag` que o `POST /users`
devolve — ou seja, a resposta do retry **não** era a mesma da original, e um
cliente que monta o `If-Match` a partir do `ETag` levaria 400 no `PATCH`
seguinte. O interceptor agora guarda os headers que o **handler** escreveu (a
comparação é com o reply antes do handler: é o que separa o `ETag` da
aplicação dos headers de infraestrutura, que são do request). A coluna
`response` passou a guardar o **envelope** `{ body, headers }`.

### As medições que fecham cada tarefa

| Tarefa | Medida (com o comando) |
|---|---|
| T1 | **antes**: `curl -i http://localhost:3000/api/v1/health` → **429** `TOO_MANY_REQUESTS`, `retry-after: 52`; 120 requisições → **100×200 + 20×429**. **depois**: 101 requisições seguidas → **todas 200** (spec `16-health-sem-rate-limit.e2e.spec.ts`) |
| T2 | **antes**: `correlationId` = `090d2e48-…` (UUID) e o `traceId` da resposta = `req-42`. **depois**: os dois = `req-42` (spec `users.controller.spec.ts`) |
| T3 | **antes**: `SHOW statement_timeout` como `app_runtime` → **0**. **depois**: **8s** (idem `app_system`), e o dono continua **sem** o orçamento da API (spec de integração) |
| T4 | **depois**: `POST /users` com a mesma chave 2× → **o mesmo corpo** (o mesmo id), o header `Idempotency-replayed: true`, e **1** usuário na base (spec `17-idempotencia-de-escrita.e2e.spec.ts`) |

### O que o plano NÃO previu

- **O balde do rate limit é por ROTA**, não global (`generateKey` inclui
  classe e handler) — medido pelo reviewer de auditoria. O risco real da
  rota de health era mais estreito do que o §1 afirmava, e o texto dos docs
  foi ajustado para o fato, não para o medo.
- **`fastify` não é dependência direta** do `@projeto/api` — o interceptor
  usa uma forma estrutural própria, no mesmo caminho do
  `users.controller.ts` (`Parameters<FastifyAdapter['setHeader']>[0]`).
- **O `correlationId` não é persistido** — a lacuna real é a **coluna**,
  não a divergência. A divergência foi fechada; a coluna ficou declarada em
  `system-design/README.md` §6.

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.1.0
