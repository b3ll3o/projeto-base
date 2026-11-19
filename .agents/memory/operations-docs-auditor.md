---
name: operations-docs-auditor-memory
description: Memória acumulada do agent operations-docs-auditor — auditor do pilar 5 do kit de documentação (runbooks, post-mortem, CHANGELOG e a versão contra os footers)
---

# Memória: `operations-docs-auditor`

> Arquivo de memória do agent `operations-docs-auditor`.

## Decisões Tomadas

### 2026-11-18 — A comparação de versão imprime os dois lados; o veredito é do `check-doc-claims`

**Contexto:** O `CHANGELOG.md` entrou no disco durante a auditoria de
2026-11-18, declarando a versão **1.30.0**. Os 4 footers canônicos
(`docs/MONOREPO.md`, `docs/STACK.md`, `docs/TEMPLATE_USAGE.md` e
`.agents/specs/conventions/estrutura-e-versionamento.md`) declaravam **1.29.0**
— os quatro, iguais entre si. (MEDIDO depois: o bump do kit levou os **6**
footers — com o `AGENTS.md` e o `README.md`, que a lista de 4 omitia — a
**1.30.0**.)

**Decisão:** O passo 4 imprime `changelog: versão declarada 1.30.0`, a linha de
cada footer, e a **contagem** de quantos divergem (`4 de 4`). Ele **não**
imprime `✗` nem um veredito: a divergência é um número público, e o dono do
número é o gate `check-doc-claims` (que cobra claim numérico contra o
código) e o `release-versioning-specialist` (que é o dono dos footers).

**Consequências:** A skill roda verde mesmo com o repo em drift de versão — e
o relatório entrega a medida exata. Um `✗` aqui viraria reprovação do gate de
procedimento por um defeito que é de **conteúdo**.

### 2026-11-18 — A versão do CHANGELOG é lida da **primeira** versão declarada

**Contexto:** O `CHANGELOG.md` tem seções `## [Unreleased]` e `## [1.30.0]`.
O `tail -1` do arquivo — a linha mais recente — não é a versão canônica: no
`release-versioning-audit` esse deslize já tinha lido `1.12.0` num footer que
dizia `1.14.0`.

**Decisão:** O passo 4 lê a **primeira** versão declarada (`^## [X.Y.Z]`), e
só se não achar usa o footer `**Versão…:**`. O footer canônico do repo continua
sendo o rodapé de `docs/MONOREPO.md` — o CHANGELOG **compara**, não declara.

**Consequências:** A versão lida é a do topo do changelog, que é a mais
recente — e a comparação com os footers é a que faz sentido.

### 2026-11-18 — O item 12 mede a família `docs/runbooks/`, e o `docs/como-rodar.md` é de outro gate

**Contexto:** O `docs/como-rodar.md` é o runbook canônico do ambiente, e o
gate `check-runbook-drift` cobra os comandos e as variáveis de ambiente
citados nele. A matriz §2.5 declara a família `docs/runbooks/*.md`.

**Decisão:** O passo 1 mede **só** a família do kit. O `docs/como-rodar.md`
não entra na contagem, e o agente não reporta duas vezes o mesmo achado —
a doutrina de `documentation-audit` §Erros comuns.

**Consequências:** Em 2026-11-18 a medida foi **4 runbooks, 4 com `## §1.`**
(`cloudflare-edge`, `docker`, `e2e-e-ci`, `observabilidade`).

## Padrões Descobertos

- Os 4 runbooks da família têm a **mesma forma**: `## §1.` com um emoji de
  leitura (`📖 lido do código`, `✅ medido 2026-10-21`) e a seção §2 logo
  depois. O `docs/como-rodar.md` tem a forma `## §1.1` / `§1.2` / `§1.4` —
  numeração com subseção, porque é um runbook longo.
- O `docs/post-mortems/README.md` **nasceu com o kit** (2026-11-18, 228
  linhas) — o item 13 é `obrigatório` e o template blameless tem as 4 seções
  mínimas que a matriz declara.
- O `CHANGELOG.md` tem 69 linhas, 2 seções de versão e as 4 seções mínimas
  (`## [Unreleased]`, `### Adicionado`, `### Corrigido`, `### Quebras de
  compatibilidade`). Ele é o **único** item do kit com os 4 em nível `###`.
- Os footers canônicos estão listados na convenção
  `post-merge-release.md` §"Onde a versão canônica vive", e a própria
  convenção registra que a lista **já foi de 3 para 4** (a #126) — a
  omissão do `docs/TEMPLATE_USAGE.md` era a raiz do defeito. ⚠️ A lista que o
  gate `check-version-footers` mede tem **6** (com o `AGENTS.md` e o
  `README.md`), e é essa que o passo 4 da skill percorre.
- O `AGENTS.md` e o `README.md` também declaram a versão no rodapé — são a
  quinta e a sexta fonte, e nenhuma delas é o `package.json`.

## Lições Aprendidas

- ❌ **Ler a versão no `tail -1` do CHANGELOG.** Já custou um falso achado no
  `release-versioning-audit`; a primeira versão declarada é a do topo.
- ❌ **Imprimir `✗` na divergência de versão.** O gate `check-audit-skills`
  roda o passo contra o repo real e trata `✗` como falha — e o repo em
  drift de versão é o estado esperado entre o bump do changelog e o bump dos
  footers.
- ❌ **Contar `## §1.` com `grep -c '^## §1'`** sem `-F` nem o ponto final —
  o `§` é literal e o `.` é qualquer caractere; com `-F` a string casa
  exatamente.
- ❌ **Tratar `### Corrigido` como `## Corrigido`.** A matriz declara heading
  de **dois** níveis para o CHANGELOG — `##` para o agrupador e `###` para
  as categorias.
- ❌ **Incluir o `docs/como-rodar.md` na contagem do item 12.** Ele não é da
  família, e o `check-runbook-drift` já é o dono do que ele cita.

## Sugestões de Evolução

- [ ] Medir **quantos runbooks** citam um comando `pnpm` que não existe — o
      método já existe no `check-runbook-drift`, e o item 12 é a família
      dele, não do `docs/como-rodar.md`.
- [ ] Medir se o **template de post-mortem** tem o campo de **linha do tempo
      com horário** — é o que separa um post-mortem de um relatório.
- [ ] Apontar no relatório a **5ª fonte** da versão (o rodapé do `AGENTS.md`)
      quando ela divergir dos 6 footers — desde a v1.15.0 o gate
      `check-version-footers` mede os SEIS, e essa quinta deixou de ser a
      que ninguém media.
