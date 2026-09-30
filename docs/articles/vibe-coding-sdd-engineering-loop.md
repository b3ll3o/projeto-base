---
title: "Vibe Coding, SDD, Engineering Loop, Evals e Context Engineering — criando uma Fintech com monolito modular"
author: Dennis Rojas
source: https://www.linkedin.com/pulse/vibe-coding-sdd-engineering-loop-evals-e-context-criando-dennis-rojas-wh4jf
newsletter: Tech na Prática
published_at: 2026-09-15
fetched_at: 2026-09-30
language: pt-BR
tags: [sdd, context-engineering, evals, engineering-loop, ddd, fintech, monolito-modular]
related:
  - AGENTS.md
  - .agents/WORKFLOWS.md
  - .agents/specs/conventions/state-aware-planning.md
  - .agents/specs/conventions/tdd.md
  - .agents/specs/conventions/retrospective-capture.md
status: faithful-transcription
---

<!-- markdownlint-disable MD025 -->
# Vibe Coding, SDD, Engineering Loop, Evals e Context Engineering criando uma Fintech com monolito modular
<!-- markdownlint-enable MD025 -->

> **Nota:** este arquivo é uma transcrição fiel do artigo de Dennis Rojas publicado na newsletter *Tech na Prática* em 15/09/2026. Foi adicionado à pasta `docs/articles/` do projeto-base porque os conceitos discutidos são **a mesma base conceitual** sobre a qual o padrão genérico de agents deste projeto foi construído. Veja o arquivo companion [`./vibe-coding-sdd-engineering-loop-mapping.md`](./vibe-coding-sdd-engineering-loop-mapping.md) para a análise de mapeamento.

---

## O problema não é o prompt

Vibe coding tornou extremamente barato transformar uma ideia em código. Você descreve o que quer, entrega contexto a um agente, e minutos depois surgem controllers, migrations, testes e dezenas de classes.

O problema começa quando a aplicação deixa de ser protótipo. Ao pedir "crie uma fintech em Java com Spring Boot, PostgreSQL, Kafka, DDD e monólito modular", surgem questões:

- Quem é dono do saldo?
- Pix pode acessar AccountRepository?
- Ledger pode conhecer PixTransfer?
- Onde fica a regra de limite?
- Como impedir transferências concorrentes?
- O que acontece se o banco grava e o Kafka falha?
- Como garantir coerência após 50 mudanças?

> "O problema já não é geração de código. O problema passa a ser contexto."

Existe tendência de resolver com prompts cada vez maiores (Java 21, Spring Boot, DDD, Hexagonal, Outbox, idempotência...). Mas um prompt não deveria ser o banco de memória da engenharia. Conforme o sistema cresce, é preciso transformar contexto implícito em artefatos explícitos e versionados.

## Context Engineering

- **Prompt Engineering** pergunta: "Como faço uma boa pergunta?"
- **Context Engineering** pergunta: "Qual informação o agente precisa ter disponível para tomar uma boa decisão?"

O contexto deixa de existir apenas no chat e passa a existir no projeto:

```text
docs/
specs/
ADRs
C4
Bounded Contexts
Context Map
Business Rules
Contracts
Evals
Feedback
```

> "O agente não precisa 'lembrar' da arquitetura. A arquitetura está disponível como contexto."

## SDD: especificação antes da implementação

Em vez de `Prompt → Code`, parte-se de:

```text
Intent
  ↓
Spec
  ↓
Research
  ↓
Data Model
  ↓
Contracts
  ↓
Plan
  ↓
Tasks
  ↓
Code
```

Para a feature "Send Pix":

```text
specs/005-send-pix/
├── spec.md
├── research.md
├── data-model.md
├── contracts/
│   ├── api.md
│   └── events.md
├── plan.md
├── tasks.md
└── evals/
```

Exemplo de regras de negócio na `spec.md`:

```text
BR-001  A conta deve existir.
BR-002  A conta deve estar ativa.
BR-003  O valor deve ser maior que zero.
BR-004  A operação deve possuir fundos disponíveis.
BR-005  O limite Pix deve ser respeitado.
BR-006  A operação deve passar pela análise de risco.
BR-007  A Idempotency-Key não pode gerar duas transferências.
```

## DDD ajuda a organizar o contexto

DDD não serve apenas para organizar `domain/application/infrastructure`. O ponto principal é estabelecer **fronteiras semânticas**:

| Contexto       | Responsabilidade                                |
|----------------|-------------------------------------------------|
| Customers      | identidade, cadastro, KYC                       |
| Accounts       | conta, status, bloqueios e limites              |
| Pix            | chaves, transferências e lifecycle              |
| Cards          | cartões e autorizações                          |
| Ledger         | journals, débito, crédito e saldo contábil      |
| Fraud          | risco, score e decisão                          |
| Notifications  | entrega de notificações                         |

Decisão crítica: **"Ledger é a única fonte de verdade financeira"**.

```text
Accounts              Ledger
├── Account           ├── Journal
├── AccountStatus     ├── LedgerEntry
└── AccountLimit      ├── Debit
                      ├── Credit
                      └── Balance
```

