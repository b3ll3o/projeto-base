---
name: plano-atualizacao-de-dependencias-prs-abertos
description: "Os 5 PRs abertos do Dependabot são analisados um a um contra a árvore real, e só três Updates são possíveis sem migração: a família NestJS (12.4.0 → 12.5.1, com o core em uma instância só), o react-hook-form (7.91.0 → 7.92.0) e a família OpenTelemetry (que sobe para a geração `core` 3.x no node e 2.x no browser — o `sdk-node` 0.301.2 e o `instrumentation-user-interaction` 0.69.1 do Dependabot, com a API do `Resource` e do `addSpanProcessor` migrada no código). O `prisma` 6 → 7 fica de fora: é migração de schema (`prisma.config.ts` + driver adapter), não bump. Um PR só leva as três atualizações; os 5 PRs do Dependabot são fechados."
version: 1.0.0
updated: 2026-11-23
status: executado
state_snapshot: .agents/runs/state-snapshot-20261123T203015Z.md
---

# Plano — as atualizações de dependência que os PRs abertos pedem

> **Demand:** *"analise todos os PRs abertos, analise se as atualizações podem ser
> feitas sem que criem erros, crie um plano para implementar as atualizações que
> são possíveis, revise o plano e corrija os erros, execute o plano, commit, push,
> abra um PR com todas as atualizações e feche os outros PRs"*.
>
> **Snapshot de estado:**
> [`.agents/runs/state-snapshot-20261123T203015Z.md`](../../../.agents/runs/state-snapshot-20261123T203015Z.md)
> (`proceed: true`).
>
> **Composição do despacho:** camada 0 = `state-aware-planning` (thread principal) ·
> camada 1 = três specialists em **paralelo** (família OpenTelemetry, migração do
> Prisma 7, família NestJS + react-hook-form) · camada 2 = execução e medição no
> thread principal.

## 1. O que a medição encontrou

### 1.1 Os 5 PRs abertos

