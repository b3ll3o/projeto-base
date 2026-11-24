# CHANGELOG

> Registro de versão do template, em **pt-BR**, no formato
> [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
>
> A versão corrente do template é **1.32.0**. O **fato** de cada versão é a
> tag correspondente no git — este arquivo é o **leitura** do que a tag
> contém, e a tag é a que se confere.

## [Unreleased]

### Adicionado

- Nada ainda — a próxima versão a ser fechada entra aqui.

### Corrigido

- Nada ainda — a próxima versão a ser fechada entra aqui.

### Quebras de compatibilidade

- Nada ainda — a próxima versão a ser fechada entra aqui.

## [1.32.0] — 2026-11-24

### Adicionado

- Nada ainda — a próxima versão a ser fechada entra aqui.

### Corrigido

- O script [`deps:major-scan`](./.tooling/scripts/ci/scan-dependency-majors.ts) lia o `dist-tags --json` como um objeto plano, e o `npm` 12 devolve uma **lista** de objetos: `tags.latest` dava `undefined`, TODOS os pacotes caíam em "sem consulta ao registro" e o arquivo versionado [`dependencias-major-disponiveis.json`](./.tooling/scripts/ci/dependencias-major-disponiveis.json) era escrito com `majors: {}` — o gate [`check-dependency-freshness`](./.tooling/scripts/ci/check-dependency-freshness.ts) ficava sem medição **sem acusar nada**. A normalização agora aceita as duas formas do registro.
- A família `@nestjs/*` subiu para a `12.5.1` (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-fastify` e `@nestjs/testing`, com o `core` em uma instância só — o precedente do #166) e o `react-hook-form` para a `7.92.0`. As release notes da 12.5.1 (2026-11-16) não têm breaking que afete o app: 1 feature aditiva, 4 bugfixes, graceful shutdown de microservices (o repo não usa) e docs. A `12.6.0` (2026-11-20) **não** entra aqui: ela traz "new defaults and behaviour changes" (o router do Fastify responde 400 a um alvo que não começa com `/`, o `logger: true` do módulo de teste deixou de desligar o log) e fica para um PR próprio, com o delta medido.
- O `deps:major-scan` media a major do registro pela tag `prev` **antes** da `latest`: MEDIDO 2026-11-24 (`npm view @prisma/client dist-tags --json`), o `@prisma/client` publica `latest: 7.10.1` (estável) e `prev: 6.19.3` (a estável que sobrou de um RC antigo) — o scan gravava major **6** e escondia a major 7 que existe. A ordem agora é `latest` → `prev` (o `prev` é o plano B para quando o `latest` é um RC, como o `prisma`, cujo `latest` é `8.0.0-rc.35`), e o registro foi regerado: a major 7 do `@prisma/client` entrou como **pendência declarada**, com dono e motivo — a mesma migração do `prisma` (`prisma.config.ts` + driver adapter + reescrita do client gerado).
- O gate `check-dependency-freshness` media a major sem conferir a **cobertura** da medição: o `semConsulta` do registro não era lido por NENHUM gate e um `majors: {}` passava verde — o gate ficava verde **sem medir nada** (a classe 5 do `guard-classes.md`). Agora ele reprova quando o registro foi escrito sem medição, quando há pacote sem consulta ao registro, quando um pacote **declarado** não está no registro (a medição está velha) e quando as contagens (`totalDeclaradas` do registro e o `total` das pendências) não batem com o dado.
- O `deps:major-scan` media a árvore do `process.cwd()`: rodar o script de outro diretório media o manifesto daquele diretório e gravava o arquivo versionado no lugar errado. A raiz agora vem do próprio script.

### Quebras de compatibilidade

- A família `@opentelemetry/*` subiu para a geração `core` 3.x no node (`@opentelemetry/sdk-node` `0.301.2`, `@opentelemetry/resources` `3.1.1`, `@opentelemetry/exporter-trace-otlp-http` `0.301.2`, `@opentelemetry/auto-instrumentations-node` `0.83.1`, `@opentelemetry/instrumentation-pino` `0.71.0`) e para a linha 2.x no browser (`@opentelemetry/sdk-trace-web` e `@opentelemetry/sdk-trace-base` `2.12.1`, `@opentelemetry/auto-instrumentations-web` `0.70.1`, `@opentelemetry/instrumentation-user-interaction` `0.69.1`, `@opentelemetry/instrumentation-document-load` `0.70.1`). Duas APIs mudaram no código: a classe `Resource` virou **interface** (a construção passou a ser `resourceFromAttributes()`) e o `provider.addSpanProcessor()` saiu do `WebTracerProvider` (o processor agora entra no construtor, em `spanProcessors`). O `NodeSDK` 0.301.2 também passou a criar o `MeterProvider` e o `LoggerProvider` por default (o 0.54.2 só criava se o app pedisse) e os dois exporters leem o `OTEL_EXPORTER_OTLP_ENDPOINT` como URL BASE — com o endpoint do repo apontando para `/v1/traces`, as métricas iam para `/v1/traces/v1/metrics` (MEDIDO 2026-11-23 num sink OTLP local: `POST /v1/traces/v1/metrics`, 7.528 bytes) e os logs para `/v1/traces/v1/logs`, dois paths que não existem. Os dois providers são desligados com `metricReaders: []` (o `MeterProvider` só é criado quando há reader) e `logRecordProcessors: []` (o `LoggerProvider` fica sem processor) — o resultado é o de antes do bump: só traces. O `engines.node` da raiz subiu de `>=22.12.0` para `^22.22.2 || ^24.15.0 || >=26.0.0` — o range real da árvore é o do `jsdom` 30.1.3, e o `>=22.22.2` sozinho prometia Node 23.x e 25.x, que a árvore **não** aceita (o `.npmrc` liga `engine-strict=true`); o `@opentelemetry/*` 3.x (`>=22.15.0`) fica abaixo dele. Os apps (`apps/api` e `apps/web`) passaram a declarar o mesmo range: o gate [`check-engines-consistency`](./.tooling/scripts/ci/check-engines-consistency.ts) compara a raiz com cada app, e nenhum app declarava `engines` — ele não media nada.
- O **browser** fica com duas gerações do `core` no bundle: o `sdk-trace-web` 2.12.1 traz o `core` 2.12.1 e a instrumentação (`auto-instrumentations-web` 0.70.1 → `instrumentation-user-interaction` 0.69.1) traz o `core` 3.1.1. Não há `sdk-trace-web` 3.x estável (`npm view @opentelemetry/sdk-trace-web dist-tags` → `latest: 2.12.0`, `canary: 3.0.0-development.0`), então a linha 2.x é a última disponível para o browser. As duas cópias do `core` não compartilham estado: o `context`/`trace`/`propagation` vêm do `@opentelemetry/api` (uma cópia só) e o `core` 3.x não exporta `context` — o que faz o conserto ter funcionado foi o `Resource` ser **estrutural** (as duas gerações têm os mesmos membros), MEDIDO com um span real saindo do browser. O peer de `@opentelemetry/api` (`<1.10.0` na linha 1.x e na 2.x do browser, contra o `^1.10.0` declarado) é **preexistente**: a árvore já tinha `sdk-trace-web` 1.30.1 com o mesmo peer, e o `core` 3.x do node exige `>=1.10.0 <1.11.0` — as duas gerações do browser não aceitam a mesma `api`.

## [1.31.0] — 2026-11-19

### Adicionado

- Agent [`e2e-specialist`](./.agents/agents/e2e-specialist.md): o dono do ciclo de cobertura e2e de fluxos de usuário. Antes de todo push que toque uma **tela** (`apps/web/app/**/page.tsx`) ou um **spec e2e** (`apps/web/e2e/**`) — os dois globs que a matriz roteia —, ele audita se toda tela da aplicação tem spec e2e que a atravessa; quando falta, monta o plano (com o `state_snapshot`), revisa o plano com outro agent, implementa o spec, roda `pnpm ci:local`, revisa o spec e commita/pusha na branch. A regra que ele executa é a convenção [`e2e-playwright`](./.agents/specs/conventions/e2e-playwright.md) — todo fluxo de usuário com tela tem spec e2e que atravessa o backend. O gate [`check-e2e-flow-coverage`](./.tooling/scripts/ci/check-e2e-flow-coverage.ts) mede a metade **declarativa** (paridade entre inventário, specs e `page.tsx`); o agent fecha a **semântica** (o spec afirma o efeito? a recusa está coberta com dado plantado? a semente é pela API?).
- Workflow [`e2e-coverage-mode`](./.agents/workflows/e2e-coverage-mode.md): o mesmo ciclo em formato de dispatch canônico ([`protocolos/dispatch.md`](./.agents/skills/agents-coordinate/protocolos/dispatch.md)), com revisão do plano **e** revisão do spec implementado.
- Roteamento: a matriz [`specialist-routing`](./.agents/specs/conventions/specialist-routing.md) v1.8 ganha 2 path_globs (`apps/web/e2e/**` + `apps/web/app/**/page.tsx`) e 1 demand_keyword; a matriz [`review-routing`](./.agents/specs/conventions/review-routing.md) v1.10 **soma** o `e2e-specialist` aos reviewers dos specs de fluxo (a matriz acumula: o spec e2e já ia ao `test-writer` por `**/*.spec.ts` e passa a ir também ao dono do inventário de fluxos).
- 3ª regra do gate [`check-version-footers`](./.tooling/scripts/ci/check-version-footers.ts): o **rodapé** de um dos seis footers de versão mudou desde a última tag e a versão **não** mudou. As duas regras anteriores medem o número (concordância entre os seis, e não-atrás-da-tag) — as duas passavam quando o rodapé muda e o número fica, que é a classe do rodapé que nomeava dois conteúdos. A janela medida é a do último release: um bump no meio da janela cobre a janela.

### Corrigido

- O rodapé do `README.md` passava a descrever **dois conteúdos com o mesmo rótulo de versão**: as contagens do disco foram re-medidas (48 agents · 50 memórias · 18 workflows) sem o número da versão acompanhar. Agora o rótulo da versão e as contagens andam juntos — a versão do documento sobe para 1.31.0.
- O script [`tooling:bump-version`](./tooling/scripts/bump-version.ts) escrevia **quatro** dos seis footers de versão: o `AGENTS.md` e o `README.md` ficavam de fora, e o bump produzia exatamente a divergência que o gate acusa — o mesmo defeito do #126, que o gate media só quatro. A lista agora é a do gate (`FOOTERS_DE_VERSAO`), importada de lá: uma lista só.
- A convenção [`post-merge-release`](./.agents/specs/conventions/post-merge-release.md) e o handoff do workflow [`release-mode`](./.agents/workflows/release-mode.md) diziam "3/4 arquivos versionados" — o gate mede **seis** desde a v1.15.0. O conjunto e o procedimento foram alinhados.
- A 3ª regra do `check-version-footers` media o **arquivo inteiro** em vez do **rodapé**: reprovava 25 de 72 commits do histórico — inclusive PRs já mergeados (#166 NestJS 12, #170 cards de empresa) cujo rodapé era byte-idêntico e cuja versão estava certa. O repositório muda prosa o tempo todo (PR de feature + PR de release separado), e a regra transformava TODO PR que tocasse um dos seis num PR de release. O que se compara agora é a linha do rótulo — que é o que o rótulo de versão nomeia. Há teste para o caso (prosa mudou, rodapé não → verde).
- O workflow [`release-template`](./.github/workflows/release-template.yml) validava **quatro** footers de versão enquanto o gate cobra **seis** desde a v1.15.0: uma divergência no `AGENTS.md` ou no `README.md` não abortava o release. Agora valida os seis.
- A convenção [`estrutura-e-versionamento`](./.agents/specs/conventions/estrutura-e-versionamento.md) não definia o tipo de bump para "o rodapé de um doc versionado mudou" — que é exatamente o caso que a 3ª regra cria. A regra é: patch.
- A 3ª regra do `check-version-footers` ancorava a comparação na **última tag**, e ficava **inerte** depois de um bump no meio da janela: o gate devolvia `[]` com o rodapé do `README.md` alterado e a versão já bumpeada — o rótulo nomeava DOIS conteúdos, e a regra existe justamente para isso. A âncora agora é o **commit que instalou a versão atual** (`git log -S`), e a janela medida é a que vai dele até agora. Há teste para o caso.
- O `check-version-footers` devolvia **verde mudo** fora de um repo git (ou num repo sem tag): as regras da tag não rodavam e o resultado era `{ok:true, errors:[]}` — verde por ausência. Agora declara a **ressalva** (`guard-classes.md`: quem não pode ser comparado é reclassificado, nunca apagado em silêncio).
- O advisory [`effect`](https://github.com/Effect-TS/effect/security/advisories/GHSA-7589-6fvf-x4pw) `1248071` (ReDoS em `Schema.TemplateLiteral`, CVE-2026-121707) entrou no registro do npm em 2026-11-19 e reprovava o gate de SCA de **qualquer** branch — inclusive da `main`. O `effect` está na árvore de produção de `apps/api` (transitivo do `@prisma/config`, que é o CLI do prisma — e o CLI roda no ENTRYPOINT do container). O conserto é um **override** para `effect@3.22.1` (a versão corrigida), não uma exceção: o pacote sai da árvore. MEDIDO: `pnpm audit --json` → 30 advisories, `effect` ausente; `prisma -v`, `prisma validate` e `prisma generate` verdes com o `effect@3.22.1`. (issue #181)

### Quebras de compatibilidade

- Nenhuma em runtime: nenhum endpoint, script, migration, tabela ou contrato de API mudou.

## [1.30.0] — 2026-11-18

### Adicionado

- Convenção [`kit-documentacao`](./.agents/specs/conventions/kit-documentacao.md): o **kit completo de documentação moderna** passa a ser obrigação do repo — 5 pilares, 14 itens, e para cada item **um doc canônico, um specialist dono e um auditor**. As contagens: `grep -cE '^### §2\.[0-9] Pilar ' .agents/specs/conventions/kit-documentacao.md` → **5**, e `grep -cE '^\| [0-9]+ \| ' .agents/specs/conventions/kit-documentacao.md` → **14**.
- Gate [`check-doc-kit`](./.tooling/scripts/ci/check-doc-kit.ts): mede a cobertura do kit — doc canônico presente, âncoras mínimas contidas, índice citando o doc, e specialist e auditor existentes em `.agents/agents/`.
- **14 specialists** de documentação, um por item do kit (`grep -E '^\| [0-9]+ \|' .agents/specs/conventions/kit-documentacao.md | grep -oE '[a-z0-9-]+-specialist' | sort -u | wc -l` → **14**): `readme-specialist`, `contributing-specialist`, `glossary-specialist`, `hld-specialist`, `c4-specialist`, `prd-specialist`, `tdr-specialist`, `adr-specialist`, `openapi-doc-specialist`, `asyncapi-specialist`, `erd-specialist`, `runbook-specialist`, `postmortem-specialist` e `changelog-specialist`.
- **5 auditadores**, um por pilar, cada um com a sua skill de processo (`grep -E '^\| [0-9]+ \|' .agents/specs/conventions/kit-documentacao.md | grep -oE '[a-z0-9-]+-docs-auditor' | sort -u | wc -l` → **5**): `onboarding-docs-auditor`, `architecture-docs-auditor`, `decision-docs-auditor`, `contract-docs-auditor` e `operations-docs-auditor`.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md): guia de convivência técnica — padrão de commits, fluxo de branches, code review, estilo de código, e onde a documentação do projeto vive.
- [`GLOSSARY.md`](./GLOSSARY.md): o vocabulário canônico do domínio — termo, definição e o caminho real onde ele aparece.
- [`CHANGELOG.md`](./CHANGELOG.md): este arquivo.
- [`docs/prd/0001-projeto-base.md`](./docs/prd/0001-projeto-base.md): o PRD do próprio template, com problema, objetivo de negócio, escopo e métricas de sucesso — indexado em [`docs/prd/README.md`](./docs/prd/README.md).
- [`docs/tdr/0001-system-design-canonico.md`](./docs/tdr/0001-system-design-canonico.md): o TDR que registra o raciocínio da mudança que introduziu o system design canônico — indexado em [`docs/tdr/README.md`](./docs/tdr/README.md).
- [`docs/post-mortems/README.md`](./docs/post-mortems/README.md): o formato do post-mortem blameless e a regra que proíbe nomear culpado.

### Corrigido

- [`docs/agents/domain.md`](./docs/agents/domain.md) afirmava que o `GLOSSARY.md` **não existia** e mandava "siga em silêncio" — com o glossário criado, esse texto virou uma mentira (doc que mente é defeito P0). Os parágrafos que falavam do glossário agora apontam para o arquivo.

### Quebras de compatibilidade

- Nenhuma em runtime: nenhum endpoint, script, migration, tabela ou contrato de API mudou.
- Uma mudança de comportamento, em [`docs/agents/domain.md`](./docs/agents/domain.md): a instrução "se `GLOSSARY.md` não existir, siga em silêncio" foi retirada, porque o arquivo passa a existir a partir desta versão.

## Histórico anterior a 1.32.0

O histórico **anterior** a esta versão não está neste arquivo — ele vive nas
**tags do git**, que são o registro datado do que foi feito em cada versão.

```bash
# o que entrou entre duas tags
git log --oneline v1.28.0..v1.29.0

# a lista de tags, da mais nova para a mais velha
git tag --list 'v*' --sort=-v:refname
```

A regra do repo é que **o fato tem UM dono**
([`dry.md`](./.agents/specs/conventions/dry.md)): o histórico é do git, e este
arquivo é a leitura por versão. Quem precisar do que aconteceu numa versão
antiga consulta a tag — e não um CHANGELOG reescrito à mão.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
