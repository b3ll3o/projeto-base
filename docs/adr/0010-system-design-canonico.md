# ADR-0010: System design canônico e extensível

- **Status:** Aceito
- **Data:** 2026-11-09
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [`../superpowers/plans/2026-11-09-system-design-padrao.md`](../superpowers/plans/2026-11-09-system-design-padrao.md) · [`../../.agents/runs/state-snapshot-20261109T213637Z.md`](../../.agents/runs/state-snapshot-20261109T213637Z.md)
- **ADR anterior:** [`0009-pasta-unica-de-tooling-de-ia.md`](./0009-pasta-unica-de-tooling-de-ia.md)
- **ADR seguinte:** —

## Contexto

O projeto-base já tem **9 ADRs** — 8 `Aceito` e 1 `Substituído` (o
ADR-0008, superado pelo ADR-0009) — e a stack declarada em
[`../STACK.md`](../STACK.md). A arquitetura, portanto, **existe** — e não tem
endereço.

O problema é de **composição**, não de cobertura. As decisões moram em
arquivos diferentes, com vocabulário diferente e escala diferente:

| Onde | O que mora | Granularidade |
|---|---|---|
| `docs/adr/0001`–`0009` | decisões e alternativas rejeitadas | 1 decisão por arquivo |
| `docs/STACK.md` | tecnologias, versões, justificativa | 1 tabela por camada |
| `docs/MONOREPO.md` | convenções de monorepo | 1 seção por convenção |
| `docs/api/*.md` | contrato HTTP por bounded context | 1 doc por BC |
| `docs/runbooks/*.md` | procedimentos (subir, observar, e2e) | 1 doc por procedimento |
| `docs/web/rotas.md` | catálogo de rotas do frontend | 1 tabela |

Nenhum desses arquivos responde às três perguntas que quem **estende** o
template precisa responder:

1. **"Qual é a topologia do sistema, do ator ao banco?"** — existe, mas
   espalhada em prosa de 6 arquivos, e nenhum diagrama mostra a cadeia
   inteira.
2. **"Onde eu plugo a minha peça?"** — a regra de DDD/Hexagonal responde
   *"onde coloco o código"* ([
   `estrutura-e-versionamento.md`](../../.agents/specs/conventions/estrutura-e-versionamento.md)),
   mas não responde *"como eu adiciono um bounded context, um armazenamento,
   um consumidor ou um exporter novo sem quebrar o que existe"*.
3. **"O que já foi decidido e não deve ser re-litigado?"** — existe, mas
   quem não sabe que `docs/adr/` existe não chega lá.

O resultado é o que o próprio repo já registra: **7 convenções órfãs de
índice** (medido em 2026-11-05, corrigido pela task 2.2 do plano
[`guard-classes`](../superpowers/plans/2026-10-03-guard-classes.md)). O mesmo
fenômeno, na escala da arquitetura: conteúdo certo, endereço desconhecido.

## Decisão

### 1. A arquitetura ganha um **conjunto de documentos canônicos** em `docs/system-design/`

O conjunto é lido de cima para baixo, um documento por nível de abstração:

| Documento | Nível | Pergunta que responde |
|---|---|---|
| [`README.md`](../system-design/README.md) | índice | "por onde eu começo, e qual a linguagem visual" |
| [`contexto.md`](../system-design/contexto.md) | C4 L1+L2 | "quem usa o sistema, o que ele faz, quais são os contêineres" |
| [`modulo.md`](../system-design/modulo.md) | C4 L3 | "como um bounded context é construído, peça por peça" |
| [`dados.md`](../system-design/dados.md) | dados | "onde o dado mora, quem o escreve, como o escopo funciona" |
| [`seguranca.md`](../system-design/seguranca.md) | segurança | "onde estão as fronteiras, o que é ameaça, o que fecha cada uma" |
| [`operacao.md`](../system-design/operacao.md) | operação | "como eu observo, protejo, escalo e degrado" |
| [`extensao.md`](../system-design/extensao.md) | extensão | "como eu plugo uma peça nova sem quebrar o padrão" |

**São 7 arquivos: 1 índice + 6 focais.** O **índice de ADRs tem um só
dono** — [`../agents/domain.md`](../agents/domain.md) — e o conjunto apenas
**linka** ele; não há um segundo índice.