Sem essa decisão, a IA pode gerar:

```java
account.setBalance(account.getBalance() - amount);
```

mesmo que a arquitetura tenha decidido que o Ledger é a fonte contábil.

## Context Map: quem pode falar com quem?

**Errado** — Pix acessa diretamente a infraestrutura de outro contexto:

```text
Pix
 ↓
AccountRepository
```

**Correto** — atravessando apenas a fronteira semanticamente válida:

```text
Pix
 ↓
AccountTransferEligibility
 ↓
Accounts
```

Da mesma forma, Pix não conhece `FraudRule`, `RiskModel` ou `FraudRepository`; apenas consome `RiskAssessment`:

```text
Pix
 ↓
RiskAssessment
 ↓
Fraud
```

E Ledger não conhece `PixTransfer`:

```text
PixTransferCompleted
        ↓
Integration Adapter
        ↓
LedgerPostingRequested
        ↓
Ledger
        ↓
Journal
 ├── Debit
 └── Credit
```

> "Esse Context Map também é Context Engineering. Estamos ensinando ao agente não apenas quais classes existem, mas qual linguagem pertence a cada contexto."

## Evals: a spec precisa ser verificável

Como saber se a IA respeitou "Pix não pode acessar a infraestrutura de Accounts"? Através de **Evals**:

- **Spec** = comportamento esperado
- **Eval** = evidência de que o comportamento foi respeitado

**Domain Eval**

```text
Given: PixTransfer = REJECTED
When:  complete()
Expected: A operação deve falhar.
```

**Idempotency Eval**

```text
Given: mesma Idempotency-Key
When:  POST /pix/transfers executado duas vezes
Expected: apenas uma PixTransfer deve existir.
```

**Architecture Eval**

```text
pix não pode importar:
  accounts.infrastructure
  ledger.infrastructure
  fraud.infrastructure
```

**Ledger Eval**

```text
Given:  Pix = R$100
Expected:
  Debit  = R$100
  Credit = R$100
  sum(debits) == sum(credits)
```

Fluxo atualizado:

```text
Intent
  ↓
Spec
  ↓
Acceptance Criteria
  ↓
Evals
  ↓
Plan
  ↓
Tasks
  ↓
Implementation
```

### Evals não são apenas testes

Tipos possíveis: **Domain, Architecture, Contract, Integration, Regression, Security e Observability** Evals. Podem ser JUnit, ArchUnit, requests reais, métricas — ou avaliações por outro agente:

```text
Implementation Agent
        ↓
       Diff
        ↓
 Reviewer Agent
        ↓
Spec + ADR + Context Map + Evals
        ↓
Architecture Review
```

> "A IA deixa de ser somente quem escreve código. Ela também participa da verificação."

## Engineering Loop

Software não termina quando o código passa nos testes. Ele vai para produção, e produção ensina o que a spec não sabia.

```text
UNDERSTAND
    ↓
IMPLEMENT
    ↓
TEST
    ↓
REVIEW
    ↓
OBSERVE
    ↓
LEARN
    ↺
```

**Understand** — O agente lê spec, business rules, ownership, context map, ADRs, contracts e evals, identificando o que muda, módulos afetados, invariantes e riscos.

**Implement** — Código dentro do espaço de decisão delimitado pela spec.

**Test** — Unit, Integration, Contract, Architecture Tests e Evals.

**Review** — Humano ou agente avalia spec + diff + tests + architecture rules:

- A implementação atende a intenção?
- Alguma fronteira DDD foi quebrada?
- Existe risco de concorrência?
- A idempotência está correta?
- Alguma regra foi parar na infrastructure?

**Observe** — Dados reais de produção:

```text
pix_transfer_total
pix_transfer_success_total
pix_transfer_failed_total
pix_transfer_duration_seconds
fraud_analysis_duration_seconds
outbox_pending_events
```

**Learn** — O aprendizado volta para o contexto. Exemplo:

```text
engineering/feedback/005-send-pix.md

Finding:
  Duplicate event delivery can generate
  duplicate ledger postings.

Decision:
  Ledger consumers must be idempotent.
```

Esse aprendizado gera nova spec (`006-ledger-consumer-idempotency/`). O loop fecha.

## O contexto também evolui

Pensamos no contexto apenas como entrada:

```text
Context → AI → Code
```

Mas em engenharia real, o contexto também é saída:

```text
Context
   ↓
AI
   ↓
Implementation
   ↓
Production
   ↓
Learning
   ↓
Context
```

> "Não estamos apenas entregando contexto para a IA. Estamos construindo um mecanismo para manter esse contexto correto ao longo do tempo."

## Como fica no repositório

```text
fintech/
├── docs/
│   ├── architecture/    → c4.md, adr/
│   └── domain/          → bounded-contexts.md, context-map.md,
│                          ownership.md, ubiquitous-language.md,
│                          business-rules.md
├── specs/005-send-pix/
│   ├── spec.md
│   ├── research.md
│   ├── data-model.md
│   ├── contracts/
│   ├── evals/
│   ├── plan.md
│   └── tasks.md
├── engineering/
│   ├── loops/005-send-pix/
│   │   ├── 01-understand.md
│   │   ├── 02-implement.md
│   │   ├── 03-test.md
│   │   ├── 04-review.md
│   │   ├── 05-observe.md
│   │   └── 06-learn.md
│   └── feedback/005-send-pix.md
└── src/
```

