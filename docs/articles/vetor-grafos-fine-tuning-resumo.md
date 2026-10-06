---
name: vetor-grafos-fine-tuning-resumo
description: >-
  Resumo do artigo "Vetorial, Grafos ou Fine-tuning? Quando escolher cada abordagem em
  uma fintech" (Dennis Rojas, Tech na Prática, 2026-09-30). Materializa a tese
  "definir o problema antes de escolher a tecnologia" e o mapeamento do framework
  para o fluxo de desenvolvimento do projeto-base.
source_url: https://www.linkedin.com/
author: Dennis Rojas
newsletter: Tech na Prática
published: 2026-09-30
updated: 2026-10-02
maintainer: projeto-base contributors
---

# Vetorial, Grafos ou Fine-tuning — Resumo

> Fonte: Dennis Rojas, *Tech na Prática*, publicado em 2026-09-30.
> Continuação do artigo de 2026-09-15 ("SDD / Engineering Loop"), cujas convenções
> já foram materializadas neste repositório — ver
> [`.agents/specs/conventions/evals.md`](../../.agents/specs/conventions/evals.md) (linha 14)
> e
> [`.agents/specs/conventions/engineering-loop.md`](../../.agents/specs/conventions/engineering-loop.md) (linha 21).
> O padrão "artigo → convenção" já é Practice Manager aqui; este resumo é o insumo
> da próxima materialização.

## 1. TL;DR

1. **Vetorial encontra similaridade. Grafos encontram relacionamentos. Fine-tuning
   especializa comportamento.** São abordagens complementares, não concorrentes.
2. Escolher a tecnologia antes de entender o problema é erro — a necessidade de
   domínio guia o design, não o contrário.
3. Às vezes a resposta correta é **nenhuma delas**: uma regra determinística ou
   software convencional resolve antes de existir embedding, grafo ou LLM.

## 2. A tese

A frase-chave do artigo:

> "Vetorial encontra similaridade. Grafos encontram relacionamentos. Fine-tuning
> especializa comportamento."

O **anti-padrão** é o *design technology-first*: abrir o projeto com "precisamos
de um vector database", "precisamos de Neo4j" ou "vamos fazer fine-tuning"
inverte o processo correto. A ordem correta é: primeiro o resultado que o negócio
precisa; depois a evidência disponível; só então a técnica.

## 3. Quando escolher busca vetorial

O caso: um cliente relata **um Pix não reconhecido**. As reclamações históricas
similares usam palavras muito diferentes entre si:

- "transferências não autorizadas"
- "dinheiro saindo da conta"
- "transação desconhecida"

São **lexicalmente diferentes e semanticamente equivalentes**. É exatamente a
lacuna que embeddings preenchem: encontrar o caso anterior mesmo quando o cliente
descreve o problema com outro vocabulário.

Serve para: casos similares, documentação interna, procedimentos e políticas,
regulamentações, tickets, contratos, incidentes e disputas históricas.

**Requisito central:** similaridade semântica apesar da diferença de formulação.

## 4. Quando escolher grafos

Em investigação de fraude, examinar transações **isoladas** pode não revelar
nada suspeito. O risco só aparece nos **relacionamentos** entre entidades.

**Entidades:** `Customer`, `Account`, `Device`, `IP`, `Transaction`, `Merchant`,
`Card`, chave Pix.

**Tipos de relação:** `OWNS`, `USES`, `SENT_PIX`, `RECEIVED_PIX`, `LOGGED_FROM`,
`TRANSFERRED_TO`, `SHARES_DEVICE`.

**O que a query revela:**

- contas que compartilham o mesmo dispositivo;
- múltiplos documentos vinculados a um IP;
- fluxo de Pix concentrado numa conta;
- redes de contas-mula;
- movimentação circular de fundos;
- conexões indiretas entre suspeitos.

**Regra:** grafos quando a evidência está nas **conexões**, não nos registros
isolados.

## 5. Vetorial vs. grafos vs. RAG/GraphRAG

Não é escolha excludente. Numa investigação de fraude em Pix, as três se
complementam dentro do mesmo caso:

