---
name: contract-docs-audit
version: 1.0
updated: 2026-11-18
description: "Processo determinístico de auditoria do pilar 4 do kit de documentação — mede o artefato OpenAPI versionado, a cobertura do ERD sobre os models do Prisma, o gatilho do item condicional AsyncAPI e a existência de um doc de contrato por bounded context. Carregado por `contract-docs-auditor` quando a task é de auditoria (não escrita). Use para scan periódico, pré-release ou revisão sob demanda."
---

# Skill: contract-docs-audit

> **Quem invoca:** `contract-docs-auditor` (papel, princípios e anti-padrões
> ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** scan periódico do pilar 4 do kit, pré-release, ou
> on-demand ("os contratos estão documentados e batem com o código?").

## O que esta skill mede

Os **itens 9, 10 e 11** da matriz da convenção
[`kit-documentacao.md`](../../specs/conventions/kit-documentacao.md) §2.4:

| Item | Doc canônico | Tipo | Condição |
|---|---|---|---|
| 9 — OpenAPI / Swagger | `apps/api/openapi.json` | artefato | obrigatório |
| 10 — AsyncAPI | `docs/api/asyncapi.yaml` | arquivo | **condicional** |
| 11 — ERD / Data Dictionary | `docs/system-design/dados.md` | arquivo | obrigatório |

> **Esta skill imprime MEDIDA, não veredito.** Ela não emite `✗` e não decide
> severidade: quem decide é o gate
> [`check-doc-kit`](../../../.tooling/scripts/ci/check-doc-kit.ts) e a leitura
> do agent. O gate `check-audit-skills` executa estes passos contra o repo real
> e trata a linha `✗` como falha.

## Inputs (do controller)

```yaml
task:
  description: "<auditoria do pilar 4 do kit: contratos | interfaces>"

context:
  scope: "openapi|erd|asyncapi|bc|full"   # full = tudo
  openapi: "apps/api/openapi.json"
  erd: "docs/system-design/dados.md"
  prisma: "apps/api/prisma/schema.prisma"
```

## Passo 1 — OpenAPI: o artefato versionado e as chaves que o item exige

```bash
# [gate: run — mede o artefato OpenAPI versionado e as três chaves que o item exige]
f=apps/api/openapi.json
if [ ! -f "$f" ]; then
  echo "$f: ausente no repo — 0 chave(s) medida(s)"
else
  echo "$f: $(wc -c < "$f") byte(s), $(git ls-files --error-unmatch "$f" 2>/dev/null | wc -l) entrada(s) no índice do git"
  for k in '"openapi"' '"paths"' '"components"'; do
    echo "  chave $k: $(grep -cF "$k" "$f") ocorrência(s)"
  done
fi
```

## Passo 2 — ERD: o diagrama e a cobertura dos models do Prisma

O doc do ERD cita o model pelo **nome do model** ou pelo **nome da tabela**
(declarado no `@@map` do schema) — as duas formas existem no repo.

```bash
# [gate: run — confere o ERD e se cada model do schema Prisma aparece no doc de dados]
f=docs/system-design/dados.md
if [ ! -f "$f" ]; then
  echo "$f: ausente no repo — ERD e models não medidos"
else
  echo "$f: $(grep -c 'erDiagram' "$f") ocorrência(s) de erDiagram"
  total=0
  citados=0
  while read -r m t; do
    total=$((total + 1))
    if grep -qiE "(^|[^A-Za-z0-9_])$m([^A-Za-z0-9_]|$)" "$f" || grep -qiE "(^|[^A-Za-z0-9_])$t([^A-Za-z0-9_]|$)" "$f"; then
      citados=$((citados + 1))
    else
      echo "  model sem menção no doc de dados: $m (tabela $t)"
    fi
  done < <(awk '/^model /{m=$2; t=$2} /@@map\(/{l=$0; sub(/^.*@@map\("/,"",l); sub(/".*$/,"",l); t=l} /^}/{if(m!=""){print m, t; m=""}}' apps/api/prisma/schema.prisma)
  echo "  models do Prisma: $total, citados em $f: $citados"
fi
```

## Passo 3 — AsyncAPI: o gatilho do item condicional

O item 10 é **condicional** (convenção §4): ele nasce quando existe canal
assíncrono. O passo mede o **gatilho** e a **declaração de não-aplicabilidade**
— os dois lados que a §4 cobra.

```bash
# [gate: run — mede o gatilho do item condicional AsyncAPI e a declaração de não-aplicabilidade]
achados=$(grep -lE '"bullmq"|"kafkajs"|"amqplib"|"@aws-sdk/client-sqs"' package.json apps/*/package.json packages/*/package.json 2>/dev/null | wc -l)
if [ "$achados" -gt 0 ]; then
  echo "asyncapi: gatilho DISPARA em $achados package.json — o item 10 do kit passa a ser obrigatório"
else
  echo "asyncapi: gatilho não dispara (0 package.json com broker) — não-aplicabilidade declarada na §4 da convenção"
fi
conv=.agents/specs/conventions/kit-documentacao.md
linha=$(grep -m1 '^| AsyncAPI |' "$conv")
if [ -z "$linha" ]; then
  echo "convenção §4: sem linha para o item AsyncAPI"
elif echo "$linha" | grep -q 'não tem broker'; then
  echo "convenção §4: linha do AsyncAPI com não-aplicabilidade declarada (o repo não tem broker)"
else
  echo "convenção §4: linha do AsyncAPI sem a declaração de não-aplicabilidade no corpo"
fi
if [ -f docs/api/asyncapi.yaml ]; then
  echo "docs/api/asyncapi.yaml: existe"
else
  echo "docs/api/asyncapi.yaml: ausente — coerente com o gatilho que não dispara"
fi
```

## Passo 4 — Um doc de contrato por bounded context

```bash
# [gate: run — confere se cada bounded context do backend tem doc de contrato em docs/api]
for m in $(ls apps/api/src/modules); do
  if [ -f "docs/api/$m.md" ]; then
    echo "  ok: docs/api/$m.md"
  else
    echo "  SEM DOC: docs/api/$m.md"
  fi
done
echo "bounded contexts: $(ls apps/api/src/modules | wc -l), docs de contrato em docs/api: $(ls docs/api | wc -l)"
for d in $(ls docs/api); do
  base="${d%.md}"
  achou=""
  for m in $(ls apps/api/src/modules); do
    case "$base" in
      "$m" | "$m"-*) achou="$m" ;;
    esac
  done
  if [ -n "$achou" ]; then
    echo "  docs/api/$d: corresponde ao BC $achou"
  else
    echo "  docs/api/$d: sem BC correspondente em apps/api/src/modules"
  fi
done
```

## Passo 5 — Fechar o loop

O achado só fecha quando o doc foi escrito/corrigido **e** o `check-doc-kit`
ficou verde, ou quando a lacuna está **declarada** num lugar canônico.

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| Procurar o model pelo nome do model só | O doc do ERD usa o **nome da tabela** (`users_history`, não `UserHistory`) | Medir as duas formas (o `@@map` é a ponte) |
| Concluir que o AsyncAPI "falta" | Ele é **condicional** e o gatilho não dispara | Medir o gatilho e a declaração da §4 |
| Acusar `docs/api/users-migracoes.md` como doc sem BC | O doc tem prefixo do BC (`users-`) | O casamento aceita `bc` e `bc-*` |
| Tratar o `openapi.json` como doc escrito à mão | Ele é **artefato gerado**; a fonte é o decorator | Quem mede o frescor é o `check-openapi-contract` |

## Saída

- Lista de medidas por item (chaves do OpenAPI, cobertura do ERD, gatilho do
  AsyncAPI, cobertura de BC).
- **Sucesso** = todo item do pilar tem medida com nome e número.

## Referências

- Agent: `.agents/agents/contract-docs-auditor.md` (papel, anti-padrões)
- Convenção: `.agents/specs/conventions/kit-documentacao.md` §2.4 e §4
- Gate: `.tooling/scripts/ci/check-doc-kit.ts`
- Specs dos itens: `openapi-doc-specialist` · `asyncapi-specialist` ·
  `erd-specialist`
- Schema: [`apps/api/prisma/schema.prisma`](../../../apps/api/prisma/schema.prisma)
