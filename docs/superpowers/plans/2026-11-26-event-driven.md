---
name: plano-event-driven
description: "O plano para tornar a aplicação event-driven — o evento de domínio como contrato versionado, a publicação pela camada application, o efeito colateral no handler, e a atomicidade (mutação e registro na mesma transação) preservada. Medido em 2026-11-26: 7 eventos de domínio em 2 módulos, 0 com handler nomeado, 1 escrita de efeito colateral direto pela `application`."
version: 1.0.0
updated: 2026-11-26
status: em-execucao
---

# Plano — a aplicação event-driven

> **Demanda:** *"adicione a regra que a aplicação deve ser event-driven; faça um
> plano para tornar a aplicação event-driven; adicione gates/agents
> auditores/hooks para garantir que todas as regras da aplicação estão sendo
> seguidas; revise tudo e corrija os erros; commit, push e pr"*.
>
> **Composition:** camada 1 = **regra + instrumentos** (o que este PR entrega);
> camada 2 = **plano de migração** (este arquivo); camada 3 = **execução por
> fases**, cada uma com o seu PR.
>
> **O que este PR entregou:** a regra
> ([`event-driven.md`](../../../.agents/specs/conventions/event-driven.md)), o
> instrumento ([`check-event-driven`](../../../.tooling/scripts/ci/check-event-driven.ts)),
> o papel ([`event-driven-auditor`](../../../.agents/agents/event-driven-auditor.md)),
> o processo ([`event-driven-audit`](../../../.agents/skills/event-driven-audit/SKILL.md)),
> o registro da dívida
> ([`excecoes-event-driven.json`](../../../.tooling/scripts/ci/excecoes-event-driven.json))
> e o hook de commit. O que este PR **não** entregou: a migração do código — é
> a Fase 1, e ela é o próximo PR.

## 1. O ESTADO MEDIDO (AS-IS)

Medido em 2026-11-26, na árvore de `v1.39.0`
(snapshot: [`.agents/runs/state-snapshot-20261126T220314Z-event-driven.md`](../../../.agents/runs/state-snapshot-20261126T220314Z-event-driven.md)):

| medida | valor | comando |
|--------|-------|---------|
| eventos de domínio | **7** (4 em `users`, 3 em `profiles`) | `find apps/api/src/modules -path '*/domain/events/*.event.ts' \| wc -l` |
| eventos com **handler nomeado** | **0** | `pnpm tsx .tooling/scripts/ci/check-event-driven.ts` |
| escrita de efeito colateral direta pela `application` | **1** | idem |
| módulos com evento | **2** de 6 | `ls apps/api/src/modules/*/domain/events -d` |
| barramento, broker, outbox | **0** | `grep -rn "EventBus\|outbox\|bullmq\|kafkajs" apps/api/src apps/api/package.json` |

O que o código mostra:

1. O aggregate emite (`#events` + `pullEvents()`), e o use case drena.
2. O consumo **não é por tipo**: `mapEventNameToOperation` casa por
   `endsWith('.created.v1')`. O nome do evento virou um contrato implícito, e o
   `throw` de "Operação desconhecida" só aparece em runtime, com o dado já
   gravado.
3. O contrato do evento é minúsculo: `eventName`, `occurredAt`, `aggregateId`
   (+ `version`). **Não há payload** — e o registro de auditoria precisa do
   snapshot do agregado. Sem payload, um handler de fora não consegue
   reconstruir o registro; ele precisaria do agregado, e aí não é handler.
4. Os 3 eventos de `profiles` são **mortos**: o aggregate emite e ninguém
   drena (o repositório de perfil não recebe auditoria).
