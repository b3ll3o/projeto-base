---
name: operations-docs-audit
version: 1.0
updated: 2026-11-18
description: "Processo determinístico de auditoria do pilar 5 do kit de documentação — mede a seção §1 de cada runbook, as quatro seções do template de post-mortem, as quatro seções mínimas do CHANGELOG e compara a versão declarada no CHANGELOG com os 6 footers canônicos do repo. Carregado por `operations-docs-auditor` quando a task é de auditoria (não escrita). Use para scan periódico, pré-release ou revisão sob demanda."
---

# Skill: operations-docs-audit

> **Quem invoca:** `operations-docs-auditor` (papel, princípios e anti-padrões
> ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** scan periódico do pilar 5 do kit, pré-release, ou
> on-demand ("a operação está documentada e a versão bate?").

## O que esta skill mede

Os **itens 12, 13 e 14** da matriz da convenção
[`kit-documentacao.md`](../../specs/conventions/kit-documentacao.md) §2.5:

| Item | Doc canônico | Tipo | Âncora mínima |
|---|---|---|---|
| 12 — Runbooks / Playbooks | `docs/runbooks/*.md` | família | `## §1.` |
| 13 — Post-Mortems | `docs/post-mortems/README.md` | arquivo | as 4 seções do template |
| 14 — CHANGELOG | `CHANGELOG.md` | arquivo | `[Unreleased]`, `Adicionado`, `Corrigido`, `Quebras de compatibilidade` |

> **Esta skill imprime MEDIDA, não veredito.** Ela não emite `✗` e não decide
> severidade: quem decide é o gate
> [`check-doc-kit`](../../../.tooling/scripts/ci/check-doc-kit.ts) e a leitura
> do agent. O gate `check-audit-skills` executa estes passos contra o repo real
> e trata a linha `✗` como falha.

## Inputs (do controller)

```yaml
task:
  description: "<auditoria do pilar 5 do kit: operação | confiabilidade>"

context:
  scope: "runbook|postmortem|changelog|versao|full"   # full = tudo
  runbooks: "docs/runbooks/"
  postmortem: "docs/post-mortems/README.md"
  changelog: "CHANGELOG.md"
```

## Passo 1 — Runbooks: a seção §1 de cada um

```bash
# [gate: run — mede se cada runbook da família tem a seção §1 que o item exige]
total=0
com=0
for f in $(git ls-files 'docs/runbooks/*.md'); do
  total=$((total + 1))
  if grep -qF '## §1.' "$f"; then
    com=$((com + 1))
  else
    echo "  runbook sem a seção §1: $f"
  fi
done
echo "docs/runbooks: $total runbook(s) versionado(s), $com com a seção §1"
```

## Passo 2 — Post-mortem: as quatro seções do template

```bash
# [gate: run — mede as quatro seções do template de post-mortem]
f=docs/post-mortems/README.md
if [ ! -f "$f" ]; then
  echo "$f: ausente no repo — 0 de 4 seções medidas"
else
  for s in '## O template' '## Linha do tempo' '## Causa raiz' '## Ações'; do
    if grep -qF "$s" "$f"; then
      echo "  presente: $s"
    else
      echo "  AUSENTE: $s"
    fi
  done
  echo "$f: $(wc -l < "$f") linha(s)"
fi
```

## Passo 3 — CHANGELOG: as quatro seções mínimas

```bash
# [gate: run — mede as quatro seções mínimas do CHANGELOG e as seções de versão]
f=CHANGELOG.md
if [ ! -f "$f" ]; then
  echo "$f: ausente no repo — 0 de 4 seções medidas"
else
  for s in '## [Unreleased]' '### Adicionado' '### Corrigido' '### Quebras de compatibilidade'; do
    if grep -qF "$s" "$f"; then
      echo "  presente: $s"
    else
      echo "  AUSENTE: $s"
    fi
  done
  echo "$f: $(wc -l < "$f") linha(s), $(grep -c '^## \[' "$f") seção(ões) de versão"
fi
```

## Passo 4 — A versão do CHANGELOG contra os 6 footers canônicos

Os 6 footers canônicos estão declarados na convenção
[`post-merge-release.md`](../../specs/conventions/post-merge-release.md)
("Onde a versão canônica vive"). A comparação **imprime os dois lados** — o
veredito é do gate `check-version-footers`, que é o dono do número — o
`check-doc-claims` mede os claims numéricos dos docs de API, não o footer.

```bash
# [gate: run — compara a versão declarada no CHANGELOG com os 4 footers canônicos]
ch=CHANGELOG.md
declarada=""
if [ -f "$ch" ]; then
  declarada=$(grep -m1 -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' "$ch" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
  if [ -z "$declarada" ]; then
    declarada=$(grep -m1 -oE '\*\*Versão[^:]*:\*\* *[0-9]+\.[0-9]+\.[0-9]+' "$ch" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
  fi
  echo "changelog: versão declarada ${declarada:-ausente no CHANGELOG.md}"
else
  echo "changelog: CHANGELOG.md ausente no repo — versão declarada ausente"
fi
divergentes=0
# Os SEIS footers — a lista autoritativa é `FOOTERS_DE_VERSAO` em
# `.tooling/scripts/ci/check-version-footers.ts` (o `AGENTS.md` e o `README.md`
# entraram depois, e são exatamente os que já derivaram uma vez — issue #126).
for f in docs/MONOREPO.md docs/STACK.md docs/TEMPLATE_USAGE.md .agents/specs/conventions/estrutura-e-versionamento.md AGENTS.md README.md; do
  v=$(grep -m1 -oE '\*\*Versão[^:]*:\*\* *[0-9]+\.[0-9]+\.[0-9]+' "$f" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
  echo "  footer $f: ${v:-sem footer de versão}"
  if [ -n "$declarada" ] && [ "$v" != "$declarada" ]; then
    divergentes=$((divergentes + 1))
  fi
done
echo "changelog: $divergentes de 6 footer(s) canônico(s) divergem da versão declarada — o veredito é do check-version-footers"
```

## Passo 5 — Fechar o loop

O achado só fecha quando o doc foi escrito/corrigido **e** o `check-doc-kit`
ficou verde, ou quando a lacuna está **declarada** num lugar canônico.

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| Medir o runbook canônico fora da família | A família do kit é `docs/runbooks/*.md`; o `docs/como-rodar.md` é o runbook do ambiente, dono do `check-runbook-drift` | Não reportar duas vezes o mesmo achado |
| Confundir `### Corrigido` com `## Corrigido` | O item 14 declara headings de **dois níveis** | Comparar com o nível exato |
| Declarar divergência de versão a partir do `tail -1` do CHANGELOG | A última linha do arquivo é a mais recente, não a versão canônica | Ler a primeira versão declarada e os footers |
| Tratar o CHANGELOG como dono da versão do repo | Quem é dono é o rodapé de `docs/MONOREPO.md` | O CHANGELOG **compara**, não declara |

## Saída

- Lista de medidas por item (runbooks, seções do template, seções do
  CHANGELOG, os dois lados da comparação de versão).
- **Sucesso** = todo item do pilar tem medida com nome e número.

## Referências

- Agent: `.agents/agents/operations-docs-auditor.md` (papel, anti-padrões)
- Convenção: `.agents/specs/conventions/kit-documentacao.md` §2.5
- Convenção vizinha: `.agents/specs/conventions/post-merge-release.md`
  ("Onde a versão canônica vive" — os footers; a lista que o gate mede é os
  6 de `check-version-footers.ts`)
- Gate: `.tooling/scripts/ci/check-doc-kit.ts`
- Specs dos itens: `runbook-specialist` · `postmortem-specialist` ·
  `changelog-specialist`
