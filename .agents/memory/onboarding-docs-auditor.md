---
name: onboarding-docs-auditor-memory
description: Memória acumulada do agent onboarding-docs-auditor — auditor do pilar 1 do kit de documentação (README, CONTRIBUTING, GLOSSARY)
---

# Memória: `onboarding-docs-auditor`

> Arquivo de memória do agent `onboarding-docs-auditor`.

## Decisões Tomadas

### 2026-11-18 — A skill imprime MEDIDA, não veredito

**Contexto:** O gate
[`check-audit-skills`](../../.tooling/scripts/ci/check-audit-skills.ts)
**executa** cada bloco `run` das skills de auditoria contra o repo real e
trata uma linha que começa com `✗` como falha. Um veredito impresso no passo
viraria falso positivo do gate toda vez que o repo estivesse em dívida — e o
repo em dívida é o estado normal entre um merge e o conserto (o
`README.md` não tinha `## Documentação` quando a auditoria rodou).

**Decisão:** Os 4 passos imprimem **número e nome** do que mediram
(`3 de 3 seções`, `31 termo(s) declarado(s)`, `4 apontando para path
inexistente`). O veredito fica com o
[`check-doc-kit`](../../.tooling/scripts/ci/check-doc-kit.ts) (âncora e dono)
e com a leitura do agent (a prosa).

**Consequências:** Os 20 blocos das 5 skills do kit rodam com código 0, saída
não vazia e nenhum `✗`. Um achado real (seção ausente) é lido no relatório —
não é reprovado pelo gate de procedimento.

### 2026-11-18 — A ausência do doc e a ausência da seção são medidas separadas

**Contexto:** O `CONTRIBUTING.md` e o `GLOSSARY.md` chegaram ao disco **durante**
a execução da auditoria (outros agents em paralelo). O `docs/prd/README.md`
existia enquanto o `docs/prd/0001-projeto-base.md` ainda não — e o
`docs/tdr/` inteiro ainda não.

**Decisão:** Cada passo mede o **arquivo** e as **seções** separadamente: um
doc ausente imprime `0 de 4 seções medidas` e um doc presente sem a âncora
imprime `AUSENTE: ## X`. Misturar as duas produz um número que não diz qual
das duas coisas falta.

**Consequências:** A auditoria mede um alvo móvel sem acusar o vazio — e o
relatório diz exatamente o que estava faltando no momento da medição.

## Padrões Descobertos

- O README tem `## O que é` e `## Como executar localmente`, mas **não** tem
  `## Documentação` — a âncora que a matriz §2.1 exige. O README tem 300
  linhas exatas, ou seja, **no teto** de `tamanho-e-revisao.md`.
- O `CONTRIBUTING.md` tem as 4 seções mínimas e 224 linhas; o
  `GLOSSARY.md` tem 31 termos em tabela e **21** citações de `docs/adr/` —
  o glossário é, na prática, o índice rico dos ADRs.
- O `docs/agents/domain.md` declarava em 2026-11-18 que o `GLOSSARY.md`
  **não existia** ("a skill `domain-modeling` o cria quando um termo ou
  decisão é de fato resolvido"). A ausência **declarada** é a doutrina da
  convenção `documentacao.md` §5 — e ela não é lacuna.
- O `README.md` tem 16 links markdown para `.md` e **nenhum** quebrado; o
  `CONTRIBUTING.md` tem 34 e 4 quebrados — todos apontando para os docs dos
  outros pilares do kit (`./CHANGELOG.md`, `./docs/prd/README.md`,
  `./docs/tdr/README.md`, `./docs/post-mortems/README.md`).
- O filtro de link do passo 4 (`grep -oE '\]\(\.?/?[A-Za-z0-9._/-]+\.md\)'`)
  **não** casa link externo: o alvo precisa casar `.md)` logo depois do
  prefixo, e `https://…/x.md` tem `:` no meio.

## Lições Aprendidas

- ❌ **Confiar no bloco bash como foi digitado.** O `Write` do harness trocou
  um `done` por `fi` dentro de um bloco do `contract-docs-audit`, e o passo
  saiu com `bash: -c: linha 9: erro de sintaxe próximo ao token inesperado
  'fi'`. A correção não foi reescrever o bloco às cegas: foi **extrair o
  bloco do arquivo** (como o gate faz) e **rodar**, que é o único jeito de
  ver o que o gate vai ver.
- ❌ **Usar `grep -E` para casar seção com caractere especial.** `## §1.` e
  `## [Unreleased]` têm `§` e `[` — `grep -F` casa a string literal e não
  transforma `[` em classe de caractere.
- ❌ **Contar link quebrado como se fosse meu achado.** O dono do link
  quebrado é o `check-doc-refs`; aqui o link é **medida do pilar**, não
  finding novo.
- ❌ **Avisar "falta o CONTRIBUTING" sem checar o disco primeiro.** Durante
  esta campanha o arquivo apareceu no meio da auditoria — quem mediu às 14h02
  e quem mediu às 14h05 viu estados diferentes do repo.

## Sugestões de Evolução

- [ ] Medir também a **frescor** do trio (data de última medição declarada
      no doc), quando os specialists a declararem.
- [ ] Acoplar o passo 4 ao `check-doc-refs` por um link de evidência, para
      que o relatório diga "o gate oficial diz X" em vez de repetir a lista.
- [ ] Registrar no relatório o **timestamp** da medição, para que um leitor
      posterior saiba se a medida ainda vale.