5. A trilha de auditoria do `users` está na **mesma transação** da mutação
   (PR #194) — com uma exceção conhecida: o caminho de tenancy grava a
   auditoria fora (`TODO(#184)`), por `auditService.record` chamado do use
   case.
6. O repo declara, em `docs/system-design/extensao.md:101`, que consumo
   assíncrono é **decisão nova e exige ADR**.

## 2. A ARQUITETURA ALVO (TO-BE)

```
   comando (HTTP)
        │
        ▼
   ┌─────────────┐   publica    ┌──────────────────┐
   │   USE CASE  │─────────────►│  EventPublisher  │  (porta no domínio)
   │ (application)│              │  Port            │
   └──────┬──────┘              └────────┬─────────┘
          │                                │ invoca (síncrono, na mesma tx)
          │  resultado do handler          ▼
          │                        ┌──────────────────┐
          │                        │    HANDLER       │  (application/handlers)
          │                        │  (o consumidor)  │
          │                        └────────┬─────────┘
          │                                 │ devolve o efeito
          ▼                                 ▼
   ┌──────────────────────────────────────────────┐
   │  repositório — grava a mutação E o efeito    │  ← MESMA transação (ED8)
   └──────────────────────────────────────────────┘
```

As decisões que o plano fecha:

| # | Decisão | Por quê |
|---|---------|---------|
| **D1** | O `eventName` é `<bc>.<agregado>.<ação>.vN`, com o prefixo derivado do **caminho do arquivo** | nome que não se deriva do lugar é nome que se diverge |
| **D2** | O evento **carrega o payload** que o consumidor precisa (o snapshot do agregado no momento da mudança) | sem payload o handler precisa do agregado — e aí não é handler |
| **D3** | A publicação é por **porta** (`EventPublisherPort`), implementada na infraestrutura | a application não conhece o mecanismo |
| **D4** | Os handlers moram em `modules/<bc>/application/handlers/` e são **nomeados pelo evento** que consomem | consumidor anônimo é `endsWith` disfarçado |
| **D5** | O publicador é **síncrono** e devolve o que os handlers produziram; o use case entrega isso ao repositório | preserva ED8 (mutação e efeito na **mesma** transação) sem Unit of Work |
| **D6** | O contrato do evento é **versionado**; mudá-lo é breaking → `vN` sobe | o consumidor por classe sobrevive à evolução |
| **D7** | Consumo **assíncrono** (broker, outbox, worker) é **fora** do escopo do "tornar a aplicação event-driven" | é ADR, e `extensao.md:101` já diz que é decisão nova |
| **D8** | A trilha de auditoria **não** deixa de ser transacional | o PR #194 consertou isso; a conversão não pode desfazer |

## 3. AS FASES

Cada fase é um PR, com TDD (Red→Green→Refactor) e com o **dente** que prova
que a fase fez o que promete.

### Fase 0 — A regra e os instrumentos (este PR)

| artefato | o que é |
|----------|---------|
| `.agents/specs/conventions/event-driven.md` | as 8 regras (ED1..ED8) e o que o gate mede |
| `.tooling/scripts/ci/check-event-driven.ts` (+ spec) | o veredito: 40 testes, 15 mutações medidas |
| `.tooling/scripts/ci/excecoes-event-driven.json` | a dívida aceita (8 entradas), versionada |
| `.agents/agents/event-driven-auditor.md` + memória | o papel |
| `.agents/skills/event-driven-audit/SKILL.md` | o processo determinístico (read-only) |
| `.husky/pre-commit` | o gate no commit (antes do push) |

**Dente da fase:** o gate reprova quando o nome do evento sai do formato, e o
registro é reconciliado nos dois sentidos (violação nova = erro; exceção
parada de valer = erro).

### Fase 1 — `users` event-driven (o próximo PR)

O que muda:

1. **O payload do evento** (D2). Os 4 eventos de `users` passam a carregar o
   que o registro de auditoria precisa: `version`, `previousVersion`, `reason`
   (onde existe) e o **snapshot** do agregado no momento da mudança. O
   snapshot é o mesmo que já vai para `users_history.snapshot` — **fato com um
   dono**: o evento não vira uma segunda cópia do dado.
2. **A porta de publicação** (D3): `modules/users/domain/ports/event-publisher.port.ts`
   e a implementação em `modules/users/infrastructure/events/`.
3. **O handler** (D4): `modules/users/application/handlers/trilha-de-auditoria-do-usuario.handler.ts`
   — assina os 4 eventos e produz a linha de auditoria.
4. **O use case** deixa de interpretar o `eventName`: `registrosDeAuditoria` e
   `mapEventNameToOperation` saem; o use case publica e repassa o que o handler
   devolveu ao `save`.
5. **O `TODO(#184)` fecha**: o caminho de tenancy passa a publicar o evento em
   vez de chamar `auditService.record` — e a auditoria do tenancy entra na
   mesma transação da mutação.

**Dente da fase:** o spec de integração
(`invariantes-da-conta-no-banco.integration.spec.ts`) continua verde **e** o
gate derruba de 8 para 3 entradas no registro (as 3 de `profiles`): as 4 de `users`
saem (ganham handler) e a do `auditService.record` também (o `TODO(#184)` fecha). O gate
**acusa** a entrada que ficou: o registro não encolhe sozinho.

⚠️ **O que a Fase 1 NÃO pode fazer:** tornar a auditoria assíncrona. Perder a
atomicidade (ED8) para ganhar "event-driven" é trocar um defeito consertado
por um novo.

### Fase 2 — `profiles`: os 3 eventos mortos ganham consumidor

O repositório de perfil hoje não recebe auditoria (`save(profile)` sem
parâmetro de auditoria). A Fase 2 precisa decidir **onde** a trilha do perfil
vive:

| opção | pró | contra |
|-------|-----|--------|
| **A** — reusar `users_history` (`entityId` já é genérico) | uma trilha só; o gate ED5 fecha sem migration | `users_history` sem `tenantId` da profile — e a profile é por tenant |
| **B** — `profiles_history` (migration) | a trilha é da profile, com `tenantId` | migration + gate de RLS + volume |

⚠️ **A escolha é uma ADR**, e ela é do `prisma-db-specialist`. O plano não a
fecha: fechar aqui seria inventar o schema.

**Dente da fase:** os 3 eventos de `profiles` ganham handler e as 3 entradas
saem do registro.

### Fase 3 — os módulos sem evento

`auth`, `tenancy` e `feature-flags` não emitem evento nenhum. Onde há mudança
de estado, há evento:

| módulo | evento candidato | consumidor candidato |
|--------|------------------|----------------------|
| `tenancy` | `membership.created`, `invitation.accepted` | trilha de auditoria; projeção de empresa |
| `auth` | `refresh-token.revoked`, `login.locked` | trilha de auditoria; metric de lockout |
| `feature-flags` | `feature-flag.changed` | projeção/cache; trilha |

⚠️ **Cuidado com `auth`**: evento de autenticação que carrega credencial é
segredo em evento — e o gate ED7 reprova o campo, não a intenção. O evento de
auth carrega **identificador e resultado**, nunca token.

**Dente da fase:** o gate passa a medir 3 módulos com evento; e a cobertura de
handler por evento continua 1:1.

### Fase 4 — fora do processo (fora do escopo do "event-driven")

Se e quando houver consumidor **externo** ao processo (outro serviço, um
relatório, uma integração), o caminho é **outbox**: o evento é gravado na
**mesma** transação da mutação e um dispatcher o publica depois. Isso é:

- migration (tabela `outbox`);
- um dispatcher (job ou worker) — o repo **não tem** scheduler nem broker
  (`@nestjs/schedule` não está instalado);
- **ADR** — `docs/system-design/extensao.md:101` já exige.

**Dente da fase:** o spec de integração prova que a linha do outbox é gravada
na mesma transação, e que o dispatcher é idempotente (republicar o mesmo
evento não duplica o efeito).

## 4. A ORDEM E AS DEPENDÊNCIAS

```
Fase 0 (este PR)  ──►  Fase 1 (users)  ──►  Fase 2 (profiles)  ──►  Fase 3 (auth/tenancy/flags)
                                                  │
                                                  └──►  Fase 4 (outbox) — só se houver consumidor externo
```

- A Fase 2 depende de uma decisão que é da Fase 1 (o formato do payload e da
  linha de auditoria) — por isso a ADR de schema vem **antes** da Fase 2.
- A Fase 4 depende de todas: só faz sentido com mais de um módulo publicando.
- **A ordem do registro é a ordem do plano**: a cada fase, as entradas
  correspondentes saem de `excecoes-event-driven.json`, e o gate acusa a
  entrada que ficou.

## 5. O QUE ESTE PR JÁ DEIXOU PRONTO PARA A FASE 1

| o que a Fase 1 precisa | onde está |
|------------------------|-----------|
| a regra que a Fase 1 implementa | `event-driven.md` §2 (ED1..ED8) |
| o instrumento que denuncia a Fase 1 incompleta | `check-event-driven` (ED5/ED6) |
| o registro que a Fase 1 esvazia | `excecoes-event-driven.json` (8 entradas → 3) |
| o nome canônico que a Fase 1 mantém | o gate ED1 (já verde: `users.user.*.v1`) |
| o processo de auditoria da Fase 1 | `event-driven-audit` (passos 4 e 5) |

## 6. RISCOS

1. **O payload do evento é uma cópia do agregado.** É a decisão D2, e ela tem
   custo: o evento passa a carregar o snapshot. Mitigação: o snapshot é o
   **mesmo** dado que vai para a trilha (fato com um dono, regra DRY do repo),
   e o evento não o duplica em outro lugar.
2. **A auditoria pode ser lida antes de existir.** O evento carrega o snapshot
   no momento da mudança; a trilha é gravada na mesma transação. Quem lê a
   trilha continua vendo o mesmo estado — mas o **evento** e a **trilha** são
   dois lugares para o mesmo fato. Se a Fase 1 criar os dois, ela precisa do
   mesmo dono (o repositório grava a linha que o handler produziu).
3. **A Fase 2 pode exigir migration.** É o ADR do schema; a Fase 2 não
   começa sem ele.
4. **O gate pode ficar barulhento.** Hoje o gate mede 8 violações declaradas.
   Se a Fase 1 esvaziar o registro e alguém criar um evento novo sem handler,
   o gate acusa — que é o ponto. Se o gate passar a acusar o legvido, é
   alarme falso: o conserto é afinar a regra, não desligar o gate.

## 7. O QUE NÃO FOI VERIFICADO

- **A migração não foi executada.** As fases 1 a 4 são plano; o código
  measureado é o AS-IS da §1.
- **A atomicidade (ED8) não foi re-medida** — a suíte de integração exige
  Postgres local (`docker start projeto-base-pg-local`), e esta demanda não
  sobe o ambiente.
- **O comportamento do handler** (que o payload basta ao consumidor) não foi
  medido: **não existe handler ainda** — é o gap G-001 do snapshot.
- **A cobertura** não foi re-medida (mesmo motivo do ambiente).
- **O `ci:local` completo** não rodou: o gate novo entra no `ci:preflight`
  (medido) e no hook de commit (medido), mas a suíte completa de API + e2e
  web exige o ambiente local.
