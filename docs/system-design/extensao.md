# System Design — Contrato de Extensão

> **Este é o documento que faz o padrão ser *extensível*, e não apenas
> *descrito*.**
> **Medido em 2026-11-09:** os pontos de plugagem conferem com a árvore de
> `apps/api/src/` e com `apps/api/src/app.module.ts`.
> **Dono:** este documento. **Decisão que fundamenta:**
> [ADR-0010](../adr/0010-system-design-canonico.md).

---

## §1. A receita, em 4 passos

```text
1. LEIA     o que já existe — este doc + o ADR dono da área
2. ESCOLHA  a peça da matriz §2 (é uma das 6; se não é, é sinal de que
            falta uma decisão, e não um detalhe de implementação)
3. PLUGUE   no ponto nomeado — o arquivo, a pasta e a camada
4. CONFORME o checklist §4 — 12 itens, cada um com comando
```

O app derivado **copia** o
[template](../../.agents/specs/templates/system-design.md) e **estende** o
desenho. Ele **não** copia as decisões: as decisões são do `projeto-base`.

---

## §2. A matriz: 6 peças que um app derivado costuma precisar

| Peça nova | Onde encaixa | O que o derivado precisa | O que quebra se errar |
|---|---|---|---|
| **1. Bounded context** | `apps/api/src/modules/<bc>/{domain,application,infrastructure}/` + registro em `app.module.ts` | as 3 camadas, as ports, e o module com o provider da infraestrutura | o módulo não é registrado → a rota **não existe** (404) e o erro é silencioso |
| **2. Porta de saída** | `modules/<bc>/domain/ports/<nome>.port.ts` + token de injeção (ex.: `Symbol`) | a interface no domínio, o adapter em `infrastructure/`, e o binding no module | o use case importa a infraestrutura → **quebra a regra de dependência** (gate D11) |
| **3. Armazenamento** | `modules/<bc>/infrastructure/persistence/` (ou um `shared/` novo, se for global) | model no `schema.prisma` + **migration pelos 3 passos** + porta | model **removido** do schema sem a migration → o `migrate diff` do Prisma **propõe `DROP TABLE`** (o caso registrado em `schema.prisma:295-307`) |
| **4. Consumidor de evento** | `modules/<bc>/application/` (quem reage) + o evento em `domain/events/` | o evento no domínio, o consumidor, e a decisão de **sincronia** | consumir fora da transação → o efeito acontece sem o dado |
| **5. Exporter de telemetria** | `shared/infrastructure/telemetry/` + pipeline no `infra/otelcol/config.yaml` | o exporter, o resource attribute, e o pipeline | exporter sem `resource_to_telemetry_conversion` → **toda** métrica perde a label do serviço |
| **6. Integração externa** | `modules/<bc>/infrastructure/` (o adapter) + a port no domínio | a port, o cliente, o **timeout**, e a entrada no modelo de ameaça | cliente sem timeout → a request pendurada segura a conexão do pool |

---

## §3. Os 6 pontos, em detalhe

### 3.1 Bounded context novo

```text
apps/api/src/modules/<bc>/
├── domain/          # entidades, VOs, policies, events, exceptions, ports/
├── application/     # use cases + DTOs
├── infrastructure/  # http/ (controller, schemas, guards) + persistence/
└── <bc>.module.ts   # registra providers e controllers
```

O module precisa ser **importado** em `app.module.ts` — sem isso o
`@Module` não é instanciado e a rota **não aparece**. É o primeiro sintoma
de "criei o módulo e deu 404".

**Exceção declarada:** um módulo que é só uma probe (como `health`) não tem
as 3 camadas — e a exceção é **escrita**, não implícita.

### 3.2 Porta de saída

O padrão de 3 passos, com o **nome do arquivo e o token**:

```ts
// 1. domain/ports/<nome>-repository.port.ts — a interface, em domínio
export const MEU_REPOSITORY_PORT = Symbol('MeuRepositoryPort');
export interface MeuRepositoryPort {
  buscarPorId(id: string): Promise<MinhaEntidade | null>;
}

// 2. infrastructure/persistence/prisma-meu.repository.ts — o adapter
// 3. <bc>.module.ts — o binding: { provide: MEU_REPOSITORY_PORT, useClass: PrismaMeuRepository }
```

> O use case **depende da interface**, nunca do adapter. É isso que
> permite o repositório in-memory nos testes sem tocar no domínio.

### 3.3 Armazenamento novo

1. **model** no `apps/api/prisma/schema.prisma` — com `@@map`, índice e
   `version`, como os outros;
2. **migration** pelos 3 passos (add nullable → backfill → drop), com a
   convenção [`migracao-de-dados.md`](../../.agents/specs/conventions/migracao-de-dados.md);
3. **port + adapter**, e o repo lê a tabela **dentro do escopo** —
   `comEscopoDeEmpresa(prisma, tenantId, fn)`.

> **A coluna `tenant_id`** só entra se a tabela for **por empresa**. Se for
> global, ela **não** entra — e a pergunta "é global ou por empresa?" é
> respondida **antes** da migration, porque depois é uma ALTER em produção.

### 3.4 Consumidor de evento

O repo **não tem** barramento de eventos. Então "consumir um evento" aqui
significa, hoje:

- **dentro da mesma operação** — o use case drena os eventos do aggregate e
  chama o `AuditServicePort` (é o padrão de `users`);
- **dentro da mesma transação** — se o efeito é dado, e a atomicidade
  importa.

> **Se o derivado precisa de evento *assíncrono*, isso é uma decisão nova**
> (fila, worker, broker) e **não** um detalhe de implementação: ela muda o
> modelo de consistência e o modelo de ameaça. Ela exige ADR.

