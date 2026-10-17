---
name: multi-tenant-audit
version: 1.0
updated: 2026-10-16
description: "Processo determinístico de auditoria multi-tenant — mapeia models sem tenant_id, queries sem filtro de tenant, chaves de cache que não incluem tenant, RLS/políticas e o gate de isolamento cross-tenant. Carregado por `multi-tenant-specialist` quando a task é de auditoria (não criação). NÃO é despachada pelo `finding-orchestrator` (a lista de audit specialists dele é fixa em 5, `finding-orchestrator.md:82-91`, e não inclui tenancy). Para scan periódico, despache o `multi-tenant-specialist` direto."
---

# Skill: multi-tenant-audit

> **Quem invoca:** `multi-tenant-specialist` (papel, princípios, anti-padrões
> ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** auditoria periódica (cron `weekly-findings-scan`),
> pré-tag, ou on-demand ("audite o isolamento entre empresas").
>
> **Read-only e offline.** Nenhum comando escreve no banco, no código ou no
> git. RLS não pode ser ligado aqui: RLS sem produtor é deny-all silencioso.
>
> **Código de saída.** `grep` devolve **1 quando não acha** — num sweep de
> tenancy isso é o resultado esperado antes da Fase 2, não erro. Só conta como
> erro de execução se o `2` aparecer (arquivo/flag inválido).

## Inputs (do controller)

```yaml
task:
  description: "<auditoria de isolamento entre tenants>"

context:
  scope: "schema|queries|cache|frontier|rls|gate|full"  # full = tudo
  prisma_path: "apps/api/prisma/"
  modules_path: "apps/api/src/modules/"
  web_path: "apps/web/"
  e2e_path: "apps/api/test/e2e/"
```

Todos os comandos assumem **cwd = raiz do repo**.

## Passo 1 — Inventário de tenancy (o que existe)

```bash
# 1.1 Model por model: falta tenantId?
grep -E "^model " apps/api/prisma/schema.prisma | awk '{print $2}' | while read -r m; do
  if grep -A 40 "^model $m " apps/api/prisma/schema.prisma | grep -qE "tenantId"; then
    echo "OK    $m"
  else
    echo "FALTA $m"
  fi
done

# 1.2a Quantos campos tenantId existem no schema (0 = pré-tenancy)
grep -cE "tenantId" apps/api/prisma/schema.prisma

# 1.2b Índice em tenant_id em alguma migration
grep -rniE "CREATE (UNIQUE )?INDEX[^;]*tenant" apps/api/prisma/migrations/

# 1.3 Algum módulo menciona tenant?
grep -rlniE "tenant" apps/api/src/modules/
```

`FALTA` na 1.1 é **informação**, não finding, enquanto a estratégia D1 não
tiver sido implementada ainda. Vira finding quando o schema **declara** tenancy
e alguma model fica de fora.

## Passo 2 — Escopo de query (toda query filtra por tenant?)

```bash
# 2.1 Contagem de chamadas Prisma sem menção a tenant
grep -rnE "(this\.prisma|tx)\.[a-zA-Z]+\.(findMany|findFirst|findUnique|update|updateMany|delete|deleteMany|upsert)\(" \
  apps/api/src/modules/*/infrastructure/persistence/*.repository.ts \
  | grep -viE "tenant" | wc -l

# 2.2 As linhas — evidência do finding
grep -rnE "(this\.prisma|tx)\.[a-zA-Z]+\.(findMany|findFirst|findUnique|update|updateMany|delete|deleteMany|upsert)\(" \
  apps/api/src/modules/*/infrastructure/persistence/*.repository.ts \
  | grep -viE "tenant"
```

> O `.` entre `this.prisma` e o verbo existe porque o acesso real é
> `this.prisma.user.findMany` — sem ele o grep casa zero e o gate parece verde.

## Passo 3 — Fronteira e cache

```bash
# 3.1 Header de tenant propagado (api + web)
grep -rn "X-Tenant-Id" apps packages --include=*.ts --include=*.tsx \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.next-e2e | wc -l

# 3.2 Rotas @Public() — isentas de tenant por construção (só as declarações)
grep -rn "^[[:space:]]*@Public()" apps/api/src/modules --include=*.ts \
  | grep -v "\.spec\.ts"

# 3.3 Chave de cache que não inclui tenant
grep -rnE "(#store|\bcache)\.(get|set|delete|has)\(" apps/api/src --include=*.ts \
  --exclude=*.spec.ts | grep -viE "tenant"

# 3.4 Revalidação de cache do Next (é por path, não por tenant)
grep -rn "revalidatePath\|unstable_cache\|next/cache" apps/web --include=*.ts \
  --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next \
  --exclude-dir=.next-e2e --exclude=*.spec.ts
```

> 3.4 exige os três `--exclude-dir`: sem eles o grep devolve o
> `apps/web/.next*/types/cache-life.d.ts` gerado, que polui a evidência com
> artefato de build.

## Passo 4 — RLS (2ª camada)

```bash
# 4.1 Policies e RLS declarados nas migrations
grep -rniE "ROW LEVEL SECURITY|CREATE POLICY" apps/api/prisma/migrations/

# 4.2 Produtor do contexto (set_config / app.current_tenant) no código
grep -rn "set_config\|current_tenant" apps/api/src apps/api/prisma
```

Achado crítico: **4.1 cheio e 4.2 vazio** = RLS deny-all, toda query da tabela
volta vazia. Não é "falta de dado", é app quebrada. O inverso (4.2 sem 4.1) é
contexto setado e não usado.

## Passo 5 — Gate de isolamento cross-tenant

```bash
# 5.1 Existe spec de isolamento/tenancy?
ls apps/api/test/e2e/scenarios/ | grep -iE "tenant|isolamento" \
  || echo "FALTA: nenhum spec de isolamento cross-tenant"

# 5.2 Arquivo de spec/helper que menciona 403 (o negativo existe em algum lugar?)
grep -rlE "403|FORBIDDEN|Forbidden" apps/api/test/e2e/
```

5.1 sem resultado é **P1** depois que a tenancy existe: sem o negativo, um
filtro que filtra demais (sempre 404) passa.

## Passo 6 — Persistir findings (formato canônico)

```yaml
# findings.yaml (em .agents/runs/findings-<ts>/ ou local)
- id: tenant-N1-001
  title: "Cache de perfil não inclui tenant na chave"
  severity: P1
  location: "apps/api/src/shared/infrastructure/security/user-profile-cache.service.ts:29"
  cause: "Chave = userId cru; dois tenants do mesmo usuário colidem no mesmo slot."
  impact: "Usuário da empresa A recebe o perfil da empresa B por até 5s (TTL)."
  evidence: "Passo 3.3: 4 acessos ao #store, todos com userId."
  fix: "Chave = `${tenantId}:${userId}`; invalidar por tenant."
  breaking_change: false
  leak_vector: "cache → perfil de outro tenant"
```

## Passo 7 — Devolver ao `finding-orchestrator`

Ele classifica severity final, deduplica contra issues abertas via
`gh issue list --search`, e decide P0/P1 viram issue (P2 só relatório).

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| Passo 2 devolve **0** com tenancy já implementada | glob não pegou os repositórios novos | conferir `ls apps/api/src/modules/*/infrastructure/persistence/`; **contagem 0 num conjunto que deveria ser >0 é resultado suspeito**, não verde |
| `findByEmail` aparece no Passo 2.2 | login é global por D4 | **não é finding** — excluir da evidência e dizer por quê no `fix` |
| `in-memory-user.repository.ts` aparece no Passo 2 | fake de teste, não produção | filtrar; não é query real |
| Passo 3.4 devolve `.next/types/cache-life.d.ts` | faltou `--exclude-dir=.next` | reexecutar com os três `--exclude-dir` |
| Passo 1.2b vazio com `tenantId` no schema | coluna sem índice | finding P1: filtro por tenant em coluna sem índice é seq scan por request |
| `FALTA` na 1.1 antes da Fase 2 do plano | tenancy ainda não implementada | estado esperado; não é finding até a estratégia existir |
| RLS com policy mas sem `WITH CHECK` | policy só de leitura | finding P1: escrita cross-tenant passa |

## Saída

- `findings.yaml` com a lista canônica (id, title, severity, location, cause,
  impact, evidence, fix)
- Sucesso = `findings_count` numérico; nenhum comando retornou código não-zero
  sem tratamento; todo `wc -l` acompanhado do valor esperado (0 num conjunto
  que deveria ter linhas é **achado**, não aprovação)

## Referências

- Agent: `.agents/agents/multi-tenant-specialist.md` (papel, coordenação, anti-padrões)
- Regra de 3 passos do backfill: `.agents/agents/prisma-db-specialist.md:160`
- E2E / inventário de fluxos: `.agents/specs/conventions/e2e-playwright.md`
- Postgres RLS: <https://www.postgresql.org/docs/16/ddl-rowsecurity.html>