Cada parte responde a uma pergunta:

| Pasta              | Pergunta                                                  |
|--------------------|-----------------------------------------------------------|
| docs/domain        | Como nosso negócio funciona?                              |
| docs/architecture  | Quais decisões estruturais tomamos?                       |
| specs              | O que esta feature precisa fazer?                         |
| evals              | Como provamos que está correta?                           |
| engineering/loops  | Como construímos e validamos?                             |
| feedback           | O que aprendemos?                                         |
| src                | Qual implementação satisfaz tudo isso?                    |

## O agente passa a trabalhar dentro de um sistema

Em vez de:

> "Crie a feature Send Pix usando DDD, PostgreSQL, Outbox, Kafka..."

O prompt fica:

```text
Implemente: specs/005-send-pix/

Leia antes:
  docs/domain/
  docs/architecture/

Execute os evals definidos pela feature.

Siga: plan.md, tasks.md.

Durante a implementação registre o Engineering Loop.

Se encontrar conflito entre código e spec,
não altere silenciosamente a arquitetura.
Registre o conflito e proponha atualização
da spec ou ADR.
```

> "Quanto melhor estruturado o contexto, menos precisamos explicar tudo novamente no prompt."

## Vibe Coding continua útil

Três níveis coexistem:

- **Vibe coding** → Como gerar código rapidamente?
- **SDD** → O que deveria ser construído?
- **Evals** → Como sabemos que está correto?
- **Engineering Loop** → Como entregamos, verificamos e aprendemos?
- **Context Engineering** → Qual informação o agente precisa durante todo o processo?

## De copiloto para sistema de engenharia

Evolução:

```text
Developer + Copilot
       ↓
Developer + Coding Agent
       ↓
Sistema de contexto + restrições + feedback + avaliação ao redor da IA
```

> "O diferencial passa a ser a qualidade do sistema de contexto, restrições, feedback e avaliação que colocamos ao redor dela."

## Conclusão

Gerar código está ficando barato. Manter coerência de engenharia continua difícil. O fluxo deixa de ser `Prompt → Code` e passa a ser:

```text
Intent
  ↓
Context
  ↓
Spec
  ↓
Evals
  ↓
Plan
  ↓
Engineering Loop
  ↓
Production
  ↓
Feedback
  ↓
Learning
  ↓
Context
```

- **Vibe coding** acelera a construção.
- **SDD** dá direção.
- **DDD** protege as fronteiras.
- **Evals** tornam a intenção verificável.
- **Engineering Loop** transforma execução em aprendizado.
- **Context Engineering** conecta tudo, garantindo contexto certo para humanos e agentes.

---

## Ver também

**Análise de como cada conceito deste artigo já vive no padrão deste projeto:** [`./vibe-coding-sdd-engineering-loop-mapping.md`](./vibe-coding-sdd-engineering-loop-mapping.md) — tabela 1:1 com 11 conceitos (Context Engineering, SDD, DDD, Context Map, Evals, Engineering Loop, state-snapshot, etc.) mapeados para `agents`, `workflows` e `conventions` correspondentes, mais o caminho natural para implementar uma fintech como a do artigo usando o catálogo de agents.

**Diferença entre os dois arquivos:**

| Arquivo                                                   | Conteúdo                                                                  |
|-----------------------------------------------------------|---------------------------------------------------------------------------|
| `vibe-coding-sdd-engineering-loop.md` (este)               | Transcrição fiel do artigo — corpo do Dennis Rojas sem alterações          |
| `vibe-coding-sdd-engineering-loop-mapping.md`              | Análise do projeto-base — como cada conceito do artigo já está implementado |

---

## Checklist de Revisão (`tamanho-e-revisao.md`)

- [x] pt-BR no corpo (preservado do original)
- [x] Identificadores técnicos em inglês (kebab-case, paths, comandos)
- [x] Frontmatter canônico com `source`, `author`, `published_at`, `related`
- [x] Atribuição explícita ao autor original (Dennis Rojas, *Tech na Prática*)
- [x] URL fonte preservada para verificação
- [x] Transcrição fiel: conteúdo integral do artigo preservado sem paráfrase
- [x] Análise/comentários claramente separados em arquivo irmão (companion file)
- [~] Arquivo ≤ 300 linhas — **EXCEÇÃO DOCUMENTADA**: transcrição fiel de artigo externo longo (~460 linhas de corpo). A análise do projeto-base foi extraída para `*-mapping.md` (companion) para manter SRP. Conteúdo do artigo em si é intocável por respeito ao autor original.

**Mantido por:** projeto-base contributors · **Licença do conteúdo original:** Dennis Rojas (*Tech na Prática*, 2026-09-15) · **Licença deste arquivo:** MIT (somente a estrutura, frontmatter e a seção "Ver também"; o corpo do artigo é do autor original).