### 3.5 Exporter de telemetria

```yaml
# infra/otelcol/config.yaml
exporters:
  meu_exporter:
    endpoint: meu-backend:4317
service:
  pipelines:
    traces:
      exporters: [otlp/tempo, meu_exporter]
```

- O SDK **já** emite: instrumentação automática + `PinoInstrumentation`.
  Só o que é novo precisa ser escrito.
- **O `resource` attribute** (`service.name`, `service.version`,
  `deployment.environment`) é o que distingue api de web no Grafana — sem
  `resource_to_telemetry_conversion`, **toda** métrica perde a label.
- **O sampling é do collector**, não do SDK: o SDK decide a **raiz**
  (`OTEL_TRACES_SAMPLER`), o collector decide o **trace**.

### 3.6 Integração externa

O padrão é o mesmo do resto:

- **port** no domínio (o que a aplicação precisa), **adapter** na
  infraestrutura (como ela chega lá);
- **timeout** no cliente — o do repo é 10 s de *fallback*, e o cliente real
  passa `defaultTimeoutMs` por operação (o logout usa 2 s)
  (`apps/web/lib/api-client.ts:119`), e a lição é que **sem** timeout, uma
  integração pendurada segura o pool;
- **entrada no modelo de ameaça** — a nova integração **é** uma fronteira
  nova (ver [`seguranca.md`](./seguranca.md) §1);
- **o segredo** vai para o ambiente, e a variável nova é declarada em
  [`docs/como-rodar.md` §2](../como-rodar.md).

---

## §4. Checklist de conformidade

12 itens. Cada um tem um **comando** que o confirma.

| # | Item | Como conferir |
|---|---|---|
| 1 | O módulo novo tem as 3 camadas — **ou** a exceção está escrita | `ls apps/api/src/modules/<bc>/` |
| 2 | `domain/` não importa framework | `grep -rn "@nestjs\|@prisma\|reflect-metadata" apps/api/src/modules/<bc>/domain/` → vazio |
| 3 | `application/` não importa `infrastructure/` (**em código de produção** — o teste pode, para ligar o adapter) | `grep -rn "infrastructure" apps/api/src/modules/<bc>/application/ --include="*.ts" \| grep -v '\.spec\.ts'` → vazio |
| 4 | A rota nova valida o body com Zod | `grep -n "ZodValidationPipe" apps/api/src/modules/<bc>/infrastructure/http/*.ts` |
| 5 | A rota nova declara `@ApiResponse` para cada código não-2xx | `grep -n "@ApiResponse" apps/api/src/modules/<bc>/infrastructure/http/*.ts` |
| 6 | **Toda** leitura nova abre o escopo | `grep -rn "comEscopo" apps/api/src/modules/<bc>/` |
| 7 | A escrita nova registra auditoria | `grep -rn "auditService\|AuditServicePort" apps/api/src/modules/<bc>/application/` |
| 8 | O fluxo novo tem spec e2e com o cabeçalho `// FLUXO:` | `grep -h "^// FLUXO:" apps/web/e2e/*.spec.ts` |
| 9 | A rota nova está no doc canônico do BC | `grep -n "<rota>" docs/api/<bc>.md` |
| 10 | Model novo ⇒ model + migration + doc do BC | `grep -n "^model " apps/api/prisma/schema.prisma` · `ls apps/api/prisma/migrations/` |
| 11 | Variável de ambiente nova ⇒ declarada no runbook e no example | `grep -n "VARIAVEL" docs/como-rodar.md` · `grep -n "VARIAVEL" apps/api/.env.example` |
| 12 | Feature flag nova ⇒ chave no **código** + linha no contrato | `grep -n "<chave>" apps/api/src/shared/auth/feature-flag-catalog.ts` · `grep -n "<chave>" docs/api/feature-flags.md` |

> **O item 6 é o que mais custa quando se esquece.** Uma leitura sem escopo
> **não dá erro**: ela lê **zero linhas**. O sintoma é "a lista está
> vazia", e a causa está a três arquivos de distância.

---

## §5. O que **não** se estende

As decisões abaixo são do `projeto-base`. Um app derivado **estende o
desenho**, não a decisão:

| Decisão | Por que não se estende |
|---|---|
| A **boundary** `domain`/`application`/`infrastructure` | mudar a boundary é mudar o paradigma — e o guardião (D11) existe |
| **Ports & Adapters** | a inversão de dependência é o que permite testar sem banco |
| O **escopo** como credencial + RLS | a alternativa (schema-per-tenant) é uma operação só, mas muda o custo por empresa |
| **JWT stateless** + refresh revogável | trocar isso é mexer em 3 ADRs |
| **OpenAPI versionado** + prefixo `/api/v1` | é o contrato que o frontend consome |
| **RFC 7807** como formato de erro | o frontend já faz parse dele |
| A **linguagem visual** dos diagramas | é o que faz dois diagramas de sistemas diferentes se lerem igual |

> Se o derivado precisar mudar uma delas, isso é **um ADR novo no
> derivado** — e o ADR-0010 **aponta** para ele, em vez de ser reescrito.

---

## Ver Também

- [`./README.md`](./README.md) — o índice e a linguagem visual.
- [`./modulo.md`](./modulo.md) — a anatomia de um módulo.
- [`./dados.md`](./dados.md) — o modelo de dados e o escopo.
- [`../../.agents/specs/templates/system-design.md`](../../.agents/specs/templates/system-design.md)
  — o formulário que o derivado copia.

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.0.0
