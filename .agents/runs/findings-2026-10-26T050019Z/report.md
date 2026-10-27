# Findings — 2026-10-26T05:00:19Z

**Escaneamento weekly** · repo `b3ll3o/projeto-base` (PUBLIC) · branch `fix/issues-110-111` · HEAD `e84ecc2`
**`gh` auth:** válido · **issues abertas no início:** 0 · **`open_issue_limit`:** 10

## Resumo

- **Specialists executados:** 8 (5 de auditoria determinística + 3 genéricos)
- **Findings totais:** 26 — **P0: 2** | **P1: 8** | **P2: 16**
- **Issues abertas:** 10 (cap atingido) | **comentadas:** 0 | **skipped (cap):** 0
- Nenhum finding casou com issue aberta — o dedup rodou contra as 25 issues fechadas recentes

| Specialist | P0 | P1 | P2 | Issues |
|---|---|---|---|---|
| `security-auditor` | 2 | 4 | 5 | 6 |
| `code-reviewer` | 0 | 2 | 2 | 2 |
| `openapi-contract-specialist` | 0 | 1 | 0 | 1 |
| `release-versioning-specialist` | 0 | 1 | 0 | 1 |
| `prisma-db-specialist` | 0 | 0 | 2 | 0 |
| `otelcol-infra-specialist` | 0 | 0 | 2 | 0 |
| `docker-prod-specialist` | 0 | 0 | 3 | 0 |
| `doc-sync` | 0 | 0 | 2 | 0 |

## Os dois P0

