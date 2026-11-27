---
name: event-driven
version: 1.0.0
updated: 2026-11-26
maintainer: event-driven-auditor
description: "A aplicação é event-driven: toda mudança de estado publica um evento de domínio versionado, e todo efeito colateral (auditoria, projeção, notificação) é feito por um HANDLER que consome o evento — nunca por uma chamada direta da camada de application. O instrumento é o gate `check-event-driven`, o papel é o `event-driven-auditor` e o processo é a skill `event-driven-audit`."
---

# Convenção: Aplicação event-driven

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

## 1. A REGRA

**A aplicação é event-driven. Quem muda o estado publica um evento de domínio
versionado; quem reage ao evento é um handler.**

O evento é o **contrato** entre o que muda e o que reage. Onde não há evento,
o vínculo é uma chamada direta — e a chamada direta é o que amarra dois
módulos, dois caras de entrega e duas ordens de falha.

Não é "event-driven" o aggregate que emite um evento que ninguém lê. Isso é
evento **morto**: o mesmo custo da chamada direta, com uma classe a mais.

## 2. AS REGRAS

| # | Regra | O que ela proíbe | Instrumento |
|---|-------|------------------|------------|
| **ED1** | **O evento tem nome canônico e contrato explícito.** O `eventName` é `<bc>.<agregado>.<ação>.vN` — o prefixo vem do caminho do arquivo (módulo + agregado + ação), e o `vN` é o que permite evoluir o contrato sem quebrar quem consome. Todo evento implementa `DomainEvent` e declara `occurredAt`, `aggregateId` e `version`. | `profile.created.v1` (prefixo que não é derivável do caminho), `eventName` sem versão, evento sem `aggregateId`. | `check-event-driven` (ED1) |
| **ED2** | **O nome do evento é único.** O `eventName` é a chave do consumidor; chave repetida torna o consumidor ambíguo. | Dois eventos com o mesmo `eventName` em módulos diferentes. | `check-event-driven` (ED2) |
| **ED3** | **Quem emite é o aggregate.** Só o domínio constrói evento; a camada HTTP e a de application o recebem. | `new UserCreatedEvent(...)` em um controller ou em um use case. | `check-event-driven` (ED3) |
| **ED4** | **A dependência aponta para dentro.** O domínio não importa a infraestrutura — a própria ou a de outro módulo. | `import { PrismaXRepository } from '../profiles/infrastructure/...'`. | `check-event-driven` (ED4) |
| **ED5** | **Todo evento tem consumidor na camada `application`.** Quem reage ao evento é um **handler**: um arquivo da camada `application` que **importa a classe do evento e a usa**. Evento sem consumidor é evento morto. | Um evento que o aggregate emite e ninguém drena; um `import` do evento que ninguém usa. | `check-event-driven` (ED5) + registro de exceções |
| **ED6** | **O efeito colateral não é escrito direto pela application.** A application **publica** o evento; o handler escreve. O gate mede as escritas **nomeadas** (`auditService.record` e `auditService.archive` — as portas de escrita de efeito do repo hoje). | `await this.auditService.record(...)` dentro de um use case. | `check-event-driven` (ED6) + registro de exceções |
| **ED7** | **O evento não carrega segredo.** Evento sai do processo — log, fila, arquivo de auditoria, terceiro — e segredo não sai junto. | Um campo `senhaHash`, `token` ou `secret` no evento. | `check-event-driven` (ED7) |
| **ED8** | **A mutação e o registro do efeito colateral são a mesma transação.** Publicar o evento não pode confirmar uma escrita que não aconteceu. | Evento publicado antes da transação fechar; registro gravado em outra transação. | spec de integração (`invariantes-da-conta-no-banco.integration.spec.ts`) — **não** é o gate |

⚠️ **ED8 é a regra que a conversão NÃO pode quebrar.** A trilha de auditoria
(`users_history`/`users_archive`) está na **mesma** transação da mutação desde o
PR #194 — e foi conserto, não herança. Fazer a auditoria virar "assíncrona"
sem outbox na mesma transação é regredir o que o PR #194 consertou. O caminho
event-driven que preserva ED8 é o **handler síncrono dentro da transação**: o
use case publica, o handler roda antes do commit, e o commit é único.

