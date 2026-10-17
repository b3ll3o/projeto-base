---
agent: multi-tenant-specialist
scope: estratégia de isolamento, fronteira de tenant, escopo de query, RLS, cache por tenant, backfill, gate cross-tenant — arquitetura + auditoria
skill: .agents/skills/multi-tenant-audit/SKILL.md
---

# Memory: `multi-tenant-specialist`

Memory file canônico. **Estado atual: stub inicial** (criado em 2026-10-16
com a Fase 1 do plano `docs/superpowers/plans/2026-10-16-multi-tenant-plan.md`).

## Skill carregada

Carrega `.agents/skills/multi-tenant-audit/SKILL.md` quando a task é de
**auditoria** (o processo determinístico, read-only e offline são os passos
shell). A skill encapsula os passos + dedup + persistência; este arquivo de
memória guarda estado entre execuções.

O resto do tempo (decidir estratégia, desenhar a fronteira, escrever migration)
é papel do **agent**, não da skill.

## Estado atual

- Agent file: `.agents/agents/multi-tenant-specialist.md`
- Primeira aparição: v1.0 (Fase 1 do plano multi-tenant, 2026-10-16)
- Findings emitidos: vide `.agents/runs/findings-<ts>/findings.yaml`

## Decisões fechadas que o agente herda

Registradas aqui porque são o estado que a memória precisa preservar — cada uma
mudou o que o agente checa:

| # | Decisão | Onde |
|---|---------|------|
| D1 | schema único + `tenant_id`, RLS como 2ª camada | plano §1 |
| D2 | contexto por header `X-Tenant-Id` | plano §1 |
| D3 | perfis globais (`tenant_id IS NULL`) + customizados por tenant | plano §1 |
| D4 | 1 conta, N memberships; `email` UNIQUE global | plano §1 |
| D5 | entrada por empresa própria **ou** convite | plano §1 |

> `schema-per-tenant` e `db-per-tenant` estão **fora de escopo** (D1 decidiu
> contra). Se alguém pedir, isso é revisão de D1, não execução.

## Baseline medido (2026-10-16, antes de qualquer código de tenancy)

Números que a primeira auditoria vai reencontrar — o "antes":

| Medida | Comando | Valor |
|--------|---------|-------|
| Models sem `tenantId` | Passo 1.1 da skill | **5/5** |
| `tenantId` no schema | `grep -cE "tenantId" apps/api/prisma/schema.prisma` | **0** |
| Índice em tenant nas migrations | Passo 1.2 | **0** |
| Arquivos com `tenant` em `apps/api/src/modules/` | `grep -rlniE "tenant" apps/api/src/modules/ \| wc -l` | **0** |
| Queries Prisma sem filtro de tenant | Passo 2.1 | **17** |
| Cache com chave sem tenant | Passo 3.3 | **4** (`user-profile-cache.service.ts`, chave = `userId`) |
| RLS (policy ou produtor) | Passo 4 | **0** |
| Spec de isolamento cross-tenant | Passo 5.1 | **ausente** |

## Falsos positivos conhecidos

Para não relatar de novo:

- **`findByEmail`** (`prisma-user.repository.ts:233`) **não** deve filtrar por
  tenant: sob D4 o login é global, é a porta de entrada da identidade.
- **`in-memory-user.repository.ts`** aparece no grep de repositório mas é
  fake de teste, não query de produção.
- **Governor de rotas `@Public()`** (`auth.controller.ts:100,171`,
  `users.controller.ts:106`) são 3; nenhuma delas é tenant-scoped por desenho.

## Convenções observadas

Este arquivo é atualizado pelo agent sempre que ele produzir findings novos:

1. **Findings recorrentes** que indicam classe de bug sistêmico
2. **Heurísticas** que funcionaram e devem virar regra
3. **Falsos positivos** conhecidos (acima — para não relatar de novo)
4. **Cruzamentos** com outros agents (ex.: finding de `prisma-db-specialist`
   que só vira vazamento quando combinado com ausência de filtro)
5. **Backlog de gaps** — detectado e ainda não corrigido

Formato de entrada (a ser preenchido pelo agent):

```yaml
- date: 2026-10-16
  finding_id: <id>
  severity: P0|P1|P2
  outcome: <resolved|deferred|false-positive|recurred>
  lesson: <1-liner do que aprendemos>
```

## Findings registrados

```yaml
- date: 2026-10-17
  finding_id: MT-4-1
  severity: P1
  outcome: resolved
  lesson: >-
    A porta declarava "a checagem de DONO do perfil e do implementador" e o
    implementador a fazia em UM dos dois ramos de findProfileId. Garantia
    escrita na porta precisa de asserção em CADA caminho: o ramo que nenhum
    teste exercita e onde a garantia morre em silencio.
- date: 2026-10-17
  finding_id: MT-4-2
  severity: P2
  outcome: resolved
  lesson: >-
    Um segundo `null` no mesmo teste pode vir do filtro errado. O teste de
    soft-delete apontava users.profile_id para perfil DE EMPRESA e passava pelo
    filtro de dono, nao pelo deletedAt. Quando um teste mede DUAS propriedades,
    cada precisa do dado que isola a sua.
- date: 2026-10-17
  finding_id: MT-4-3
  severity: P2
  outcome: deferred
  lesson: >-
    Trocar o caminho de LEITURA sem fechar o de ESCRITA deixa o isolamento
    pela metade, e nenhuma fase do plano tinha dono do write path. Achados
    registrados como pre-condicoes P1/P2/P3 da Fase 6.
```

## Baseline medido (2026-10-17, depois da Fase 4)

| Medida | Comando | Valor |
|--------|---------|-------|
| Writers de membership (`create`/`upsert` de `tenantMembership`) | `grep -rn "tenantMembership" apps/api/src --include=*.ts \| grep -v spec` | **2 linhas, ambas LEITURA** (`findFirst`, `count` no repositorio) — **0 escritas** |
| Leituras de perfil global | `grep -rn "\.profileId()" apps/api/src --include=*.ts \| grep -v spec` | **4 linhas, 1 delas de decisão**: `user.output.ts:35` e `user.prisma-mapper.ts:153` sao serializacao do DTO, `profiles.use-cases.ts:579` e comentario. So `profiles.use-cases.ts:586` le para decidir, de proposito (a escrita logo abaixo e na mesma coluna) |
| Isolamento cross-tenant provado | `grep -c "  it(" apps/api/src/modules/tenancy/infrastructure/persistence/tenancy-migration.integration.spec.ts` | **19**, Postgres real |

> ⚠️ A primeira linha muda o que a auditoria pode encontrar: ate a Fase 5 criar
> membership, **nenhum achado de vazamento cross-tenant e exploit** — e codigo
> exercitado so por spec. Nao reportar como P0 o que e latente.

## Triggers retroativos

Findings repetidos sobre o mesmo arquivo/location (>3x) é sinal de **classe de
bug sistêmico** — abrir issue classificada como tal, não como achado isolado.
O caso já medido: cache de perfil sem tenant reaparece em toda alteração de
perfil/RBAC desde o PR #97.