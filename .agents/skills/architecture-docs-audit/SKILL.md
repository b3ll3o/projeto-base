---
name: architecture-docs-audit
version: 1.0
updated: 2026-11-18
description: "Processo determinístico de auditoria do pilar 2 do kit de documentação — mede as seções do HLD (docs/system-design/README.md), a presença dos dois níveis do C4 (contexto.md), o bloco %%{init}%% de cada diagrama Mermaid do conjunto e a existência de cada ADR citado pelo índice. Carregado por `architecture-docs-auditor` quando a task é de auditoria (não escrita). Use para scan periódico, pré-release ou revisão sob demanda."
---

# Skill: architecture-docs-audit

> **Quem invoca:** `architecture-docs-auditor` (papel, princípios e anti-padrões
> ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** scan periódico do pilar 2 do kit, pré-release, ou
> on-demand ("o desenho do sistema ainda é o que o código faz?").

## O que esta skill mede

Os **itens 4 e 5** da matriz da convenção
[`kit-documentacao.md`](../../specs/conventions/kit-documentacao.md) §2.2:

| Item | Doc canônico | O que esta skill mede |
|---|---|---|
| 4 — HLD / Overview | `docs/system-design/README.md` | as 3 seções de índice, princípios e extensão |
| 5 — Diagramas C4 | `docs/system-design/contexto.md` | os 2 níveis do C4 |

E duas medidas transversais do **conjunto** `docs/system-design/`: o bloco de
inicialização dos diagramas (§2.3 do README) e a existência dos ADRs citados.

> **Esta skill imprime MEDIDA, não veredito.** Ela não emite `✗` e não decide
> severidade: quem decide é o gate
> [`check-doc-kit`](../../../.tooling/scripts/ci/check-doc-kit.ts) e a leitura
> do agent. O gate `check-audit-skills` executa estes passos contra o repo real
> e trata a linha `✗` como falha.

## Inputs (do controller)

```yaml
task:
  description: "<auditoria do pilar 2 do kit: arquitetura | visão macro>"

context:
  scope: "hld|c4|mermaid|adr|full"   # full = tudo
  conjunto: "docs/system-design/"
```

## Passo 1 — HLD: índice, princípios e contrato de extensão

```bash
# [gate: run — mede as três seções mínimas do HLD e o tamanho do arquivo]
f=docs/system-design/README.md
if [ ! -f "$f" ]; then
  echo "$f: ausente no repo — 0 de 3 seções medidas"
else
  for s in '## §1. Ordem de leitura' '## §3. Os 8 princípios' '## §4. Como um aplicativo derivado estende isto'; do
    if grep -qF "$s" "$f"; then
      echo "  presente: $s"
    else
      echo "  AUSENTE: $s"
    fi
  done
  echo "$f: $(wc -l < "$f") linha(s)"
fi
```

## Passo 2 — C4: os dois níveis

```bash
# [gate: run — mede os dois níveis do C4 no doc de contexto e contêineres]
f=docs/system-design/contexto.md
if [ ! -f "$f" ]; then
  echo "$f: ausente no repo — 0 de 2 níveis medidos"
else
  for s in '## §1. C4 — Nível 1: o contexto' '## §2. C4 — Nível 2: os contêineres'; do
    if grep -qF "$s" "$f"; then
      echo "  presente: $s"
    else
      echo "  AUSENTE: $s"
    fi
  done
  echo "$f: $(grep -c '^```mermaid' "$f") bloco(s) mermaid, $(wc -l < "$f") linha(s)"
fi
```

## Passo 3 — O conjunto: todo Mermaid com o bloco `%%{init}%%`

O README §2.3 declara que **todo** diagrama do conjunto começa com o bloco de
inicialização — é a regra visual do conjunto. A medida conta o bloco
`` ```mermaid `` e olha a linha seguinte.

```bash
# [gate: run — conta os blocos Mermaid do conjunto e quantos trazem o init canônico]
total=0
com_init=0
for f in docs/system-design/*.md; do
  m=$(awk '/^```mermaid/{t++; if ((getline linha) > 0 && index(linha, "%%{init") > 0) o++} END{print t+0, o+0}' "$f")
  set -- $m
  echo "$f: $1 bloco(s) mermaid, $2 com o bloco de init"
  total=$((total + $1))
  com_init=$((com_init + $2))
done
echo "conjunto docs/system-design: $total bloco(s) mermaid, $com_init com o bloco %%{init}%%"
```

## Passo 4 — O conjunto: todo ADR citado pelo índice existe em disco

```bash
# [gate: run — confere se os ADRs citados pelo índice do system design existem em docs/adr]
f=docs/system-design/README.md
citados=$(grep -oE '\.\./adr/[0-9]{4}-[a-z0-9.-]+\.md' "$f" | sort -u)
n=0
total=0
for a in $citados; do
  total=$((total + 1))
  nome=$(basename "$a")
  if [ -f "docs/adr/$nome" ]; then
    n=$((n + 1))
  else
    echo "  ADR citado sem arquivo em docs/adr: $nome"
  fi
done
echo "$f: $total ADR(s) citado(s), $n com arquivo em docs/adr/, $(ls docs/adr | wc -l) ADR(s) em disco"
```

## Passo 5 — Fechar o loop

O achado só fecha quando o doc foi corrigido **e** o `check-doc-kit` ficou
verde, ou quando a lacuna está **declarada** num lugar canônico (a §6 do
README do system design — "O que ainda não existe" — é um deles).

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| Contar o bloco ````text` `` do README §2.3 como um diagrama | O README **mostra** o bloco canônico num fence de texto | Contar só o que segue de ```` ```mermaid `` `` |
| Confundir "o ADR citado não existe" com "o ADR citado está errado" | O índice aponta o ADR que ele desenha | Reportar o nome; quem corrige é o `hld-specialist` |
| Exigir `%%{init}%%` em diagrama fora de `docs/system-design/` | A regra é do **conjunto** do system design | Medir só `docs/system-design/*.md` |
| Auditar o C4 como se fosse o `modulo.md` | O C4 tem 2 níveis; o módulo é outro doc | O item 5 é o `contexto.md` |

## Saída

- Lista de medidas por item (seções, níveis, blocos Mermaid, ADRs citados).
- **Sucesso** = todo item do pilar tem medida com nome e número.

## Referências

- Agent: `.agents/agents/architecture-docs-auditor.md` (papel, anti-padrões)
- Convenção: `.agents/specs/conventions/kit-documentacao.md` §2.2
- Gate: `.tooling/scripts/ci/check-doc-kit.ts`
- Specs dos itens: `hld-specialist` · `c4-specialist`
- ADRs: [`docs/adr/`](../../../docs/adr/)
