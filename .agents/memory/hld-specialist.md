---
name: hld-specialist-memory
description: Memória acumulada do agent hld-specialist — o índice do system design, os 8 princípios com dono e a duplicação do init do Mermaid que é exceção declarada ao DRY
---

# Memória: `hld-specialist`

> Arquivo de memória do agent `hld-specialist`.

## Decisões Tomadas

### 2026-11-18 — O índice não desenha; ele diz quem responde o quê

**Contexto:** o `docs/system-design/README.md` tem 211 linhas e 6 seções
substanciais: §1 ordem de leitura, §2 linguagem visual, §3 os 8 princípios,
§4 contrato de extensão, §5 manutenção, §6 o que não existe. Nenhuma delas
**desenha** topologia — essa é do `contexto.md` e do `modulo.md`.

**Decisão:** o índice é **soleira e mapa**. Ele não repassa o conteúdo dos
docs focais: diz **qual doc responde a pergunta** e quem é o dono de cada
fato. Onde o índice e um doc focal falam do mesmo assunto, o índice linka.

**Consequências:** os 6 focais podem crescer sem que o índice cresça — e
quando um deles morre, o índice é o único lugar que precisa de correção.

### 2026-11-18 — Princípio sem dono é conselho, e a §3 é uma tabela de donos

**Contexto:** a §3 tem 8 princípios (P1..P8), e cada um já tem coluna
"Dono": P1 → ADR-0001 + `estrutura-e-versionamento.md`; P2 e P3 → ADR-0004;
P4 e P5 → ADR-0010; P6 e P8 → o próprio README; P7 → a convenção
`documentacao.md`.

**Decisão:** princípio novo **nasce de um ADR novo** — o ADR é o dono, e a
§3 aponta. Princípio que caduca sai da tabela e o ADR que o sustentava é
marcado como superado. A §3 nunca cresce sem um ADR que a autorize.

**Consequências:** a §3 é o **índice de decisões** do desenho, e ela é
verificável: cada linha tem path que existe.

### 2026-11-18 — A duplicação do `%%{init}%%` é preço, não defeito

**Contexto:** o bloco `%%{init: {...}}%%` e as `classDef` estão **duplicados**
em cada um dos 7 docs do conjunto. O Mermaid lê a diretiva **por documento** —
não existe include nem herança entre arquivos. Sem o bloco, o diagrama
renderiza no tema do GitHub (claro/escuro conforme o leitor).

**Decisão:** a duplicação fica, e é **declarada** na §2.3 como exceção ao
DRY — com o motivo escrito. O `dry.md` permite exceção declarada; o que
proíbe é a repetição **escondida**.

**Consequências:** um doc novo do conjunto **copia** o bloco; o
`c4-specialist` mede `grep -c '%%{init:'` para confirmar que o diagrama
nasce com ele.

## Padrões Descobertos

- O conjunto tem **7** arquivos (`ls docs/system-design/*.md | wc -l` → 7):
  o índice + 6 focais (`contexto`, `modulo`, `dados`, `seguranca`, `operacao`,
  `extensao`). O C4 nível "código" **não é um documento** — é o repositório,
  e o dono dele é a convenção `estrutura-e-versionamento.md`. Registrar isso
  na §1 evita que o próximo conjunto invente um 4º nível.
- A §5 declara, sem ambiguidade, que o `check-doc-coverage` **não** mede este
  conjunto — e que isso é **declarado**, não esquecido: o gate mede
  *unidade de código → doc canônico*, e o conjunto não é unidade de código.
- Só **1** dos 7 docs tem instrumento automático de frescor: o mapa do
  `doc-sync` (`tooling/scripts/doc-sync.ts`) tem
  `apps/api/prisma/schema.prisma` → `docs/system-design/dados.md`. Os
  **outros 5 focais não têm instrumento** — a lacuna está registrada como
  "Em aberto" no ADR-0010.
- A §6 lista **7 lacunas vivas** do desenho (fila, cache distribuído,
  consistência eventual, SLO, resiliência entre serviços, `correlationId` em
  disco, `Idempotency-Key` em `/auth`), cada uma com o doc onde mora e o
  **custo** que ela teria.
- A linguagem visual (§2) tem **6 papéis**: ator (cápsula `([ … ])`),
  contêiner (retângulo `[ … ]`), dado (cilindro `[( … )]`), observabilidade
  (hexágono `{{ … }}`), guarda (losango `{ … }`), externo (paralelogramo
  `[/ … /]`). A regra de leitura: sólido = dentro, tracejado = fora; seta
  cheia = síncrona, tracejada = outra coisa; o rótulo é o protocolo ou o
  dado, nunca "chama".

## Lições Aprendidas

- ❌ **Repetir a decisão do ADR dentro do conjunto.** O conjunto aponta; quem
  repete cria um segundo dono e os dois envelhecem (é o P4 escrito).
- ❌ **Índice que não bate com o disco.** Uma §1 que lista um doc que não
  existe (ou deixa de listar um que existe) é mapa de ficção — e o gate do
  kit cobra o item 4 pelo **conteúdo** das âncoras, não pela verdade da §1.
- ❌ **Princípio sem coluna "Dono".** "Boa prática" sem dono não sobrevive
  ao primeiro prazo.
- ❌ **Apagar a §6 quando a lacuna fecha sem registro.** A ausência fechada
  é informação; ela vai para o doc focal, datada.

## Sugestões de Evolução

- [ ] A §1 e a §6 são as duas partes do índice que **envelhecem**; um gate
      que reconcilie a §1 com `ls docs/system-design/*.md` fecharia a
      classe (o `check-doc-kit` exige a âncora, não a verdade dela).
- [ ] Os 5 focais sem instrumento automático de frescor são a mesma lacuna do
      ADR-0010 — se ela fechar, o mapa do `doc-sync` ganha 5 entradas.