**O nível C4 "código" não é um documento.** Ele é o repositório, e o dono dele
é a convenção
[`estrutura-e-versionamento.md`](../../.agents/specs/conventions/estrutura-e-versionamento.md).
Escrever um quarto nível seria duplicar o que a convenção já mede.

### 2. O doc de system design **aponta**, não reescreve

A regra `dry.md` é explícita: *o fato tem UM dono*. Então:

- **O ADR é o dono da decisão.** O doc de system design **não** repete
  contexto, alternativas e consequências — ele **aponta** para o ADR que
  dona cada decisão.
- **`STACK.md` é o dono das versões** e da justificativa de tecnologia.
- **`MONOREPO.md` é o dono das convenções de monorepo.**
- **`docs/api/*.md` é o dono do contrato HTTP** de cada bounded context.
- **`docs/runbooks/*.md` é o dono dos procedimentos.**

O que o doc de system design **é** dono: a **topologia**, a **fronteira de
confiança**, o **caminho de um request** e o **contrato de extensão** —
coisas que nenhum arquivo existente desenha.

### 3. O `README.md` do conjunto é o dono da **linguagem visual**

Um diagrama de arquitetura é lido por convenção, não por leitura. O conjunto
fixa:

| Papel | Forma | Classe | Cor |
|---|---|---|---|
| Ator | `([ ])` — cápsula | `ator` | violeta |
| Contêiner/processo | `[ ]` — retângulo | `app` | azul |
| Dado/estado | `[(" ")]` — cilindro | `dado` | verde |
| Observabilidade | `{{ }}` — hexágono | `obs` | âmbar |
| Guarda/segurança | `{{ }}` — hexágono | `seg` | vermelho |
| Terceiro/externo | `[ ]` tracejado | `ext` | cinza |

E o **formato é o da linguagem**: todo diagrama começa com o mesmo bloco
`%%{init}%%`, para o render não depender do tema do GitHub.

> **Exceção declarada ao DRY:** o bloco `%%{init}%%` é **duplicado** em cada
> arquivo. O Mermaid lê a diretiva **por documento**, não por repositório —
> não existe include. A alternativa (sem init) deixa o diagrama no tema do
> GitHub, que muda de claro para escuro conforme a preferência do leitor. A
> duplicação é o preço da consistência visual, e ela é **declarada**, não
> escondida.

### 4. Fato de repo e recomendação genérica são **rotulados**

Um doc de system design que descreve "o que um bom design faz" e "o que este
sistema faz" no mesmo tom **começa a mentir sem ninguém editar**. O padrão
separa:

- **fato** — o repo faz; a afirmação aponta `arquivo:linha` ou o ADR dono;
- **`[derivado]`** — recomendação para quem deriva o template; não é fato
  deste repo.

Exemplo: **SLO não existe** neste repo. O documento de operação propõe os
SLIs e marca a proposta como `[derivado]`. Um SLO inventado como fato seria
o pior tipo de mentira: parece que alguém já pensou nisso.

### 5. O **contrato de extensão** é um artefato de primeira classe

`extensao.md` não é "o que falta documentar": é o que faz o padrão
**estender**. Ele responde, para cada peça que um app derivado costuma
precisar, **onde ela encaixa** e **o que o derivado precisa preencher**:

| Peça nova | Onde encaixa | O que o derivado precisa |
|---|---|---|
| Bounded context | `apps/api/src/modules/<bc>/` | as 3 camadas, ports, e o registro no `AppModule` |
| Porta de saída | `domain/ports/` do módulo | a interface + o adapter em `infrastructure/` |
| Armazenamento | adapter de `infrastructure/persistence/` | model Prisma + migration (3 passos) |
| Consumidor de evento | `shared/domain/domain-event.ts` | o evento + o consumidor |
| Exporter de telemetria | `shared/infrastructure/telemetry/` | o exporter + o pipeline do collector |
| Integração externa | adapter em `infrastructure/` | a porta, o cliente, e a entrada no threat model |

E termina num **checklist de conformidade** de 12 itens — o mesmo formato dos
checklists de revisão que o repo já usa.

### 6. O **template** é o que o derivado copia

`.agents/specs/templates/system-design.md` é o formulário: os mesmos blocos,
com marcadores `<...>` no lugar do conteúdo. Um derivado copia o template,
substitui os marcadores e ganha o mesmo esqueleto — que é o que faz o padrão
ser **reproduzível** e não só **descrito**.

## Consequências

### Positivas

