---
name: postmortem-specialist-memory
description: Memória acumulada do agent postmortem-specialist — o template real do README, a regra blameless com a "condição" no lugar do nome, e o encadeamento post-mortem → ADR que os ADR-0011 e ADR-0012 já provaram
---

# Memória: `postmortem-specialist`

> Arquivo de memória do agent `postmortem-specialist`.

## Decisões Tomadas

### 2026-11-18 — O README é formato + índice; o registro é datado

**Contexto:** a matriz de `kit-documentacao.md` §2.5 declara o item 13 com
doc canônico `docs/post-mortems/README.md` e âncoras `## O template`,
`## Linha do tempo`, `## Causa raiz`, `## Ações`. O README foi criado em
**2026-11-18** (mesma leva de instanciação do kit) e hoje declara: *"Hoje
não existe post-mortem neste repositório"* — a ausência é **declarada**.

**Decisão:** o README é **documentação viva** (o gate o mede; ele envelhece
com o repo). Cada registro `docs/post-mortems/YYYY-MM-DD-<slug>.md` é
**registro datado**, na mesma categoria de `docs/adr/**` — que
`documentacao.md` §6 exclui das regras de documentação viva ("registro de
decisão datada — não envelhece, é datado"). A data do **nome** é a do
**incidente**, não da escrita.

**Consequências:** um registro não precisa ser atualizado quando o repo
muda; o README precisa. Se eu mudar o template, o README muda e os registros
antigos continuam válidos como o que eram.

### 2026-11-18 — Blameless é estrutural: o lugar do nome é a "condição"

**Contexto:** a regra "post-mortem que nomeia culpado é defeito" não é
cobrada por nenhum gate — e uma regra sem instrumento é defeito
(`guard-classes.md` §1). Mas "não nomear pessoas" não é detectável por
`grep` de forma confiável.

**Decisão:** a regra vira **texto do template**, não advice: o README §A
regra blameless manda escrever **a condição que tornou a falha possível** —
"o `pre-push` rodava `ci:preflight`, mas não `ci:local`, e o lint não era
coberto por nenhum hook" — e não "o autor fez push sem rodar o lint". A
auditoria confere a **seção `## Causa raiz`**, que tem 3 frases obrigatórias
(o que aconteceu / por que aconteceu / por que o guarda-corpo não pegou) — e
a 3ª é a que não tem como ser escrita sem apontar o controle ausente.

**Consequências:** "falha humana", "falha de processo" e "erro humano" são,
pelos três, formas de parar a investigação na pessoa — e são rejeitadas
pelo README. Um post-mortem aceito tem que dizer qual **controle** faltava.

### 2026-11-18 — O post-mortem é o `Contexto` do ADR, escrito antes

**Contexto:** os dois ADR mais recentes do repo nasceram de um incidente
real: [ADR-0011](../../docs/adr/0011-idempotencia-de-escrita.md) (2026-11-10,
"Aceito") e [ADR-0012](../../docs/adr/0012-orcamento-de-tempo-no-banco.md)
(2026-11-10, "Aceito"). O README §Do post-mortem para o ADR já traz o
encadeamento: `problema medido → (ação de correção) → causa raiz → (decisão)
→ ADR → (guarda-corpo) → regra`.

**Decisão:** o post-mortem é a **versão completa e datada** do que o ADR
resume no `Contexto`. O ADR-0011 diz: *"A correção seria uma chave de
idempotência gravada com a operação — **decisão nova**, e portanto **ADR
novo**, não tarefa de documentação"*. Ou seja: a causa raiz que eu registro é
a **mesma** que o ADR justifica, e o ADR é a **decisão** que sai dela.

**Consequências:** o encadeamento do README tem uma característica que
importa: o exemplo real (X2 → ADR-0012, X3 → ADR-0011, X4 → correção em
`dados.md` §5) **não** nasceu de um incidente de produção — nasceu de uma
**afirmação falsa em documento**. Um post-mortem não exige queda de
produção: exige algo que saiu do jeito que não devia.

## Padrões Descobertos

- O `Contexto` do ADR-0011 traz uma **tabela medida** — `grep -rn
  "Idempotency" apps/api/src/` → **0** ocorrência; `POST /users` re-executado
  com o mesmo e-mail → **409** `EMAIL_IN_USE` (o `email` é `@unique`, e o
  repositório traduz o `P2002` em 409). É o padrão de evidência: a
  **impressão do output** do comando, não a descrição do sintoma.
- O `Contexto` do ADR-0012 traz o output literal do psql —
  `psql -U app_runtime -c 'SHOW statement_timeout'` → `0` (0 = SEM LIMITE) —
  e a citação da lacuna em `docs/system-design/operacao.md` §6.
- Os dois ADRs declaram o **preço** da decisão em `### O preço, declarado` —
  inclusive o preço ruim (o papel do Postgres é do **cluster**; a sessão já
  aberta não muda; 8 s é uma escolha, não uma verdade). É o padrão de
  "consequência" que o post-mortem herda.
- A tabela `## Ações` do template tem 6 colunas — `# | Ação | Tipo |
  Responsável | Prazo | Como se sabe que foi feita` — e 4 tipos: `correção`,
  `guarda-corpo`, `decisão` (exige ADR, citado na linha) e `observabilidade`.
- A linha do tempo é em **UTC**, com a mesma origem de tempo em todas as
  linhas: o fuso do log e o fuso do alerta raramente são o mesmo.

## Lições Aprendidas

- ❌ **Causa raiz = "erro humano".** "O operador rodou o comando errado" não
  é causa raiz — é o fim da investigação. A causa raiz é a lacuna que
  permitiu o erro.
- ❌ **Linha do tempo sem hora nem evidência.** "Aconteceu, depois quebrou" não
  é linha do tempo; "o alerta X disparou às 14:32" é.
- ❌ **Ação sem "como se sabe que foi feita".** Uma ação sem o terceiro campo
  da tabela é um desejo.
- ❌ **Escrever o procedimento aqui.** O post-mortem aponta para o runbook do
  `runbook-specialist`; duplicar o passo é a mesma repetição que o `dry.md`
  proíbe.
- ❌ **Índice que não lista o que existe.** O README §As instâncias é a
  tabela — e a entrada entra no **mesmo PR** que cria o arquivo.

## Sugestões de Evolução

- [ ] Um gate leve que confere, para cada `docs/post-mortems/*.md`, que ele é
  listado em §As instâncias — o `check-doc-kit` mede o README, mas não a
  lista de registros que ele deveria conter.
- [ ] Confirmar que a categoria `registro-datado` de `tamanho-e-revisao.md`
  cobre `docs/post-mortems/**`, como cobre `docs/superpowers/**` — o README é
  vivo e medido; os registros não são.
- [ ] Um check de blameless que procure nome próprio nos registros: hoje a
  regra é conferida na leitura, e um nome de pessoa escaparia.
