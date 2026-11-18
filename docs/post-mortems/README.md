# Post-mortems — índice e template

> O registro de **o que deu errado** e **o que mudou no sistema** por causa
> disso. É o item 13 do
> [kit de documentação moderna](../../.agents/specs/conventions/kit-documentacao.md)
> (Pilar 5 — Operação, Evolução e Confiabilidade).

**Hoje não existe post-mortem neste repositório.** A ausência é
**declarada**, não silenciosa: não houve incidente que justificasse um, e um
doc vazio fingindo ter sido escrito seria pior do que a ausência.

## O que é um post-mortem aqui

Um post-mortem é o registro de um **incidente** — algo que saiu do jeito que
não devia — com três perguntas respondidas:

1. **O que aconteceu?** (linha do tempo)
2. **Por que aconteceu?** (causa raiz)
3. **O que mudou no sistema?** (ações)

Ele não é relatório de culpa, não é ata de reunião e não é o plano de
correção: o plano é o
[plano](../superpowers/plans/), e a decisão que muda o comportamento do
sistema é o [ADR](../adr/).

## A regra blameless

> **Um post-mortem que nomeia culpado é defeito.**

A regra vale para o **escrito**, não para o tom: o documento descreve **o
sistema** — o guard, a configuração, o gate, a instrução, a sequência de
passos — e nunca a pessoa que executou a sequência.

O motivo não é diplomacia. É técnica:

- **Quem lê o incidente depois é o sistema.** Uma causa escrita como "a pessoa
  esqueceu de rodar o gate" não sugere nenhuma ação; escrita como "o gate não
  é exigido por nada" sugere uma, e essa fecha o mesmo furo para todo mundo.
- **Nomear alguém desincentiva o relato.** O próximo incidente vira omitido
  para não virar registro.
- **A ação blameless é verificável.** "O hook passa a bloquear" é um commit;
  "a pessoa deve ter mais cuidado" não é nada.

O que se escreve no lugar do nome: **a condição que tornou a falha
possível**. "O `pre-push` rodava `ci:preflight`, mas não `ci:local`, e o
lint não era coberto por nenhum hook" — e não "o autor fez push sem rodar o
lint".