**[#117 — Command injection no lint de review-routing](https://github.com/b3ll3o/projeto-base/issues/117)**
`tooling/scripts/lint-review-routing.ts:100` monta `git check-ignore` por interpolação de string com `JSON.stringify` — que **não** escapa `$( )` nem crase. O vetor é o **nome do arquivo**, controlado por quem abre o PR (via `git ls-files`). Cadeia até o CI verificada por leitura: `ci.yml:13` → `ci.yml:101` → `preflight.ts:79` → `package.json` → `lint-review-routing.ts:87` → `:100`. **PoC reproduzido do zero neste scan**: arquivo `$(touch PWNED).ts` commitado → marcador `PWNED` criado. Repo público ⇒ qualquer pessoa dispara isso num `pull_request`.

**[#118 — Senha do `app_runtime` versionada + escopo RLS escolhível pelo cliente](https://github.com/b3ll3o/projeto-base/issues/118)**
A senha `app_runtime_dev` está em texto puro na migration e no fonte, num **repositório público**. E o escopo de tenant é o GUC `app.tenant_id`, que **o cliente escolhe** — cujo valor `'*'` (bucket de sistema) a policy aceita. `NOBYPASSRLS` impede o papel de pular a policy; não impede o papel de escolher o valor. PoC do specialist: `SET app.tenant_id='*'` devolveu **todos** os usuários de todas as empresas, e um `UPDATE` alterou dados de outra empresa. Corrigir só a senha **não** fecha o bypass — o GUC precisa de credencial separada.

## As oito P1

| Issue | Specialist | Achado |
|---|---|---|
| [#119](https://github.com/b3ll3o/projeto-base/issues/119) | security-auditor | `GET /users` ignora `users.read` no escopo de tenant — `semDireito` é calculado e **descartado** pelo `&&` cujo primeiro membro é o sinal de *vínculo*. Membro sem a permissão lê o diretório inteiro (PII de coworker). |
| [#120](https://github.com/b3ll3o/projeto-base/issues/120) | security-auditor | `JWT_SECRET=CHANGE_ME_…` é aceito como segredo válido (`lerChaveObrigatoria` só recusa string vazia) → **forja de token de admin**, sem sintoma de boot. Mesmo padrão no `GF_SECURITY_ADMIN_PASSWORD`. |
| [#121](https://github.com/b3ll3o/projeto-base/issues/121) | security-auditor | O passo 5 do seed promove o **primeiro** usuário a admin global fora do guard `NODE_ENV=development` — o passo 4 tem o guard, o passo 5 (que é o mais perigoso) não. `POST /users` é `@Public()`, então a conta promovida pode ser de qualquer pessoa. |
| [#122](https://github.com/b3ll3o/projeto-base/issues/122) | security-auditor | Swagger sem condição de `NODE_ENV` enquanto o CORS, 20 linhas acima, **aborta o bootstrap** em produção. `/api/docs-json` serve o inventário de rotas + schemas sem auth. |
| [#123](https://github.com/b3ll3o/projeto-base/issues/123) | code-reviewer | `save(user, user.version() - 1)` pressupõe um `version++` que não ocorre quando `atribuirPerfil` é idempotente → 412 em reatribuição. O agregado `User` não tem o `loadedVersion()` que o `Profile` tem. |
| [#124](https://github.com/b3ll3o/projeto-base/issues/124) | code-reviewer | `limit`/`cursor` sem validação → **500 em vez de 400**; `limit=0`/`-5` devolvem 200 com lista vazia (falha silenciosa); as duas implementações do mesmo port discordam sobre o clamp. |
| [#125](https://github.com/b3ll3o/projeto-base/issues/125) | openapi-contract | OpenAPI não versionado **e** sem export no CI — a spec em disco é de 13/out e tem 5 paths contra 9 controllers; 7 controllers sem `@ApiTags`, 16 endpoints sem `@ApiOperation`. |
| [#126](https://github.com/b3ll3o/projeto-base/issues/126) | release-versioning | 4 footers divergentes (MONOREPO/estrutura 1.12.0 vs STACK/TEMPLATE_USAGE 1.11.0) → o `release-template` faz `exit 1`. 18 commits sem tag (7 feats). **Reincidência da #67**, fechada. |

## P2 — só relatório (16)

**Segurança:** refresh token não revogável e sem logout na API · CORS com `credentials:true` e `*` aceito no array · app web sem CSP/HSTS/X-Frame-Options (a API tem helmet) · Actions pinadas por tag e não por SHA · sem SCA automático no CI.

**Prisma:** 6 modelos sem o conjunto completo de audit fields (soft-delete seletivo é decisão documentada) · `findMany` sem `take` em 3 repositórios de listagem.

**OTel Collector:** propagação W3C não encontrada por grep explícito — **registrado por transparência**: o SDK Node registra W3C por padrão, então a ausência de config explícita **não** significa ausência de W3C (falso positivo da checagem por sintaxe) · collector é o único serviço sem healthcheck.

**Docker:** `postgres` sem `start_period` no healthcheck · `.dockerignore` usa `**/node_modules`/`**/.env`/`**/coverage` em vez dos literais testados pela skill — **falso positivo da checagem**, exclusões equivalentes existem · collector sem `user:` explícito, mas a imagem já roda como 10001 (verificado por `docker image inspect`).

**Docs:** drift `AGENTS.md` 1.12.0 vs `STACK.md`/`TEMPLATE_USAGE.md` 1.11.0 — mesmo fix do #126, não duplicado em issue · `pnpm docs:sync` não roda no sandbox (Node v20 vs engines ≥22.6) — **limitação de cobertura do scan**; `check-doc-refs` rodou verde.

**Código:** `atualizarEmail` sem rota HTTP (código morto, já com TODO) · `profiles.use-cases` importa serviço de infra concreto sem port — único desvio DDD do repo.

## Decisões de triagem

- **Cap atingido (10/10).** Ordenação por severity: os 2 P0 abriram primeiro; as 8 P1 preencheram o resto. Nenhuma P2 virou issue, e nenhuma P1 foi descartada — o cap não cortou nada.
- **Merges de findings da mesma causa-raiz** (uma issue, não duas): o `:id` não-UUID da rota de histórico e a divergência de clamp entre as implementações do port entraram na #124; o fake de spec que ignora `expectedVersion` entrou como critério de aceite da #123.
- **Correção de claim divergente.** O relatório do `security-auditor` afirmava que `.env.production.example:52` trazia a senha real do `app_runtime`; a leitura byte a byte mostra `app_runtime:***` (placeholder). A issue #118 cita os arquivos que realmente trazem o literal — migration e `papel-de-runtime.ts` — e não o example.
- **Falso positivo do PoC evitado.** A skill `otelcol-audit` (Passo 7) espera `W3CTraceContextPropagator` explícito; o SDK Node registra W3C por padrão, então a ausência da config **não** é defeito. Não virou issue.
- **Dedup contra issues fechadas.** #67 (drift de versão) e #102 (vazamento cross-tenant) foram conferidas: o drift reincidiu com outros números e o gate de `users.read` da #119 é diferente do que a #102 corrigiu. Nenhuma é duplicata.

## Verificação

- As 10 issues foram reconferidas após criação via `gh issue view --json number,title,labels,state` (labels e estado corretos) e `--json body` (seções `###` e critérios `- [ ]` presentes em todas).
- PoC do command injection reproduzido **do zero** neste scan, em repo git descartável — não apenas herdado do relatório do specialist.
- Evidência bruta das 5 auditorias determinísticas: `evidence/` (prisma, openapi, otelcol, docker, release).
- Bodies das issues: `bodies/`.

## Método de execução

Os 8 specialists do Passo 3 foram executados, mas com **dois mecanismos** — o passo "em paralelo" foi honrado por via diferente da inter-tool:

- **`code-reviewer` e `security-auditor`** (os dois que pedem julgamento, e não medição) — despachados **em paralelo** via subagente, cada um com permissão para subir Postgres/API real e medir. Ambos trouxeram PoCs executados, não leitura de código.
- **Os 5 de auditoria determinística** (`prisma-audit`, `openapi-audit`, `otelcol-audit`, `docker-prod-audit`, `release-versioning-audit`) — executados como os **procedimentos shell** que a skill de cada um define, no thread principal, em um único batch. Cada passo da skill rodou de verdade (`docker compose config`, `docker image inspect`, `docker run ... validate`, `jq`, `grep`, `git log`).
- **`doc-sync`** — executado pelos gates de doc do próprio repo (`check-doc-refs.ts`, exit 0) mais o confronto docs↔código do version footer.

**Por que não 8 subagentes em paralelo:** o limite prático medido é 1–2 subagentes por vez (acima disso o fan-out satura e é cancelado). Rodar os 5 auditores determinísticos como subagentes de LLM trocaria **evidência medida** por **interpretação** — o `prisma-audit` mede colunas de audit field por modelo, o `docker-prod-audit` mede `read_only`/`cap_drop` por serviço, o `otelcol-audit` valida o schema YAML. Os dois caminhos foram misturados por critério: LLM para o que exige julgamento, shell para o que exige medição.

## Limitações do scan

`pnpm docs:sync` não executou (Node v20.20.2 no sandbox vs `engines.node >= 22.6.0`), então a checagem de drift de docs do `doc-sync` ficou parcial — coberta pelo `check-doc-refs` (verde). Nenhum scanner de CVE foi executado (offline), então vulnerabilidades transitivas não estão confirmadas nem descartadas.