| PR | Pacote | De → Para | Veredito |
|---|---|---|---|
| [#174](https://github.com/b3ll3o/projeto-base/pull/174) | `@nestjs/common` | 12.4.0 → 12.5.1 | **ENTRA** — com a família inteira |
| [#175](https://github.com/b3ll3o/projeto-base/pull/175) | `react-hook-form` | 7.91.0 → 7.92.0 | **ENTRA** |
| [#173](https://github.com/b3ll3o/projeto-base/pull/173) | `@opentelemetry/instrumentation-user-interaction` | 0.43.0 → 0.69.1 | **ENTRA** — com a família inteira |
| [#177](https://github.com/b3ll3o/projeto-base/pull/177) | `@opentelemetry/sdk-node` | 0.54.2 → 0.301.2 | **ENTRA** — com a família inteira |
| [#176](https://github.com/b3ll3o/projeto-base/pull/176) | `prisma` | 6.19.3 → 7.10.1 | **FORA** — é migração, não bump |

### 1.2 Por que os 4 PRs "bons" reprovavam no CI

MEDIDO no log do `preflight` (job 137603595063, run 45148489887):

```
advisory high em effect (1248071): Effect: ReDoS in Schema.TemplateLiteral compiled regex.
Corrigida em >=3.22.1 — versões afetadas: (não medidas). Não há exceção declarada para ela
em .tooling/scripts/ci/excecoes-de-dependencias.json.
```

Não é o bump que reprova: os 4 PRs foram abertos sobre uma `main` **anterior** ao
conserto do advisory do `effect` (CVE-2026-121707, PR #181) e **revertem** o
`override` de `effect@3.22.1` junto com a medição de
`.tooling/scripts/ci/excecoes-de-dependencias.json` (`medidoEm` volta de 2026-11-23
para 2026-11-18). Por isso as atualizações são aplicadas **em cima da `main` atual**,
e não mesclando os PRs do Dependabot.

### 1.3 O `prisma` 6 → 7 é outra coisa

MEDIDO no log do job 137604323520 (run 45148706372):

```
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: The datasource property `url` is no longer supported in schema files.
  Move connection URLs for Migrate to `prisma.config.ts` and pass either `adapter` ...
error: The datasource property `directUrl` is no longer supported in schema files.
```

O schema do repo declara as DUAS propriedades (`apps/api/prisma/schema.prisma:17-18`).
O Prisma 7 exige `prisma.config.ts` + driver adapter + reescrita do client gerado —
é migração de schema, e a dívida já está **declarada** com dono e motivo em
`.tooling/scripts/ci/dependencias-major-pendentes.json` (`prisma`, 6 → 7). Fecha-se
o PR sem subir a major.

### 1.4 A família NestJS: um só sobe não pode

O precedente é o commit `ca4b5946` (*"o NestJS 12 na família inteira, com o core em
uma instância só"*): subir o `common` e deixar o `core` atrás deixa duas majors do
framework e o peer violado. As versões 12.5.1 existem para `common`, `core`,
`platform-fastify` e `testing`; `swagger` (12.1.2), `config` (12.1.1), `jwt` (12.0.4)
e `throttler` (6.8.0) não têm linha 12.5.x, e **nenhum** deles precisa: os peers
declarados aceitam `@nestjs/core` `^12.0.0` (`npm view @nestjs/swagger@12.1.2
peerDependencies` → `'@nestjs/core': '^12.0.0'`).

As release notes da 12.5.1 (2026-11-16) não têm breaking que afete o app: 1 feature
aditiva (`core`), 4 bugfixes (entre eles o `parse date pipe`), graceful shutdown de
microservices (o repo não usa) e docs.

> **Fora do escopo, por decisão:** a 12.6.0 (2026-11-20) é a última da família e
> **não** entra aqui. Ela traz "new defaults and behaviour changes" (o router do
> Fastify responde 400 a um alvo que não começa com `/`, o `logger: true` do módulo
> de teste deixou de desligar o log, o `@Res()` sobrescrevendo um
> `@Res({passthrough:true})` mudou de semântica). O bump é do PR sob revisão —
> 12.5.1 — e a 12.6.0 fica para um PR próprio, com o delta medido.

### 1.5 A família OpenTelemetry: não há PR por PR

MEDIDO no registro: `@opentelemetry/sdk-node@0.301.2` exige `core` 3.1.1 +
`resources` 3.1.1, e `@opentelemetry/instrumentation-user-interaction@0.69.1` exige
`core` ^3.0.0. O bump de um pacote só deixa **duas gerações do `core`** na mesma
árvore — e, pior, o typecheck quebra: `Resource` deixou de ser classe no `resources`
3.x (virou interface; a construção passou a ser `resourceFromAttributes()`) e o
`sdk-trace-web` 2.x tirou o `provider.addSpanProcessor()` de cena.

Não existe uma geração única para a família inteira: o **node** tem `sdk-node`
0.301.2 (`core` 3.1.1), mas o **browser** não tem `sdk-trace-web` 3.x estável
(`npm view @opentelemetry/sdk-trace-web dist-tags` → `latest: 2.12.0`,
`latest-2: 2.12.1`, `canary: 3.0.0-development.0`). O alvo coerente é, portanto,
**node em `core` 3.1.1 + browser na última linha estável (`core` 2.12.1)** — e o
browser carrega a instrumentação `core` 3.x, que MEDIDO funciona em runtime e em
tipo (a interface `Resource` das duas gerações tem os mesmos membros).

## 2. O que o PR único leva

### 2.1 Dependências

| app | pacote | de | para |
|---|---|---|---|
| api | `@nestjs/common` | `^12.4.0` | `^12.5.1` |
| api | `@nestjs/core` | `^12.4.0` | `^12.5.1` |
| api | `@nestjs/platform-fastify` | `^12.4.0` | `^12.5.1` |
| api | `@nestjs/testing` (dev) | `^12.4.0` | `^12.5.1` |
| web | `react-hook-form` | `^7.91.0` | `^7.92.0` |
| api + web | `@opentelemetry/sdk-node` | `^0.54.2` | `^0.301.2` |
| api + web | `@opentelemetry/exporter-trace-otlp-http` | `^0.54.2` | `^0.301.2` |
| api + web | `@opentelemetry/resources` | `^1.30.1` | `^3.1.1` |
| api + web | `@opentelemetry/auto-instrumentations-node` | `^0.52.1` | `^0.83.1` |
| api | `@opentelemetry/instrumentation-pino` | `^0.68.0` | `^0.71.0` |
| web | `@opentelemetry/sdk-trace-web` | `^1.30.1` | `^2.12.1` |
| web | `@opentelemetry/sdk-trace-base` | `^1.30.1` | `^2.12.1` |
| web | `@opentelemetry/auto-instrumentations-web` | `^0.43.0` | `^0.70.1` |
| web | `@opentelemetry/instrumentation-user-interaction` | `^0.43.0` | `^0.69.1` |
| web | `@opentelemetry/instrumentation-document-load` | `^0.43.0` | `^0.70.1` |
| web | `@opentelemetry/instrumentation-fetch` | `^0.54.2` | `^0.301.2` |
| raiz | `engines.node` | `>=22.12.0` | `>=22.22.2` |

O piso do Node sobe porque o `.npmrc` do repo liga `engine-strict=true` e o
piso **real** da árvore é o do `jsdom` 30.1.3 (`^22.22.2 || ^24.15.0 || >=26.0.0`),
que já estava no repo antes deste PR — o `engines.node` declarado (`>=22.12.0`)
mentia. O `@opentelemetry/*` 3.x (`>=22.15.0`) fica ABAIXO dele: quem mandava no
piso era o `jsdom`. MEDIDO: `npm view jsdom@30.1.3 engines.node` →
`^22.22.2 || ^24.15.0 || >=26.0.0`.

### 2.2 Código

| arquivo | mudança |
|---|---|
| `apps/api/src/shared/infrastructure/telemetry/resource.ts` | `new Resource({...})` → `resourceFromAttributes({...})`, mesclado com `defaultResource()` |
| `apps/web/instrumentation.node.ts` | idem |
| `apps/web/instrumentation-client.ts` | idem + `provider.addSpanProcessor(...)` → `spanProcessors: [...]` no construtor |
| `apps/api/src/shared/infrastructure/telemetry/tracing.ts` | `metricReaders: []` e `logRecordProcessors: []` |
| `apps/web/instrumentation.node.ts` | idem |

O `defaultResource()` entra na mescla porque a classe 1.x injetava `telemetry.sdk.*`
sozinha e a função 3.x não: sem a mescla, o painel perde o nome e a versão do SDK.

`metricReaders: []` e `logRecordProcessors: []` são o conserto de uma **regressão
que o bump trouxe**: o `NodeSDK` 0.301.2 cria o `MeterProvider` e o `LoggerProvider`
por default, e os dois exporters leem o `OTEL_EXPORTER_OTLP_ENDPOINT` como URL BASE
— com o endpoint do repo apontando para `/v1/traces`, as métricas iam para
`/v1/traces/v1/metrics` e os logs para `/v1/traces/v1/logs`. MEDIDO 2026-11-23 num
sink OTLP local: `POST /v1/traces/v1/metrics` (7.528 bytes) e, com os dois
providers vazios, **nenhum** request novo.

### 2.3 Specs

| arquivo | mudança |
|---|---|
| `apps/web/instrumentation.node.spec.ts` | o mock de `@opentelemetry/resources` passa a expor `resourceFromAttributes` e `defaultResource` |
| `apps/web/instrumentation-client.spec.ts` | idem + o provider passa a ser capturado no construtor (o `addSpanProcessor` não existe mais) |

A **intenção** de cada teste é a mesma: "a telemetria nunca derruba a aplicação", "o
SDK sobe UMA vez", "os atributos de recurso saem das variáveis de ambiente",
"existe um `BatchSpanProcessor` ligado ao provider".

### 2.4 Instrumentos e registros que a mudança obriga

| arquivo | mudança |
|---|---|
| `.tooling/scripts/ci/dependencias-major-pendentes.json` | as 3 pendências do OpenTelemetry saem (a major **subiu de verdade**); entra a do `@testing-library/jest-dom` (7 → 8), medida hoje; `total` 18 → 16 |
| `.tooling/scripts/ci/dependencias-major-disponiveis.json` | regerado por `pnpm deps:major-scan` |
| `.tooling/scripts/ci/excecoes-de-dependencias.json` | a claim do audit é re-medida: 30 → **18** advisories (o total caiu porque a árvore 1.x do OTel carregava 12 moderadas que a árvore nova não traz) |
| `.tooling/scripts/ci/scan-dependency-majors.ts` | conserto: o `npm` 12 devolve `dist-tags --json` como **lista**, e o script lia objeto plano — o arquivo era escrito com `majors: {}` e o gate perdia a medição **sem acusar nada** |
| `docs/STACK.md` | as versões declaradas (`node` ≥ 22.15.0, `platform-fastify` ^12.5.1, OpenTelemetry ^0.301.2, `react-hook-form` ^7.92.0) |
| `docs/como-rodar.md` | o piso do Node na linha de requisitos |
| `CHANGELOG.md` | a entrada em **Quebras de compatibilidade** (as 2 APIs que mudaram + o `engines.node`) |

## 3. A prova

Cada afirmação deste plano tem o comando que a reproduz:

```bash
pnpm install                                              # lockfile novo, peer saneado no node
pnpm turbo run typecheck --filter=@projeto/api --filter=@projeto/web
pnpm --filter @projeto/api test:unit                     # 1189 testes
pnpm --filter @projeto/web test:unit                     # 520 testes
pnpm ci:preflight                                         # inclui freshness, drift e audit
pnpm ci:local                                             # a suíte inteira, incluindo e2e e boot
```

Prova de que o SDK novo **exporta** — e de que o **browser** exporta (não é só
"não quebrou"): o bundle do cliente sobe num Chromium de verdade (Playwright), com
o endpoint do client apontando para um sink OTLP local, e o span chega com o
recurso que a mescla promete:

```
$ node apps/web/<script de browser check>.mjs   # Playwright: abre /login, espera o batch de 5s
ERROS DE CONSOLE: nenhum
REQUEST POST /v1/traces bytes= 22536 ua= Mozilla/5.0 (X11; Linux x86_64) ...
$ head -c 400 /tmp/last-span-body.txt
{"resourceSpans":[{"resource":{"attributes":[
  {"key":"service.name","value":{"stringValue":"projeto-base-web"}},
  {"key":"telemetry.sdk.language","value":{"stringValue":"webjs"}},
  {"key":"telemetry.sdk.name","value":{"stringValue":"opentelemetry"}},
  {"key":"telemetry.sdk.version","value":{"stringValue":"3.1.1"}}]}, ...
  {"scope":{"name":"@opentelemetry/instrumentation-document-load","version":"0.70.1"} ...
```

O `telemetry.sdk.*` no recurso é a prova de que a mescla com `defaultResource()`
funciona, e o scope `instrumentation-document-load` 0.70.1 é a prova de que o
**mix do browser** (provider `core` 2.12.1 + instrumentação `core` 3.x) emite
span num browser de verdade.

Prova de que o SDK novo **exporta** (não é só "não quebrou"):

```bash
# span manual pelo sdk-node 0.301.2 → collector → Tempo
curl -s -X POST http://localhost:4318/v1/traces -H 'Content-Type: application/json' -d '{...}'
docker exec projeto-base-tempo wget -q -O- 'http://localhost:3200/api/search?tags=service.name%3Dprobe-node'
```

## 4. O que fica de fora (e por quê)

| item | por quê |
|---|---|
| `prisma` 6 → 7 (#176) | migração de schema (`prisma.config.ts` + driver adapter + reescrita do client); a major já está declarada como pendência, com dono e motivo |
| `@nestjs/*` 12.6.0 | "new defaults and behaviour changes" que o PR sob revisão não traz; bump próprio, com o delta medido |
| `@testing-library/jest-dom` 8 | declara peer `vitest >=5 <6` — exige o vitest 5, que é a major do runner (já declarada) |
| majors de `next`, `eslint`, `typescript`, `zod`, `vitest`, `web-vitals` | as 16 pendências que continuam na tabela, cada uma com dono e motivo |

## 5. Fechamento

Um PR só, com as três atualizações. Os 5 PRs do Dependabot são fechados com o
motivo medido — e o #176 ganha a pendência como dívida declarada, não como PR morto.
