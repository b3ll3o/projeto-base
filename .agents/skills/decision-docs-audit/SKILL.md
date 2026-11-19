---
name: decision-docs-audit
version: 1.0
updated: 2026-11-18
description: "Processo determinístico de auditoria do pilar 3 do kit de documentação — mede as três seções obrigatórias de cada ADR, a cobertura do índice de domínio sobre os ADRs em disco, as seções mínimas do PRD e do TDR e a citação da instância pelos dois índices. Carregado por `decision-docs-auditor` quando a task é de auditoria (não escrita). Use para scan periódico, pré-release ou revisão sob demanda."
---

# Skill: decision-docs-audit

> **Quem invoca:** `decision-docs-auditor` (papel, princípios e anti-padrões
> ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** scan periódico do pilar 3 do kit, pré-release, ou
> on-demand ("as decisões estão registradas e indexadas?").

## O que esta skill mede

Os **itens 6, 7 e 8** da matriz da convenção
[`kit-documentacao.md`](../../specs/conventions/kit-documentacao.md) §2.3:

| Item | Doc canônico | Tipo | Índice |
|---|---|---|---|
| 6 — PRD / One-Pager | `docs/prd/0001-projeto-base.md` | arquivo | `docs/prd/README.md` |
| 7 — TDR / RFC | `docs/tdr/0001-system-design-canonico.md` | arquivo | `docs/tdr/README.md` |
| 8 — ADR | `docs/adr/*.md` | família | `docs/agents/domain.md` |

> **Esta skill imprime MEDIDA, não veredito.** Ela não emite `✗` e não decide
> severidade: quem decide é o gate
> [`check-doc-kit`](../../../.tooling/scripts/ci/check-doc-kit.ts) e a leitura
> do agent. O gate `check-audit-skills` executa estes passos contra o repo real
> e trata a linha `✗` como falha.

## Inputs (do controller)

```yaml
task:
  description: "<auditoria do pilar 3 do kit: decisões | planejamento>"

context:
  scope: "prd|tdr|adr|indices|full"   # full = tudo
  adr_dir: "docs/adr/"
  prd_instancia: "docs/prd/0001-projeto-base.md"
  tdr_instancia: "docs/tdr/0001-system-design-canonico.md"
```

## Passo 1 — ADR: as três seções obrigatórias, arquivo por arquivo

```bash
# [gate: run — confere as três seções obrigatórias de cada ADR em disco]
total=0
completos=0
for f in $(git ls-files 'docs/adr/*.md'); do
  total=$((total + 1))
  falta=""
  for s in '## Contexto' '## Decisão' '## Consequências'; do
    if ! grep -qF "$s" "$f"; then
      falta="$falta [$s]"
    fi
  done
  if [ -z "$falta" ]; then
    completos=$((completos + 1))
  else
    echo "  $f: sem a seção$falta"
  fi
done
echo "docs/adr: $total ADR(s) em disco, $completos com as três seções obrigatórias"
```

## Passo 2 — ADR: o índice de domínio cita cada ADR

```bash
# [gate: run — confere se o índice de domínio cita cada ADR que existe em disco]
idx=docs/agents/domain.md
citados=0
total=0
for f in $(git ls-files 'docs/adr/*.md'); do
  total=$((total + 1))
  nome=$(basename "$f")
  if grep -qF "$nome" "$idx"; then
    citados=$((citados + 1))
  else
    echo "  ADR fora do índice $idx: $nome"
  fi
done
echo "$idx: $citados de $total ADR(s) citado(s)"
```

## Passo 3 — PRD: as três seções mínimas

```bash
# [gate: run — mede as três seções mínimas do PRD e a citação da instância no índice]
f=docs/prd/0001-projeto-base.md
if [ ! -f "$f" ]; then
  echo "$f: ausente no repo — 0 de 3 seções medidas"
else
  for s in '## Problema' '## Objetivo de negócio' '## Métricas de sucesso'; do
    if grep -qF "$s" "$f"; then
      echo "  presente: $s"
    else
      echo "  AUSENTE: $s"
    fi
  done
  echo "$f: $(wc -l < "$f") linha(s)"
fi
idx=docs/prd/README.md
if [ -f "$idx" ]; then
  if grep -qF '0001-projeto-base.md' "$idx"; then
    echo "$idx: cita a instância 0001-projeto-base.md"
  else
    echo "$idx: NÃO cita a instância 0001-projeto-base.md"
  fi
else
  echo "$idx: ausente no repo — índice do PRD não medido"
fi
```

## Passo 4 — TDR: as cinco seções mínimas

```bash
# [gate: run — mede as cinco seções mínimas do TDR e a citação da instância no índice]
f=docs/tdr/0001-system-design-canonico.md
if [ ! -f "$f" ]; then
  echo "$f: ausente no repo — 0 de 5 seções medidas"
else
  for s in '## Proposta' '## Riscos' '## Segurança' '## Rollout' '## Revisão'; do
    if grep -qF "$s" "$f"; then
      echo "  presente: $s"
    else
      echo "  AUSENTE: $s"
    fi
  done
  echo "$f: $(wc -l < "$f") linha(s)"
fi
idx=docs/tdr/README.md
if [ -f "$idx" ]; then
  if grep -qF '0001-system-design-canonico.md' "$idx"; then
    echo "$idx: cita a instância 0001-system-design-canonico.md"
  else
    echo "$idx: NÃO cita a instância 0001-system-design-canonico.md"
  fi
else
  echo "$idx: ausente no repo — índice do TDR não medido"
fi
```

## Passo 5 — Fechar o loop

O achado só fecha quando o doc foi escrito/corrigido **e** o `check-doc-kit`
ficou verde, ou quando a lacuna está **declarada** num lugar canônico.

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| Contar `## Consequências negativas` como a seção `## Consequências` | O `grep -F` casa o prefixo — e está certo: a seção existe | Não exigir correspondência exata de linha |
| Acusar o índice de domínio por não citar o ADR de um item que **não é ADR** | `docs/agents/domain.md` é o índice dos ADRs | Conferir a coluna `Índice` da matriz |
| Tratar o PRD como o plano do `docs/superpowers/plans/` | O plano é histórico; o PRD é a instância viva | O item 6 mede o `docs/prd/`, nunca `docs/superpowers/` |
| Reportar "seção ausente" a partir de um arquivo inexistente | Ausência do doc e ausência da seção são coisas diferentes | O passo 3 e o 4 medem o arquivo **e** as seções, separadamente |

## Saída

- Lista de medidas por item (ADRs por arquivo, citações do índice, seções do
  PRD e do TDR).
- **Sucesso** = todo item do pilar tem medida com nome e número.

## Referências

- Agent: `.agents/agents/decision-docs-auditor.md` (papel, anti-padrões)
- Convenção: `.agents/specs/conventions/kit-documentacao.md` §2.3
- Gate: `.tooling/scripts/ci/check-doc-kit.ts`
- Specs dos itens: `prd-specialist` · `tdr-specialist` · `adr-specialist`
- Índice dos ADRs: [`docs/agents/domain.md`](../../../docs/agents/domain.md)