## 3. O QUE É EVENTO E O QUE NÃO É

| é evento | não é evento |
|---|---|
| uma mudança de estado do domínio, nomeada no passado (`UserCreatedEvent`) | um comando (`CreateUser`) — comando vai da borda para dentro, evento sai de dentro para fora |
| o fato, com o dado mínimo que o consumidor precisa | o estado inteiro do agregado |
| versionado (`vN`) | um payload que carrega segredo |
| idempotente no consumo (o consumidor pode repetir sem repetir efeito) | um efeito que só o chamador sabe desfazer |

## 4. O QUE O GATE MEDE — E O QUE ELE NÃO MEDE

O gate é [`check-event-driven`](../../../.tooling/scripts/ci/check-event-driven.ts).
Rodar:

```bash
pnpm tsx .tooling/scripts/ci/check-event-driven.ts
```

Ele mede, no código de produção (`apps/api/src`, sem os `*.spec.ts` nem os
`*.test.ts`):

- o **nome** e a **estrutura** do evento (ED1, ED2), derivado do caminho — o
  prefixo esperado é calculado a partir do arquivo, nunca lido do que o código
  declara;
- **quem emite** (ED3) e **como a dependência aponta** (ED4);
- **quem consome** (ED5) — por referência à CLASSE do evento na camada
  `application`, **fora de um `import`**: o arquivo tem que **importar a
  classe do evento** (o import resolvido por caminho — o barrel do diretório
  de eventos também, e o **alias** do import conta como o mesmo evento:
  `import { UserCreatedEvent as UCE }`) **e usá-la** (com fronteira de
  identificador: um `UserCreatedEventPayload` não é uso de
  `UserCreatedEvent`);
- **quem escreve o efeito colateral** (ED6) — pelas escritas nomeadas
  (`auditService.record`, `auditService.archive`) na camada `application`, e
  medidas no código **sem strings** (uma escrita citada dentro de uma string
  não é uma escrita);
- o **segredo no payload** (ED7) — pelo NOME do **campo declarado** pela
  classe: os campos de classe e as parameter properties do construtor
  (um `readonly x: T` de construtor É um campo; um parâmetro comum não é);
- o **caminho canônico** do evento (`<módulo>/domain/events/`) e o
  **evento ilegível** (um arquivo de evento que o gate não conseguiu ler — que
  escaparia de ED1, ED2 e ED7). ⚠️ O conjunto de arquivos de evento é TODO
  arquivo de um módulo que parece evento (`*.event.ts` ou sob um diretório
  `events/`) — um evento fora do caminho canônico é **erro**, não um arquivo
  que a medição ignora;
- o **registro de exceções**: a chave duplicada, a `verificacao` ausente, a
  `verificacao.tipo` incompatível com a regra e o JSON corrompido são erros
  do gate (não stack trace).

Ele **não** mede:

- o **conteúdo** do evento (se o payload basta ao consumidor) — isso é projeto;
- a **atomicidade** (ED8) — é do spec de integração;
- se o **handler faz** o que promete — o gate prova que o **handler existe**
  (e que usa a classe do evento), não que ele é correto;
- o **nome** do handler — "handler nomeado pelo evento" é a Fase 1 do plano, e
  o gate não exige o que ainda não existe;
- o **acoplamento de DADOS** entre módulos (um módulo importando o
  `infrastructure/persistence/` de outro) — isso é da lens DDD/Hexagonal, e quem
  a aplica é o `stack-code-reviewer`;
- o **comportamento** em runtime — o gate é texto sobre o código;
- código de produção escrito dentro de um `*.spec.ts` — o gate não lê specs;
- o **agregado com hífen no nome** (`user-profile-created.event.ts`): o
  prefixo esperado sai do PRIMEIRO token do nome do arquivo, e o agregado do
  domínio (`UserProfile`) não é consultado. Mudar isso é decisão de desenho
  do nome — não medida, e o gate não a mede.

⚠️ **O gate é mais estrito que o texto e mais fraco que a palavra.**
Ele mede *referência à classe*, não *handler nomeado*; e ele não mede o
payload, que é a parte que decide se a migração é possível.