| Camada | O que entrega |
|---|---|
| Grafo | Explica **por que** a transação foi sinalizada (dispositivo compartilhado, concentração de fundos) |
| Busca vetorial | Encontra **casos históricos comparáveis** |
| Recuperação (RAG) | Fornece **políticas e procedimentos internos vigentes** |

Usar os relacionamentos do grafo **junto com** conhecimento recuperado é o que
se chama de **GraphRAG**.

## 6. Quando fine-tuning se encaixa

Fine-tuning muda o **comportamento** do modelo para uma tarefa. **Não é mecanismo
de recuperação de conhecimento.** RAG e grafos fornecem *contexto*; fine-tuning
*especializa o desempenho*.

**Caso adequado:** produzir consistentemente avaliações de risco estruturadas
(alto risco / identificação de dispositivo compartilhado / encaminhamento para
revisão manual) quando já existem milhares de exemplos validados de entrada/saída.

Outros usos válidos: classificação de tickets, categorização de transações,
classificação de documentos, extração estruturada de informação, detecção de
intenção, respostas padronizadas, tarefas repetitivas com bastante dado validado.

**A proibição:** não usar fine-tuning para memorizar regras de Pix, políticas,
regulamentações ou padrões de fraude **que mudam**. Conhecimento que muda pertence
a RAG ou a outra fonte viva de recuperação — não aos pesos do modelo.

## 7. Critérios práticos de decisão

Quatro perguntas, na ordem:

1. **A similaridade é semanticamente importante?** Se sim → vetorial.
2. **Os relacionamentos são a fonte de valor?** Se sim → grafos.
3. **É necessário especializar comportamento _e_ existem exemplos de alta qualidade
   suficientes?** Se sim → fine-tuning.
4. **Preciso realmente de IA para resolver isso?** Se a resposta for não, regra
   comum, busca convencional ou query relacional já resolve.

### Tabela do artigo

| Necessidade primária                        | Abordagem preferida                    | Motivo principal                                     |
| ------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Encontrar casos/documentos semanticamente relacionados | Busca vetorial / embeddings          | Lida com palavras diferentes com mesmo significado    |
| Rastrear relacionamentos entre entidades    | Graph DB ou processamento de grafos    | Torna explícitas conexões indiretas e multi-hop      |
| Fornecer regras e políticas vigentes        | RAG ou outra fonte viva de recuperação | Conhecimento muda com o tempo                        |
| Padronizar uma tarefa repetitiva de modelo  | Fine-tuning, com exemplos fortes       | Especializa o comportamento do modelo                |
| Aplicar regras de negócio determinísticas   | Software convencional pode bastar      | Nem toda regra precisa de LLM                        |
| Combinar evidência relacional e conhecimento vigente | GraphRAG / arquitetura híbrida | Usa recuperação e travessia complementares           |

## 8. Mapping para este repositório

O framework do artigo não é abstrato aqui: o projeto-base **já é** uma
arquitetura que escolhe a abordagem por necessidade, não por tecnologia.

### 8.1 A pergunta 4 já é respondida por regra determinística

O `specialist-router` classifica a demanda por uma matriz canônica — *PATH
GLOBS*, *DEMAND KEYWORDS*, *DEMAND SCOPES* e *SKIP HEURISTICS* em
[`.agents/specs/conventions/specialist-routing.md`](../../.agents/specs/conventions/specialist-routing.md) (linha 19)
— **antes** de qualquer agente ser despachado. É a resposta do projeto-base à
pergunta "preciso realmente de IA?": a maior parte do roteamento é regex e
path matching, não LLM.

O `review-router` explicita o mesmo princípio:
["Classificação é determinística. Mesmo diff + mesma matriz → mesmo output."](../../.agents/agents/review-router.md) (linha 128)

Verificação:

```bash
ls .agents/agents/*.md | wc -l          # 19 definições de agent
ls .agents/memory/*.md | wc -l          # 21 memórias
```

### 8.2 Vetorial → memória como corpus recuperado

