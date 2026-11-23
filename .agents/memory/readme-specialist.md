---
name: readme-specialist-memory
description: Memória acumulada do agent readme-specialist — a vitrine do repo, as contagens que envelhecem a cada PR e o teto de 300 linhas que o README já encosta
---

# Memória: `readme-specialist`

> Arquivo de memória do agent `readme-specialist`.

## Decisões Tomadas

### 2026-11-18 — O README tem exatamente 300 linhas: a âncora que falta vai estourar o teto

**Contexto:** o gate `check-doc-kit` exige a âncora `## Documentação` no
item 1 do kit, e o `README.md` **não a tinha** — a seção nasceu com o kit
(`grep -cF '## Documentação'
README.md` → `0`). Mas o `README.md` já está em **300 linhas** pela contagem
do `check-doc-size` (`split('\n').length` menos o último elemento vazio), que
é o teto exato. As 3 ancoras novas custam de 8 a 12 linhas.

**Decisão:** o `readme-specialist` **tem de cortar antes de acrescentar** —
a `## Estrutura` (a árvore de diretórios) é a candidata natural: ela é
derivada do disco e envelhece a cada diretório novo, e ninguém a lê para
decidir o que fazer. O corte é do dono do README, no mesmo PR que adiciona a
âncora.

**Consequências:** o item 1 do kit não é "acrescentar uma seção" — é
"reorganizar o README dentro do teto". Sem o corte, o `check-doc-size` fica
vermelho no mesmo PR que conserta o `check-doc-kit`.

### 2026-11-18 — As contagens do rodapé são claim de freshness

**Contexto:** o rodapé do `README.md` afirma "28 agents · 30 memórias ·
30 skills · 15 workflows · 27 convenções · 6 módulos · 2 hooks". Oito
números que mudam a cada PR que cria agent, skill ou convenção.

**Decisão:** cada número carrega **o comando que o reproduz**, ao lado.
`ls .agents/agents/*.md | wc -l` → 28; `ls .agents/memory/*.md | wc -l` →
30; `ls .agents/skills/*/SKILL.md | wc -l` → 30; `ls apps/api/src/modules/
| wc -l` → 6. O número que não tem comando não entra — é a regra de
`tamanho-e-revisao.md` aplicada ao README.

**Consequências:** reconciliar contagem é trabalho do dono do README no mesmo
PR da mudança, e não um pacote de documentação separado.

### 2026-11-18 — O README aponta; ele não carrega o catálogo

**Contexto:** o README tem uma seção `## Agents Inclusos` que **lista** os
28 agents por nome — e o `AGENTS.md` §3 já é o catálogo nominal, com papel e
memória.

**Decisão:** a lista do README vira **link** para `AGENTS.md` §3. O README
diz quantos são (com o comando) e onde está o nome de cada um. A lista
envelhece a cada PR; o link, não.

**Consequências:** menos uma lista para reconciliar a cada agent novo, e o
`AGENTS.md` volta a ser o único lugar onde o nome de um agent vive.

## Padrões Descobertos

- O `README.md` tem **11** seções `##` (`grep -c '^## ' README.md` → 11) e a
  `## Documentação` **existe** (`grep -cF '## Documentação' README.md` → 1) —
  a lacuna do item 1 foi fechada com o kit.
- O `README.md` é o **tutor** do repo, e não um `reference`: tem "Opção A —
  Docker Compose" e "Opção B — pnpm nativo", com pré-requisitos e
  troubleshooting. O quadrante Diátaxis dele é tutorial.
- A seção `## Versão & Licença` (linha 295) é o **rodapé** do repo, e ele
  diz que a tag do template é a dos 6 footers canônicos — o dono é o
  `release-versioning-specialist`.
- O `docs/como-rodar.md` indexa **6 ambientes** (`grep -cE '^\| [0-9]+ \| '
  docs/como-rodar.md`), e o README já aponta para ele — a duplicação do
  runbook no README é o defeito a evitar.
- O `check-doc-kit` lê a matriz da convenção **por nome de coluna** — uma
  coluna renomeada faz o gate ler a coluna errada em silêncio, e não acusar
  nada.

## Lições Aprendidas

- ❌ **Doc que mente é pior que doc que falta.** Um comando do README que não
  roda faz o leitor perder tempo num caminho quebrado — é defeito P0, não
  P1.
- ❌ **Contagem sem comando.** "28 agents" sem o `ls` que o mede é uma
  afirmação que envelhece sem ninguém perceber.
- ❌ **README com 500 linhas.** O teto é 300 e ele é medido — e o README
  **já** está nele.
- ❌ **Duplicar o runbook.** O README dá o caminho do primeiro minuto; o
  runbook é do `docs/como-rodar.md`.

## Sugestões de Evolução

- [ ] Criar a seção `## Documentação` **e** cortar a `## Estrutura` no mesmo
      PR, para não estourar o `check-doc-size`.
- [ ] Um gate que reconcilie as contagens do rodapé do README com o disco
      (`check-doc-claims` já tem a mecânica do par comando→valor — falta a
      entrada para o rodapé).