- **A arquitetura tem endereço.** Um app derivado encontra a topologia em
  `docs/system-design/`, não em 6 arquivos.
- **A extensão deixa de ser adivinhação.** O ponto de plugagem de cada peça
  é escrito, com o que o derivado precisa preencher.
- **O padrão é reproduzível.** O template é a parte que se copia; o resto é
  a parte que se lê.
- **A distinção fato/recomendação fica visível.** O `[derivado]` é um
  rótulo, e rótulo se vê.
- **A linguagem visual é uma só.** Um diagrama novo nasce com a mesma
  paleta, a mesma forma-por-tipo e a mesma legenda.

### Negativas, e o que fica proibido daqui pra frente

- **Proibido: o doc de system design repetir o conteúdo de um ADR.** Se o
  texto está nos dois, o ADR é o dono e o outro aponta.
- **Proibido: o doc afirmar número sem o comando que o produz.** O formato é
  o `→ \`N\`` que os docs de API já usam. ⚠️ O `check-doc-claims` **não**
  cobre este conjunto: o registry dele aponta para os 6 docs de `docs/api/`
  (`.tooling/scripts/ci/doc-claims.json`). A regra aqui é **humana** — o
  comando vai **inline**, como a convenção `tamanho-e-revisao.md` exige.
- **Proibido: promover `[derivado]` a fato.** Um SLO que vira medido muda de
  rótulo no mesmo commit que passa a medir.
- **O conjunto tem 7 documentos para manter.** É mais superfície para
  envelhecer. O mitigador é o dono explícito de cada arquivo (a tabela da
  decisão 1) e o mapeamento do `doc-sync` — `schema.prisma` →
  `docs/system-design/dados.md` — para o modelo de dados não envelhecer
  sozinho.
- **O `check-doc-coverage` NÃO mede este conjunto.** Ele mede *unidade de
  código → doc canônico* (BC, rota, package) — e o conjunto não é unidade
  de código. A cobertura do conjunto é responsabilidade da revisão, e é
  por isso que o plano exige reconciliar `docs/agents/domain.md` (que
  listava **6** ADRs com **9** em disco) no mesmo PR.

### Em aberto

- **O frescor do conjunto tem instrumento parcial.** O `doc-sync` tem mapa
  editável (`tooling/scripts/doc-sync.ts`): o `schema.prisma` foi mapeado
  para `docs/system-design/dados.md`, e a mutação do schema passa a pedir a
  revisão do modelo de dados. Os **outros 5 focais** não têm gatilho — a
  pergunta "como o resto do conjunto se mantém verdadeiro quando o código
  muda?" fica **aberta**.
- **SLO real exige backend de métricas** que o Prometheus local não tem; o
  documento propõe os SLIs, a implementação é do derivado.

## Alternativas consideradas

- **Um documento único (`docs/SYSTEM-DESIGN.md`)** — **rejeitado**: não cabe
  no teto de 300 linhas do `check-doc-size`, e um documento de 600 linhas que
  ninguém lê é pior que 8 documentos de 200 que alguém percorre.
- **Só um diagrama bonito, sem prosa** — **rejeitado**: um diagrama sem
  dono de fato (ADR, arquivo, linha) volta a mentir na primeira mudança de
  código. A beleza serve a leitura, não substitui a âncora.
- **Reescrever o `STACK.md` como system design** — **rejeitado**: o
  `STACK.md` é o dono das versões e da justificativa de cada tecnologia;
  misturar topologia com versão torna os dois piores.
- **Gerar o system design do código** (ferramenta de análise que extrai a
  arquitetura do repositório) — **rejeitado por agora**: o repo já tem o
  `graphify` (`.agents/skills/graphify/SKILL.md`) para pergunta de
  estrutura. O que falta não é extrair a estrutura — ela está no disco — é
  **explicar a intenção** por trás dela, e a intenção não está no código.

## Ver Também

- [`../system-design/README.md`](../system-design/README.md) — o índice do
  conjunto e a linguagem visual.
- [`../system-design/extensao.md`](../system-design/extensao.md) — o
  contrato de extensão.
- [`./0001-arquitetura-ddd-hexagonal-auditoria.md`](./0001-arquitetura-ddd-hexagonal-auditoria.md)
  — a boundary que o conjunto de nível 3 detalha.
- [`../agents/domain.md`](../agents/domain.md) — o índice de decisões
  arquiteturais do repo.