Quando a busca lexical (`Grep`) não acha correspondência literal, o corpus
recuperado é o conjunto de memórias em `.agents/memory/` — 21 arquivos
(verificação acima) — e o agente que faz a recuperação é o `explorer`. É a
mesma função do caso do Pix: achar o precedente cuja formulação é diferente.

### 8.3 Grafos → o catálogo de flows é literalmente um grafo

O repositório mantém, sob `docs/flows/`, um grafo de execução por flow, com
`nodes` e `edges` explícitos — a evidência relacional que o artigo diz ser a
fonte de valor em investigação.

```bash
find docs/flows -mindepth 2 -type d | wc -l     # 78 flows
```

Nem todo flow é grafo — há quatro `diagram_type` (`workflow`, `sequence`,
`dataflow`, `mapping`). Contagem dos que carregam estrutura de grafo:

```bash
python3 -c "
import json,glob
n=e=0
for f in glob.glob('docs/flows/*/*/*.json'):
    d=json.load(open(f))
    n += 'nodes' in d; e += 'edges' in d
print('com nodes:', n, '| com edges:', e)"
# com nodes: 58 | com edges: 48
```

É o equivalente estrutural de `SHARES_DEVICE` ou `TRANSFERRED_TO`: a conexão
multi-hop entre agentes fica explícita, não implícita na prosa.

### 8.4 Fine-tuning proibido para conhecimento que muda

O projeto-base aplica a proibição do artigo (§6) na sua própria arquitetura:
regra que muda **não** é fixada no corpo do agent — ela mora em
`.agents/specs/conventions/`, um arquivo vivo e versionado, com matriz de gaps
conhecidos e histórico de versões.

O caso `G3` é a prova direta e é quase uma citação do artigo:

> ["Demand keywords regex é ingênuo (não semântico) — pode dar FP em demandas com 'docker' como adjetivo"](../../.agents/specs/conventions/specialist-routing.md) (linha 254)

Traduzido: o roteamento por palavra-chave é o *busca convencional* do projeto,
não o *vetorial*. O próprio repo registra que a similaridade semântica não é
coberta pela matriz atual.

### 8.5 O `gap_detected` é o "preciso mesmo de IA?" do framework

Quando nenhuma linha da matriz casa com a demanda, o `specialist-router`
retorna `gap_detected: true` e bloqueia o planning para que o `agent-architect`
crie o specialist faltante
([`specialist-router.md`](../../.agents/agents/specialist-router.md) (linha 5)). É o
antídoto direto ao *design technology-first*: sem demanda coberta, o sistema
para em vez de escolher uma ferramenta qualquer.

## 9. Fontes e limitações

- **Artigo-fonte:** "Vetorial, Grafos ou Fine-tuning? Quando escolher cada
  abordagem em uma fintech", Dennis Rojas, newsletter *Tech na Prática*,
  publicado em 2026-09-30.
- **Autoria anterior no repositório:** as convenções `evals.md` e
  `engineering-loop.md` já citam "Dennis Rojas (Tech na Prática, 2026-09-15)" como
  fonte — este artigo é a continuação daquela linha.
- **Limitação deste documento:** o resumo foi produzido a partir de **extração do
  conteúdo publicado**, sem navegação no artigo original e sem acesso a comentários
  ou revisões. Números, tabelas e exemplos de domínio aqui reproduzidos vêm
  dessa extração; exemplos com sabor fintech (Pix, AML) são do contexto do autor,
  não de código deste repositório.
- **Arquivos ausentes:** `docs/articles/` existia apenas como referência. Além
  deste resumo, seguem **ausentes** e referenciados por convenções canônicas:

  | Arquivo ausente | Citado em |
  |---|---|
  | [`docs/articles/vibe-coding-sdd-engineering-loop-mapping.md`](./vibe-coding-sdd-engineering-loop-mapping.md) | `evals.md:23`, `engineering-loop.md:30` |
  | `docs/articles/vibe-coding-ssd-engineering-loop.md` | `evals.md:184`, `engineering-loop.md:164` |

  Verificação:

  ```bash
  ls docs/articles/
  # vetor-grafos-fine-tuning-resumo.md
  ```
