---
name: documentation-audit
version: 1.0
updated: 2026-10-29
description: "Processo determinístico de auditoria de documentação — inventaria os docs versionados, mede a cobertura (unidade de código → doc canônico), detecta drift de claims (versões, comandos, paths) e freshness, e emite findings canônicos. Carregado por `documentation-specialist` quando a task é de auditoria (não escrita). Use para scan periódico, pré-release ou revisão sob demanda."
---

# Skill: documentation-audit

> **Quem invoca:** `documentation-specialist` (papel, princípios e anti-padrões
> ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** auditoria periódica, pré-tag, on-demand do user
> ("a documentação está em dia?"), ou depois de uma task que tocou código.

## Inputs (do controller)

```yaml
task:
  description: "<auditoria de documentação | detecção de drift | mapa de cobertura>"

context:
  scope: "cobertura | drift | tamanho | freshness | full"   # full = tudo
  code_units: [<paths>]        # opcional; vazio = repo inteiro
  doc_roots: ["docs", "README.md"]
```

## Passo 1 — Inventariar os docs versionados

```bash
# 1.1 Todos os .md versionados, com tamanho
git ls-files '*.md' | xargs wc -l | sort -rn | head -30

# 1.2 Só os que violam o teto de 300 linhas (convenção tamanho-e-revisao.md)
git ls-files '*.md' | xargs wc -l | awk '$1 > 300 && $2 != "total" {print}'

# 1.3 Docs canônicos por papel (o que NÃO é repositório de histórico)
git ls-files '*.md' | grep -vE '^docs/superpowers/|^\.agents/runs/'
```

> `docs/superpowers/plans/**` e `.agents/runs/**` são **histórico**: a
> convenção de tamanho e a exigência de frescor não valem para eles. Não
> acusar um plano de 2026-09 por estar desatualizado — ele é registro do que
> foi decidido naquela data.

## Passo 2 — Medir a cobertura (unidade de código → doc canônico)

```bash
# 2.1 Bounded contexts do backend → docs/api/<bc>.md
for m in apps/api/src/modules/*/; do
  bc=$(basename "$m")
  [ -f "docs/api/$bc.md" ] || echo "SEM DOC: módulo '$bc' → docs/api/$bc.md"
done

# 2.2 Rotas do frontend → catálogo em docs/web/rotas.md
find apps/web/app -name 'page.tsx' -o -name 'route.ts' | sort

# 2.3 Models do Prisma → precisam de menção no doc do BC e comentário /// no schema
grep '^model ' apps/api/prisma/schema.prisma

# 2.4 Packages do workspace → README próprio
for p in packages/*/; do
  pkg=$(basename "$p")
  [ -f "packages/$pkg/README.md" ] || echo "SEM DOC: packages/$pkg/README.md"
done
```

Cada ausência vira **gap nomeado** (§Passo 6) — nunca uma menção avulsa.

## Passo 3 — Detectar drift de claims

Três classes de claim verificável sem executar nada:

```bash
# 3.1 Versões declaradas em docs de stack vs package.json real
grep -nE '^\|.*(NestJS|Prisma|Next\.js|React|Vitest|Playwright)' docs/STACK.md
grep -E '"(nestjs/core|prisma/client|next|react|vitest|@playwright/test)"' apps/*/package.json

# 3.2 Comandos `pnpm <script>` citados em doc vs scripts existentes
#     (o gate check-runbook-drift já faz isso para docs/como-rodar.md —
#      aqui é o mesmo método, aplicado ao doc que está sendo auditado)
grep -rn 'pnpm [a-z:.-]\+' docs/ README.md | grep -v '\.agents/'

# 3.3 Paths citados no doc que não existem no repo
grep -rnoE '`(apps|packages|docs|\.agents)/[A-Za-z0-9._/-]+`' docs/ README.md \
  | grep -oE '`(apps|packages|docs|\.agents)/[A-Za-z0-9._/-]+`' | tr -d '`' | sort -u \
  | while read -r p; do [ -e "$p" ] || echo "PATH MORTO: $p"; done
```

> O `3.2` e o `3.3` são **o mesmo método** que o `check-runbook-drift` usa
> para `docs/como-rodar.md`. Ao auditar outro doc, reaproveite o padrão em vez
> de inventar outro — e se o doc auditado é o runbook, o gate já cobre: não
> reporte duas vezes o mesmo achado.

## Passo 4 — Frescor

```bash
# 4.1 Docs canônicos com data de medição ("Medido em YYYY-MM-DD")
grep -rn 'Medido em' docs/ README.md | sed 's/:.*Medido em/ → /' | cut -d' ' -f1 | sort | uniq -c

# 4.2 Footers de versão dos 4 docs canônicos (o gate check-version-footers
#     já valida que eles não divergem entre si)
grep -rn -i 'versão\|version' docs/MONOREPO.md docs/STACK.md docs/como-rodar.md docs/TEMPLATE_USAGE.md | head -20
```

**Frescor não é "foi editado recentemente".** É o doc afirmar algo que o
código ainda confirma. Um doc de 2026-09 que descreve um módulo que saiu em
2026-10 está desatualizado; um doc de 2026-09 que descreve algo que não mudou
está **ótimo** — reescrevê-lo só para "tocar" é churn.

## Passo 5 — Refs e links

```bash
# 5.1 O gate oficial (roda no preflight)
pnpm ci:preflight

# 5.2 Amostra do que ele mede, para o relatório
grep -rnoE '\[[^]]+\]\([^)]+\)' docs/ README.md | wc -l
```

Se o `check-doc-refs` acusar um link que **eu** acabei de escrever, o link
está errado — não o gate.

## Passo 6 — Findings canônicos

```yaml
# findings.yaml
- id: doc-001
  title: "BC 'tenancy' sem doc de referência"
  severity: P1                     # P0 = doc afirma o falsehood; P1 = lacuna; P2 = polimento
  location: "apps/api/src/modules/tenancy/"   # a unidade de código sem doc
  cause: "O módulo tem 7 endpoints e nenhuma entrada em docs/api/."
  impact: "Quem integra tenancy não acha o contrato em lugar nenhum do repo."
  evidence: "ls apps/api/src/modules/tenancy/ ; ls docs/api/"
  fix: "Criar docs/api/tenancy.md a partir da matriz de cobertura do agent."
  breaking_change: false
```

Severidade:

| Nível | Critério |
|---|---|
| **P0** | O doc **afirma** algo que o código contradiz (documentação mente) |
| **P1** | Unidade de código **sem** doc canônico (lacuna) |
| **P2** | Doc existe mas está incompleto, polido ou com link quebrado |

## Passo 7 — Fechar o loop

O achado só está resolvido quando existe **uma** destas duas coisas:

1. o doc canônico foi escrito/corrigido, **e** o gate ficou verde; ou
2. a lacuna está **declarada** num lugar canônico (a tabela de cobertura da
   convenção `documentacao.md`), com o motivo.

Um achado que só foi **relatado** e não corrigido nem declarado é o estado
pior que não ter auditado: agora existe a lista do que falta e nenhum dono.

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| "Faltam 12 docs" e o plano não diz quais | Contagem sem a **unidade** | Todo gap carrega a unidade de código (§Passo 6) |
| Acusar plano de `docs/superpowers/` por estar velho | Histórico não é doc viva | Excluir histórico do escopo (§Passo 1) |
| Reportar o mesmo drift duas vezes (skill + gate) | Duas fontes, um fato | O gate já cobre `docs/como-rodar.md`; não repetir (§Passo 3) |
| Chamar `wc -l` em arquivo não versionado | `git ls-files` só enxerga o versionado | Versionar ou medir o disco — e declarar qual |
| "Doc atualizado" só porque a data é de hoje | Fresh ≠ reescrita | Frescor = o que o doc afirma ainda vale (§Passo 4) |
| Achado sem `evidence` reproduzível | Claim não verificado | Todo finding carrega o comando (§`tamanho-e-revisao.md`) |

## Saída

- `findings.yaml` no formato canônico (§Passo 6).
- **Sucesso** = todo achado tem unidade, evidência reproduzível e destino
  (corrigido **ou** declarado). Nenhum achado órfão.

## Referências

- Agent: `.agents/agents/documentation-specialist.md` (papel, matriz de cobertura, anti-padrões)
- Convenção: `.agents/specs/conventions/documentacao.md`
- Gate: `.tooling/scripts/ci/check-doc-coverage.ts`
- Convenções vizinhas: `tamanho-e-revisao.md` (300 linhas), `dry.md` (fato único),
  `idioma.md` (pt-BR), `guard-classes.md` (gate que reporta verde sem medir)
