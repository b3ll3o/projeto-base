---
name: adr-specialist-memory
description: Memória acumulada do agent adr-specialist — 12 ADRs, 11 Aceito e 1 Substituído (0008 pelo 0009); ADR não se edita, se substitui; docs/agents/domain.md é o índice com um só dono.
---

# Memória: `adr-specialist`

## Decisões Tomadas

### 2026-11-18 — O ADR é o dono da decisão; doc de system design aponta

**Contexto:** o ADR-0010 (`docs/adr/0010-system-design-canonico.md`) fixou a
regra: "o ADR é o dono da decisão. O doc de system design não repete
contexto, alternativas e consequências — ele aponta para o ADR que dona cada
decisão." É a leitura de `dry.md` aplicada ao par ADR × system design.

**Decisão:** o item 8 do kit segue a mesma doutrina. O ADR-0010 é o
precedente real do formato: `# ADR-NNNN: Título`, cabeçalho com `Status`,
`Data`, `Decisores`, `Specs relacionadas`, `ADR anterior`, `ADR seguinte`, e
as seções `## Contexto`, `## Decisão`, `## Consequências`,
`## Alternativas consideradas`, `## Ver Também`.

**Consequências:** o ADR novo nasce com o mesmo esqueleto; o system design
não copia ADR, e o ADR não copia system design.

### 2026-11-18 — Substituição é o mecanismo, não edição

**Contexto:** o `0008` foi substituído pelo `0009` em 2026-11-09 — a pasta
`.claude/` saiu do repo e o binding virou symlink. O `0008` continua em
disco, com o status `Substituído por [ADR-0009](...) (2026-11-09)` e um
aviso no corpo de que o texto abaixo fica como registro do que foi decidido.

**Decisão:** o par é o padrão: o antigo ganha o status de substituído, o
novo ganha a linha `- **Substitui:**`, e os dois arquivos continuam no
índice `docs/agents/domain.md` — o índice cita o que **existe**, e o leitor
distingue "existe" de "vigente" pelo status.

**Consequências:** `ls docs/adr/*.md | wc -l` → **12** arquivos, **11**
`Aceito` + **1** `Substituído`. O gate `check-doc-kit` exige as 3 âncoras em
**cada** arquivo da família, inclusive no substituído — o registro também tem
que ser legível.

### 2026-11-18 — O índice dos ADRs tem um só dono

**Contexto:** o ADR-0010 registra que "o índice de ADRs tem um só dono —
`docs/agents/domain.md` — e o conjunto apenas linka ele; não há um segundo
índice".

**Decisão:** o índice do item 8 é `docs/agents/domain.md`. Nenhum outro
arquivo lista ADRs. O gate confere pelo **basename**: para cada arquivo de
`docs/adr/*.md`, o texto do índice tem que conter `0001-arquitetura-...md`.

**Consequências:** escrever um ADR sem tocar o índice deixa o item 8
vermelho no `check-doc-kit` — e o ADR novo é invisível para quem lê o índice.

## Padrões Descobertos

- Estado medido em 2026-11-18: `ls docs/adr/*.md | wc -l` → **12**;
  `grep -H "^\- \*\*Status:\*\*" docs/adr/*.md` → 11 `Aceito` + 1
  `Substituído`.
- O `docs/agents/domain.md` apontava que o `GLOSSARY.md` **não existia** — o
  padrão de "ausência declarada" do repo. O glossário nasceu com o kit
  (2026-11-18), e o índice passou a apontar para ele.
- O `docs/agents/domain.md` diz que o ADR marcado como vigente é "decisão
  vigente: violá-las é erro de review, não preferência" — quem escreve ADR
  novo precisa reconciliar com essa lista.
- O gate `check-doc-kit` expande o glob da família e cobra âncora **por
  arquivo**: um ADR novo sem `## Consequências` reprova a família inteira.

## Lições Aprendidas

- ❌ Editar o corpo de um ADR aceito para "atualizar" — o registro datado
  mente sobre o que foi pensado na data.
- ❌ Criar o segundo índice de ADRs "só para facilitar" — o ADR-0010 proíbe.
- ❌ Deixar o ADR novo fora do índice esperando o próximo PR: o gate do item
  8 fica vermelho desde o primeiro commit.
- ❌ Confundir `doc-writer` (doc genérica) com o dono do ADR: o ADR tem
  numeração, status e índice — artefato, não texto.

## Sugestões de Evolução

- [ ] Um gate que accuse ADR aceito cujo status conflita com o `0009` — hoje
  essa reconciliação é do `decision-docs-auditor`.
- [ ] Registrar no `check-doc-claims` os números citados nos ADRs (o ADR-0010
  cita "9 ADRs" e "7 convenções órfãs" com o comando).
