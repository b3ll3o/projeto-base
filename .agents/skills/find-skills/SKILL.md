---
name: find-skills
version: 1.0
updated: 2026-10-29
description: "Descoberta e instalação de skills — quando a demanda não tem skill no repo, procura a mais adequada no registro, audita antes de instalar e adapta ao padrão do projeto. Adaptado de vercel-labs/skills (MIT). Use quando o pedido for 'como faço X' e X puder existir como skill, ou quando o usuário quiser estender as capacidades do agente."
---

# Skill: `find-skills`

> **Quem invoca:** `specialist-router` (quando nenhuma skill de `.agents/skills/`
> cobre a demanda) ou o agente que recebeu o pedido direto ("existe uma skill
> para isso?", "como eu faço X?").
>
> **Quando invocar:** quando a demanda **não** tem skill no repo e cabe numa
> skill instalável. **Não** invocar para tarefa que o repo já cobre — as skills
> de `.agents/skills/` são o **primeiro** lugar; o registro é o **segundo**.
>
> **Adaptado de** [vercel-labs/skills](https://github.com/vercel-labs/skills)
> (`skills/find-skills/SKILL.md`, MIT, © Vercel, Inc.). O original procura no
> ecossistema aberto via `npx skills`; aqui a busca é feita pelo CLI do Hermes
> e a instalação passa pelas regras do projeto (§4).

## §1. A ordem: repo → registro → fazer na mão

O erro caro aqui é pular direto para o registro e instalar uma skill de
terceiro para algo que o repo já resolve. A ordem é fixa:

1. **No repo.** `.agents/skills/` tem 25 skills e 28 agents (medido no disco em
   2026-10-29: `ls .agents/skills/*/SKILL.md | wc -l`,
   `ls .agents/agents/*.md | wc -l` — a contagem envelhece, meça de novo), e a
   matriz `specialist-routing.md` mapeia demanda → agent → skill. A dúvida "qual
   skill eu uso?" se responde lendo essa matriz, não buscando na internet.
2. **No registro.** Só quando o passo 1 não cobre a demanda.
3. **Na mão.** Se não existe skill, faz-se a tarefa com o que se tem — e aí
   vale perguntar se ela é recorrente o bastante para virar skill.

## §2. Entender a demanda antes de buscar

Três coisas, nesta ordem:

1. **Domínio** — o assunto (React, auditoria Prisma, deploy, docs).
2. **Tarefa** — o verbo concreto ("escrever teste", "revisar PR", "criar
   changelog"), não o tema.
3. **Recorrência** — se a demanda é pontual, ela não precisa de skill
   instalável; o custo de manter uma skill é maior que o de resolver na hora.

## §3. Onde buscar

### §3.1 O CLI do Hermes (o caminho do runtime deste repo)

```bash
hermes skills search <palavra-chave>       # busca no registro
hermes skills inspect <identificador>       # mostra a SKILL.md antes de instalar
hermes skills install <identificador>       # instala
hermes skills audit                        # re-escaneia as instaladas
hermes skills list                         # o que já está instalado
```

O `search` devolve uma tabela com **origem** e **nível de confiança**
(`official` | `community`). Esse par é o sinal mais importante do resultado:
ver §4.

### §3.2 O CLI da Vercel (alternativa, mesmo catálogo)

```bash
npx skills find <palavra-chave> [--owner <owner>]   # busca
npx skills add <owner/repo@skill> -g -y             # instala
```

O catálogo é o [skills.sh](https://skills.sh/), e o leaderboard de lá ordena por
total de instalações — a mesma ordem de preferência do §4.1.

## §4. Auditar antes de instalar (não é opcional)

Uma skill de comunidade é **instrução em prosa que o agente vai seguir**. O
`inspect` mostra o conteúdo; ler antes de instalar é o que separa "skill útil"
de "skill que manda o agente rodar um script de terceiro".

### §4.1 Sinal de confiança, em ordem

1. **Origem oficial** (`vercel-labs`, `anthropics`, `microsoft`, o próprio repo) —
   antes de `community`.
2. **Instalações** — acima de 1K é o piso; abaixo de 100, ceticismo.
3. **Stars no repositório de origem** — abaixo de 100 stars, ceticismo.
4. **A SKILL.md pede o quê?** — instalar é uma coisa; rodar `curl … | sh`,
   exigir `API_KEY` de terceiro ou pedir segredo é outra (§4.3).

### §4.2 O que ler no `inspect`

- O `description` promete o que a skill faz — e o que ela **não** faz?
- Há comando de rede, escrita fora do repo, ou leitura de segredo?
- A skill é um **procedimento** (passos verificáveis) ou um **dicionário**?
  Procedimento é o que sobrevive ao próximo refactor.

### §4.3 Segredo e credencial

Skill de comunidade que exige token de terceiro **não entra no repo**. Se o
usuário precisar, o token é do usuário, fica no ambiente dele, e a skill é
adaptada para não gravá-lo em arquivo versionado.

## §5. Adaptar ao padrão deste repo (o passo que a maioria pula)

Instalar cru no `.agents/skills/` viola quatro convenções do projeto. A
adaptação é o trabalho — e o precedente é o das skills de UI
([`ui-craft`](../ui-craft/SKILL.md)), adaptadas de 3 repositórios externos.

| Convenção | O que fazer |
|---|---|
| [`idioma.md`](../../specs/conventions/idioma.md) | prosa em **pt-BR**; só identificadores ficam em inglês |
| [`tamanho-e-revisao.md`](../../specs/conventions/tamanho-e-revisao.md) | ≤ **300 linhas**; material bulky vira `references/*.md` |
| frontmatter | `name`, `version`, `updated`, `description` — e a `description` **cita a origem** e a licença |
| cabeçalho | `> **Quem invoca:**` e `> **Quando invocar:**` (inclusive o contra-gatilho) |

E o registro: `AGENTS.md §5` (a família da skill), a tabela de versões de
`.agents/specs/conventions/estrutura-e-versionamento.md` e o **bump minor** nos
**quatro** footers de versão (adicionar skill é minor bump — `estrutura-e-versionamento.md`).

**Não** vendorizar: `SKILL.md` cru, em inglês, de 700 linhas, não é uma skill
deste projeto — é um arquivo estranho que ninguém sabe se pode editar.

## §6. Como apresentar as opções

Para cada candidato, quatro linhas:

1. o que a skill faz;
2. origem + nível de confiança + número de instalações;
3. o comando de instalação;
4. o link (`https://skills.sh/<owner>/<repo>/<skill>`).

Depois, a instalação só acontece **com o "sim" do usuário** — instalar skill
sem autorização é o mesmo que rodar código de terceiro sem autorização.

## §7. Quando não existe skill

1. Dizer que não achou.
2. Oferecer resolver a tarefa direto.
3. Se a demanda é recorrente, sugerir criar a skill local
   (`.agents/skills/<nome>/SKILL.md`) — que é onde este repo quer que ela
   morar.

## §8. Verificação

A skill está no lugar quando:

- `hermes skills list` mostra a instalada (ou o arquivo existe em
  `.agents/skills/<nome>/SKILL.md`);
- a skill tem frontmatter com `name`, `version`, `updated` e `description` que
  cita a origem;
- o corpo está em pt-BR e cabe em 300 linhas;
- `AGENTS.md §5` e a tabela de versões mencionam a skill;
- os quatro footers de versão concordam e estão à frente da última tag
  (gate `check-version-footers`).

## Cross-references

- [`specialist-routing`](../specialist-routing/SKILL.md) — a matriz que decide
  se a demanda tem skill no repo (passo 1).
- [`agents-coordinate`](../agents-coordinate/SKILL.md) — quando a skill
  encontrada exige mais de uma especialidade.
- [`ui-craft`](../ui-craft/SKILL.md) — o precedente de skill adaptada de
  repositório externo, com atribuição no frontmatter.
