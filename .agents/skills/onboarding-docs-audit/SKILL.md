---
name: onboarding-docs-audit
version: 1.0
updated: 2026-11-18
description: "Processo determinístico de auditoria do pilar 1 do kit de documentação — mede as seções mínimas do README, do CONTRIBUTING e do GLOSSARY, e confere se os links que eles apontam existem em disco. Carregado por `onboarding-docs-auditor` quando a task é de auditoria (não escrita). Use para scan periódico, pré-release ou revisão sob demanda."
---

# Skill: onboarding-docs-audit

> **Quem invoca:** `onboarding-docs-auditor` (papel, princípios e anti-padrões
> ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** scan periódico do pilar 1 do kit, pré-release, ou
> on-demand ("a porta de entrada do repo ainda funciona?").

## O que esta skill mede

Os **itens 1, 2 e 3** da matriz da convenção
[`kit-documentacao.md`](../../specs/conventions/kit-documentacao.md) §2.1:

| Item | Doc canônico | O que esta skill mede |
|---|---|---|
| 1 — README (A Vitrine) | `README.md` | as 3 seções mínimas |
| 2 — CONTRIBUTING | `CONTRIBUTING.md` | as 4 seções mínimas |
| 3 — Glossário de Domínio | `GLOSSARY.md` | ≥ 1 termo declarado + citação de `docs/adr/` |

> **Esta skill imprime MEDIDA, não veredito.** Ela não emite `✗` e não decide
> severidade: quem decide é o gate
> [`check-doc-kit`](../../../.tooling/scripts/ci/check-doc-kit.ts) (âncoras e
> dono) e a leitura do agent (a prosa). O motivo é medido: o gate
> `check-audit-skills` executa estes passos contra o repo real e trata a linha
> `✗` como falha — um veredito impresso aqui viraria falso positivo do gate
> toda vez que o repo estivesse em dívida (que é o estado normal entre um
> merge e o conserto).

## Inputs (do controller)

```yaml
task:
  description: "<auditoria do pilar 1 do kit: onboarding | porta de entrada>"

context:
  scope: "readme|contributing|glossary|links|full"   # full = tudo
  docs: ["README.md", "CONTRIBUTING.md", "GLOSSARY.md"]
```

## Passo 1 — README: as três seções mínimas

```bash
# [gate: run — mede as três seções mínimas do README e o tamanho do arquivo]
if [ ! -f README.md ]; then
  echo "README.md: ausente no repo — 0 de 3 seções medidas"
else
  for s in '## O que é' '## Como executar localmente' '## Documentação'; do
    if grep -qF "$s" README.md; then
      echo "  presente: $s"
    else
      echo "  AUSENTE: $s"
    fi
  done
  echo "README.md: $(wc -l < README.md) linha(s)"
fi
```

## Passo 2 — CONTRIBUTING: as quatro seções mínimas

```bash
# [gate: run — mede as quatro seções mínimas do guia de contribuição]
if [ ! -f CONTRIBUTING.md ]; then
  echo "CONTRIBUTING.md: ausente no repo — 0 de 4 seções medidas"
else
  for s in '## Padrão de commits' '## Fluxo de branches' '## Code Review' '## Estilo de código'; do
    if grep -qF "$s" CONTRIBUTING.md; then
      echo "  presente: $s"
    else
      echo "  AUSENTE: $s"
    fi
  done
  echo "CONTRIBUTING.md: $(wc -l < CONTRIBUTING.md) linha(s)"
fi
```

## Passo 3 — GLOSSARY: termos declarados e citação dos ADRs

```bash
# [gate: run — mede os termos do glossário e a citação do diretório de ADRs]
if [ ! -f GLOSSARY.md ]; then
  echo "GLOSSARY.md: ausente no repo — 0 termo(s) medido(s), 0 citação(ões) de docs/adr/"
else
  for s in '## Termos do domínio' '## Como usar este glossário'; do
    if grep -qF "$s" GLOSSARY.md; then
      echo "  presente: $s"
    else
      echo "  AUSENTE: $s"
    fi
  done
  # O cabeçalho da tabela também casa com `^\|` — a contagem de termos
  # usa o formato do termo (`| **Termo**`), e não a linha do cabeçalho.
  tabela=$(grep -cE '^\| \*\*' GLOSSARY.md)
  lista=$(grep -cE '^[-*] ' GLOSSARY.md)
  adr=$(grep -c 'docs/adr/' GLOSSARY.md)
  echo "GLOSSARY.md: $((tabela + lista)) termo(s) declarado(s) em $tabela linha(s) de tabela e $lista de lista, $adr citação(ões) de docs/adr/"
fi
```

## Passo 4 — Os três: link para path inexistente

```bash
# [gate: run — confere se os links dos três docs de entrada apontam para arquivos que existem]
for f in README.md CONTRIBUTING.md GLOSSARY.md; do
  if [ ! -f "$f" ]; then
    echo "$f: ausente no repo — 0 link medido"
    continue
  fi
  dir=$(dirname "$f")
  total=0
  mortos=0
  for alvo in $(grep -oE '\]\(\.?/?[A-Za-z0-9._/-]+\.md\)' "$f" | sed 's/^](//; s/)$//' | sort -u); do
    total=$((total + 1))
    if [ ! -e "$dir/$alvo" ]; then
      echo "  $f: link para path inexistente: $alvo"
      mortos=$((mortos + 1))
    fi
  done
  echo "$f: $total link(s) markdown para .md, $mortos apontando para path inexistente"
done
```

## Passo 5 — Fechar o loop

O achado só fecha quando uma destas duas coisas acontece:

1. o doc foi escrito/corrigido e o gate `check-doc-kit` ficou verde; ou
2. a ausência está **declarada** num lugar canônico — para o item 3, o
   `docs/agents/domain.md` já declara que o `GLOSSARY.md` não existia até
   2026-11-18.

Um achado só relatado, sem dono e sem declaração, é o estado pior que não ter
auditado.

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| Confundir "o README não tem `## Documentação`" com "o README está quebrado" | A âncora é o mínimo declarado na matriz, não o índice completo | Reportar como medida; quem escreve é o `readme-specialist` |
| Contar link externo (`.md` no host) como link interno | O filtro só pega link relativo com alvo `.md` | Conferir o alvo antes de acusar |
| Tratar `docs/agents/domain.md` como o índice do GLOSSARY | Ele é o índice dos **ADRs**; o do GLOSSARY é a raiz | Usar a coluna `Índice` da matriz |
| Reportar o mesmo link quebrado duas vezes (aqui e no `check-doc-refs`) | Duas fontes, um fato | O `check-doc-refs` é o dono do link quebrado; aqui é a amostra do pilar |

## Saída

- Lista de medidas por item (seções presentes/ausentes, termos, links).
- **Sucesso** = todo item do pilar tem medida com nome e número — nenhum passo
  rodou sem dizer o que mediu.

## Referências

- Agent: `.agents/agents/onboarding-docs-auditor.md` (papel, anti-padrões)
- Convenção: `.agents/specs/conventions/kit-documentacao.md` §2.1 e §4
- Gate: `.tooling/scripts/ci/check-doc-kit.ts`
- Specs dos itens: `readme-specialist` · `contributing-specialist` ·
  `glossary-specialist`