**Quando a falha foi de decisão** — e não de execução — o post-mortem
**aponta** para o ADR, e não o substitui. Ver
[Do post-mortem para o ADR](#do-post-mortem-para-o-adr).

## O template

Copie o bloco abaixo para `docs/post-mortems/YYYY-MM-DD-<slug>.md` e preencha.
O **nome do arquivo** é a data do incidente (não a da escrita) e um `slug`
curto em `kebab-case`.

````markdown
# Post-mortem — <título curto do incidente>

- **Data do incidente:** YYYY-MM-DD
- **Duração:** <início> → <fim> (UTC)
- **Gravidade:** <um nível: baixa | média | alta | crítica> — <por que>
- **Detectado por:** <alerta | o usuário | revisão | o próprio sistema>
- **Documentos relacionados:** <ADR | runbook | doc que deixou de valer>

## Resumo

Em 2–4 frases: o que aconteceu, o impacto, e por que valeu registrar.

## Impacto

- **Quem foi afetado:** <número | escopo> — <como se mede>
- **O que estava quebrado:** <o serviço | a rota | o dado>
- **O que NÃO estava quebrado:** <o que continuou funcionando>
- **Duração do impacto:** <tempo> — <como se mede>

## Linha do tempo

| Hora (UTC) | O que aconteceu | Quem / o que detectou |
|---|---|---|
| HH:MM | ... | ... |

## Causa raiz

**O que aconteceu** (o fato, sem adjetivo):

**Por que aconteceu** (a condição do sistema que tornou isso possível):

**Por que o guarda-corpo não pegou** (o controle que deveria ter impedido e
não impediu — ou não existia):

## Ações

| # | Ação | Tipo | Responsável | Prazo | Como se sabe que foi feita |
|---|---|---|---|---|---|
| 1 | ... | correção | ... | ... | ... |

## O que mudou no sistema

- **O que está diferente agora** (o estado novo, verificável):
- **O que continua igual** (e por que ainda é aceitável):
- **O guard que foi adicionado** (o que impede a repetição):
````

## Como preencher cada parte

Cada parte do template tem uma regra própria. A regra é curta, e é o que
separa um post-mortem que serve de um que só ocupa espaço.

### Resumo

O parágrafo que alguém lê **antes** de decidir se abre o resto. Duas a quatro
frases: **o que** aconteceu, **quem** foi afetado e **o que** mudou no
sistema. Sem "foi um erro humano" — se a frase é essa, a causa raiz ainda não
foi encontrada.

### Impacto

O que quebrou, para quem, e **por quanto tempo** — com a medida. Um impacto
sem número é opinião.

O item **"o que NÃO estava quebrado"** não é enfeite: é o que impede o
relatório de virar medo. O incidente de maior risco costuma ser o que quase
aconteceu, e o leitor precisa saber que aquilo não aconteceu.

### Linha do tempo

A sequência **observável**, em **UTC**, com a mesma origem de tempo em todas
as linhas — o fuso do log e o fuso do alerta raramente são o mesmo, e a
sequência embaralhada produz uma causa raiz errada.

Cada linha é um fato que **alguma máquina registrou**: o alerta que disparou,
o log, o commit, o deploy. "O time percebeu" não é linha de tempo; "o alerta
`X` disparou" é.

### Causa raiz

Três frases, nesta ordem:

1. **O que aconteceu** — o fato, sem adjetivo e sem nome de pessoa.
2. **Por que aconteceu** — a condição do sistema que tornou isso possível.
3. **Por que o guarda-corpo não pegou** — o controle que deveria ter impedido
   e não impediu, ou não existia.

O item 3 é o que separa uma causa raiz de uma descrição. "O deploy quebrou"
é descrição; "o `pre-push` não roda o gate de typecheck, e o CI só roda em
`pull_request`" é causa.

**Não** é causa raiz: "falha humana", "falha de processo", "erro humano". São
três jeitos de parar a investigação na pessoa.

### Ações

Toda ação tem **responsável**, **prazo** e **como se sabe que foi feita**.
Uma ação sem o terceiro campo é um desejo.

O **tipo** importa:

| Tipo | O que é |
|---|---|
| **correção** | conserta o dano do incidente específico |
| **guarda-corpo** | impede a **repetição** — é a que fecha o furo, e a que mais importa |
| **decisão** | exige um [ADR](../adr/) — e o ADR é citado na linha |
| **observabilidade** | faz o próximo incidente ser **detectado antes** de causar dano |

Toda ação de **decisão** aponta para o ADR, e nenhum ADR é escrito dentro do
post-mortem: o post-mortem registra a necessidade, o ADR decide.

### O que mudou no sistema

O **estado novo**, verificável. É a seção que o leitor consulta um ano
depois: o que é diferente agora, o que continua igual e por que isso ainda é
aceitável, e **qual controle impede a repetição**.

Se a resposta da última pergunta for "nenhum", o post-mortem está incompleto:
ou a causa raiz não foi encontrada, ou a ação de guarda-corpo não foi feita.

## Do post-mortem para o ADR

O encadeamento é o mesmo que o repo já usa:

```text
problema medido → (ação de correção) → causa raiz → (decisão) → ADR → (guarda-corpo) → regra
```

**O exemplo real do repositório.** As divergências medidas entre o desenho e o
código pelo plano de conformidade de 2026-11-10 são a cadeia completa, e
**não** nasceram de um incidente de produção — nasceram de uma **afirmação
falsa** em documento:

| # | O que foi medido | O que virou | Onde está |
|---|---|---|---|
| X2 | o papel `app_runtime` **não tinha** `statement_timeout` — uma query lenta segurava conexão do pool | **decisão** → ADR | [ADR-0012](../adr/0012-orcamento-de-tempo-no-banco.md) |
| X3 | **não existia** `Idempotency-Key` — o retry de escrita não era seguro, e o cliente recebia 409 no lugar de 201 | **decisão** → ADR | [ADR-0011](../adr/0011-idempotencia-de-escrita.md) |
| X4 | **duas** derivações de `traceId` — o log e o erro apontavam para identificadores diferentes | **correção** (uma derivação só) | [`../system-design/dados.md`](../system-design/dados.md) §5 |

E o guarda-corpo de um deles já está no sistema: o
[`check-doc-claims`](../../.tooling/scripts/ci/check-doc-claims.ts) existe
porque o repo já mediu **número em doc que não bate com o código**.

A regra que daí decorre: **um post-mortem que exige mudar comportamento
precisa de ADR** — e o post-mortem **aponta** para ele. A decisão tem um dono;
o post-mortem registra o porquê de a decisão existir.

## As instâncias

Nenhuma até agora.

| # | Post-mortem | Incidente |
|---|---|---|
| — | — | — |

Um post-mortem novo entra nesta tabela **no mesmo PR** em que o arquivo é
criado. O nome do arquivo é `YYYY-MM-DD-<slug>.md`.

## Ver Também

- [`../adr/`](../adr/) — as decisões (o índice canônico é [`docs/agents/domain.md`](../agents/domain.md)).
- [`../runbooks/`](../runbooks/) — os procedimentos que o incidente expôs.
- [`../tdr/README.md`](../tdr/README.md) — a decisão com rollout e revisão.
- [`../../.agents/specs/conventions/guard-classes.md`](../../.agents/specs/conventions/guard-classes.md) — as 7 classes de controle que falha reportando verde.

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.30.0
