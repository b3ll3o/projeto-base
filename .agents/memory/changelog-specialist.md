---
name: changelog-specialist-memory
description: Memória acumulada do agent changelog-specialist — a fronteira entre o texto do CHANGELOG, o número da versão e o fato (a tag), o que o release-template valida (4 footers) contra o que o gate mede (6), e a regra de quais commits viram entrada
---

# Memória: `changelog-specialist`

> Arquivo de memória do agent `changelog-specialist`.

## Decisões Tomadas

### 2026-11-18 — Três artefatos, três donos: o texto, o número e o fato

**Contexto:** a matriz de `kit-documentacao.md` §2.5 declara o item 14 com
doc canônico `CHANGELOG.md` e âncoras `## [Unreleased]`, `### Adicionado`,
`### Corrigido`, `### Quebras de compatibilidade`. O arquivo foi criado em
**2026-11-18** (mesma leva de instanciação do kit) e o cabeçalho dele já
declara a regra: *"O **fato** de cada versão é a tag correspondente no git —
este arquivo é a **leitura** do que a tag contém, e a tag é a que se confere."*
A seção `## Histórico anterior a 1.30.0` deixa o histórico antigo **nas tags**
— o arquivo não o reescreve.

**Decisão:** existem três artefatos, e nenhum é a cópia do outro:

| Artefato | O que é | Dono |
|---|---|---|
| `CHANGELOG.md` | o **texto** por release, em Keep a Changelog, pt-BR, lido por quem usa o template | **eu** (item 14) |
| os footers canônicos | o **número** da versão e o resumo de governança do bump | `release-versioning-specialist` |
| a tag `vX.Y.Z` | o **fato** datado do que entrou | o workflow `release-template.yml` |

O `post-merge-release.md` §Limitações já registra que **não há changelog
automático** — o arquivo é escrito a partir dos commits, não gerado por
Changesets nem pelo workflow. O princípio 7 do
`release-versioning-specialist` ("CHANGELOG é gerado, não escrito à mão")
vale para o registro de versionamento dele; a regra de não-duplicação que eu
declaro é: **as entradas categorizadas não são repetidas em nenhum dos outros
dois** (`dry.md`).

**Consequências:** a conversão do "Histórico de Versões" dos footers para
"ponteiro" é wiring que pertence ao `release-versioning-specialist` — eu não
edito os footers.

### 2026-11-18 — 4 footers no workflow, 6 footers no gate: a divergência é real

**Contexto:** o `post-merge-release.md` diz "Os 4 arquivos DEVEM ter a mesma
versão" e lista `docs/MONOREPO.md`, `docs/STACK.md`, `docs/TEMPLATE_USAGE.md`
e `.agents/specs/conventions/estrutura-e-versionamento.md`. O workflow
`release-template.yml` valida **esses 4** (step "Validar sincronia dos 4
footers de versao"). Mas o gate `.tooling/scripts/ci/check-version-footers.ts`
mede **6** — a lista `FOOTERS_DE_VERSAO` inclui também `AGENTS.md` e
`README.md`.

**Decisão:** o número que eu publico no changelog é o que os **footers**
declaram, e a verificação que eu faço é a do **gate** (os 6). A divergência
entre "4" na convenção e "6" no gate é **lacuna de convenção** — e quem a
fecha é o dono da convenção `post-merge-release.md`, não eu.

**Consequências:** medido 2026-11-18, os 6 footers estão em **1.30.0** e a
última tag é `v1.29.0` (`git tag --sort=-v:refname | head -1`) — a tag da
1.30.0 é criada pelo workflow **depois** do merge em `main`. A versão pode
estar no changelog antes de a tag existir; isso é o fluxo normal, não drift.

### 2026-11-18 — A regra de quais commits viram entrada é declarada, não implícita

**Contexto:** o histórico do repo tem 283 commits (medido 2026-11-18:
`git log --oneline | wc -l`), e a faixa desde a última tag tinha 18
(`git log v1.29.0..HEAD --oneline | wc -l`). Um commit por entrada daria um
changelog ilegível — e `chore`/`docs`/`ci`/`test` não são mudança que o
leitor sinta.

**Decisão:** a classificação é por **tipo Conventional Commit** e a tabela
está escrita no agent: `feat` → `### Adicionado`; `fix` → `### Corrigido`;
`feat!`/`fix!`/`BREAKING CHANGE:` → `### Quebras de compatibilidade`;
`docs`/`chore`/`ci`/`test`/`build`/`refactor` → **não entram**. A regra
está escrita porque "não entrou" sem motivo declarado parece omissão.

**Consequências:** a tabela é o **ponto de partida**, não o critério — um
commit `refactor` que muda algo visível vira entrada mesmo assim, porque a
regra é sobre o **efeito**, não sobre o tipo.

## Padrões Descobertos

- O `docs/MONOREPO.md` §6 avisa que a "version" do `package.json` da raiz
  (`0.1.0`) **não** é a versão do template — a fonte é o footer do doc. O
  changelog tem a mesma regra: o número sai do footer, nunca do
  `package.json`.
- A tag é **annotated** e a mensagem é fixa (`vX.Y.Z — template release`),
  com `Versão:`, `Trigger:` e `Commit:` — e ela aponta para o *Histórico de
  Versões*, **não** para o `CHANGELOG.md`. O changelog é para o leitor; a tag
  é para o git.
- O histórico do repo usa Conventional Commits em **pt-BR** com escopo
  (`fix(api): …`, `feat(web): …`) — a mesma convenção que
  [`idioma.md`](../specs/conventions/idioma.md) exige, e é o que dá ao
  changelog o texto em pt-BR sem tradução.
- `check-version-footers.ts` deriva as versões por **regex do rodapé** e
  compara os 6 entre si — ele **não** compara com a tag do git. A checagem
  da tag é minha (`git tag --sort=-v:refname`).

## Lições Aprendidas

- ❌ **Não subir a versão.** Os footers são do outro dono; eu copio o número.
- ❌ **Colar o subject do commit.** "feat(idempotency): chave no header" é
  assunto; a entrada é "a escrita aceita `Idempotency-Key`".
- ❌ **Uma entrada por commit.** Um PR com 3 efeitos visíveis vira 3 linhas.
- ❌ **Quebra sem caminho de migração.** "quebra a compatibilidade" sem o que
  fazer é meia informação.
- ❌ **Repetir o Histórico de Versões.** As cópias envelhecem em lugares
  diferentes — o `dry.md` proíbe.
- ❌ **Criar a tag.** É do workflow `release-template.yml`, e ele é
  idempotente (o `git rev-parse --verify` já existe → noop).

## Sugestões de Evolução

- [ ] A convenção `post-merge-release.md` §"Onde a versão canônica vive"
      listar os **6** footers (o gate já mede 6) — fecha a divergência entre
      a convenção e o instrumento.
- [ ] Um gate que confere que a faixa publicada do `CHANGELOG.md` tem uma
      seção por versão dos footers — o `check-doc-kit` mede a âncora, não a
      completude.
- [ ] Uma regra que extraia o "Histórico de Versões" dos footers e o
      confronte com as seções do changelog, para as duas cópias não
      divergirem depois do wiring.