⚠️ **Um gate que mede o nome não mede o desenho.** Se a versão do evento
mudar, o `vN` muda e o consumidor que casa por `endsWith` (§5) quebra. O
consumidor por **classe** é o que fecha ED5 — e a migração do
`endsWith('.created.v1')` para a classe é o primeiro trabalho da Fase 1.

## 5. A DÍVIDA MEDIDA (2026-11-26)

O que o gate mediu na árvore de 2026-11-26, e o que está no registro
[`.tooling/scripts/ci/excecoes-event-driven.json`](../../../.tooling/scripts/ci/excecoes-event-driven.json):

| violação | quantidade | quem |
|----------|-----------|------|
| **ED5** — evento sem consumidor na camada `application` | **7** (4 de `users`, 3 de `profiles`) | o use case drena por `endsWith('.created.v1')`; os 3 de `profiles` **não são drenados por ninguém** (eventos mortos) |
| **ED6** — efeito colateral escrito direto | **1** (`auditService.record` no caminho de tenancy, `TODO(#184)`) | o registro fora da transação da mutação |

O **plano** que fecha essa dívida é
[`docs/superpowers/plans/2026-11-26-event-driven.md`](../../../docs/superpowers/plans/2026-11-26-event-driven.md).
O plano é o dono do COMO; esta convenção é o dono do QUÊ.

⚠️ **A exceção não é o fim.** Uma exceção no registro é dívida **medida**, e o
gate acusa a exceção que **parou de valer** (o defeito foi corrigido e a entrada
ficou). Corrigir a violação é remover a entrada — no mesmo PR.

O registro também declara **quantas** ocorrências cada entrada cobre
(`ocorrencias`), e o gate compara esse número com o medido: uma dívida que
cresce no arquivo e o registro dizendo `1` é um registro que envelhece em
silêncio.

## 6. O PAPEL E O PROCESSO

| peça | arquivo | o que é |
|------|---------|---------|
| agente | [`event-driven-auditor`](../../agents/event-driven-auditor.md) | o **papel**: o que é a regra, quando me invocar, com quem coordenar |
| skill | [`event-driven-audit`](../../skills/event-driven-audit/SKILL.md) | o **processo**: os passos determinísticos e read-only da auditoria |
| gate | [`check-event-driven`](../../../.tooling/scripts/ci/check-event-driven.ts) | o **veredito** — roda em `pnpm ci:preflight` (camadas A e B) |

## 7. O CAMINHO DA CONVERSÃO

A regra descreve o **estado final**; o plano descreve o **caminho**. Resumo
( o detalhe é do plano):

1. **Fase 1 — `users`**: o evento carrega o dado que o consumidor precisa
   (hoje não carrega quase nada), a application publica por uma porta, e a
   auditoria vira handler **dentro** da transação (ED8 preservado).
2. **Fase 2 — `profiles`**: os 3 eventos mortos ganham handler; o repositório
   de perfil ganha a trilha de auditoria.
3. **Fase 3 — os módulos sem evento** (`auth`, `tenancy`, `feature-flags`):
   evento onde há mudança de estado.
4. **Fase 4 — fora do processo**: outbox e consumidor assíncrono, se e quando
   houver consumidor externo. Exige ADR — `docs/system-design/extensao.md:101`
   já diz que evento assíncrono é decisão nova.

⚠️ **Fase 4 não é "tornar a aplicação event-driven".** A aplicação já é
event-driven quando a Fase 1 fecha: o evento é o contrato, e o handler é quem
reage. O broker é uma extensão, e ele custa.

## Referências

- ADR 0001 (DDD/Hexagonal e auditoria): `docs/adr/0001-*.md`
- Contrato de extensão: `docs/system-design/extensao.md`
- O que o repo já tinha de evento: `docs/system-design/dados.md` §5,
  `docs/system-design/modulo.md`
- Fluxo medido hoje: `docs/flows/http-api/http-api-domain-events-to-audit/`
- Spec da atomicidade (ED8): `apps/api/src/modules/users/infrastructure/persistence/invariantes-da-conta-no-banco.integration.spec.ts`
