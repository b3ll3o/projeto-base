---
demand_slug: auditoria-de-seguranca
date: 2026-11-03
branch: fix/auditoria-de-seguranca
base_main_sha: 7a60a5a3c2988e37c24d28410ef1b45d218f20c9
---

# Plano — a auditoria de segurança e as 27 vulnerabilidades que ela mediu

> Base: `main` @ `7a60a5a` · Branch: `fix/auditoria-de-seguranca`
> Origem: pedido do usuário — rodar a auditoria de segurança (Cloudflare +
> superfície do repo), analisar os apontamentos, corrigir as vulnerabilidades.

## 0. O que está em jogo

A auditoria de dependências (`pnpm audit --json`, medido em 2026-11-03) achou
**89 advisories**: **4 críticas**, **23 altas**, 54 moderadas, 8 baixas. As 27
de severidade alta/crítica são as que este plano trata.

| # | Módulo | Sev | Advisory | Versão no lock | Corrigido em | Alcance real |
|---|---|---|---|---|---|---|
| 1 | `next` | **crítica** | 1242817 — RCE não autenticada na otimização de imagem com SVG | 15.5.25 | ≥15.5.28 | **produção** (`apps/web`) |
| 2 | `next` | alta | 1242819 — DoS no App Router via Server Actions | 15.5.25 | ≥15.5.28 | **produção** |
| 3 | `tinypool` | **crítica** | 1241260 — prototype pollution no `workerOptions` → RCE | 1.1.1 | ≥2.1.1 | dev (pool do vitest) |
| 4 | `tinypool` | **crítica** | 1241261 — prototype pollution no `run()` → RCE | 1.1.1 | ≥2.1.2 | dev (pool do vitest) |
| 5 | `vitest` | **crítica** | 1139528 — UI server permite ler e executar arquivo | 2.1.9 | ≥3.2.6 | dev (**o UI nunca roda** — §3) |
| 6 | `fastify` | alta | 1240641/2/3/4 — bypass de body, auth, validação e header | 5.11.3 | ≥5.12.2 | **produção** (`apps/api`) |
| 7 | `postcss` | alta | 1124252/1139510 — leitura arbitrária de arquivo e path traversal | 8.4.31 | ≥8.5.18 | build (via `next`) |
| 8 | `sharp` | alta | 1241331 — CVE-2026-96889 na librsvg | 0.35.4 | ≥0.35.5 | **produção** (via `next`) |
| 9 | `source-map-js` | alta | 1241209 — DoS de event-loop | 1.2.1 | ≥1.2.2 | build/dev |
| 10 | `undici` | alta | 1114638/40/1121245/1243112/2/4/6/7/9 — 9 advisories (DoS, TLS bypass, cache poisoning) | 5.29.0 e 8.11.2 | ≥8.12.2 | dev (jsdom + testcontainers) |
| 11 | `@fastify/busboy` | alta | 1240982 — DoS por header de multipart com nome de prototype | 2.1.1 | ≥3.2.1 | dev (via `undici` 5) |
| 12 | `deepmerge-ts` | alta | 1145093 — stack exhaustion ao mesclar grafos recursivos | 7.1.5 | ≥8.0.0 | CLI do prisma (build/migrate) |
| 13 | `@opentelemetry/propagator-jaeger` | alta | 1124011 — DoS por header malformado | 1.27.0 | ≥2.9.0 | **produção** (telemetria) |
| 14 | `vite` | alta | 1242658 — bypass de `fs.existsSync()` no `launch-editor` | 5.4.21 | ≥6.4.4 | dev (**só Windows** — §3) |
| 15 | `zod` | alta | 1243066 — exaustão de memória em coleções constritas | 3.25.76 | ≥4.6.6 | produção (**o repo não usa `z.array`** — §3) |

Além das advisories, a mesma auditoria mediu **3 lacunas de configuração** que
não são dependência:

| # | Lacuna | Onde | Medido |
|---|---|---|---|
| C1 | o web **não tem CSP** (nem HSTS, nem `X-Frame-Options` na borda) | `apps/web/next.config.mjs` — só 2 headers em 3 rotas | `grep -rn 'Content-Security-Policy' apps/web` → 0 |
| C2 | as actions do CI são pinadas por **tag**, não por SHA | `.github/workflows/*.yml` — `actions/checkout@v4` etc. | 21 call-sites em 4 workflows |
| C3 | **nenhum instrumento** mede advisories de dependência | `.tooling/scripts/ci/` — 40 gates, nenhum de auditoria de dependência | a lista |

**O que NÃO está em jogo:** as 62 advisories moderadas e as 8 baixas (todas em
transitivas de dev), e a dimensão Cloudflare da conta — que depende de uma
autorização que o usuário ainda não concluiu (§3).

## 1. Gap analysis AS-IS → TO-BE

### O que JÁ EXISTE (não reconstruir)

- **`@fastify/helmet` com CSP estrita na API** (`apps/api/src/main.ts:51`) —
  `scriptSrc: ["'none'"]`, `frameAncestors: ["'none'"]`. A API é JSON; a CSP
  do web é outro problema (§C1) e não reaproveita a mesma configuração.
- **`check-dockerfile-hardening`** — non-root, read-only, cap-drop ✓.
- **`check-shell-injection`** — a AST que impede `execSync` com comando
  interpolado ✓ (o #117).
- **RLS com `app_runtime`/`app_system`** (o #118) e o guard de segredo de
  serviço que recusa placeholder e baixa entropia (o #120).
- **`check-doc-claims`** — o padrão do repo de *claim medida + gate que
  remede*. O `check-dependency-audit` segue o espírito (a lista de exceções é
  versionada e cada exceção carrega a verificação que a mantém), mas a
  medição é **ao vivo**: `pnpm audit --json`. Uma baseline versionada só
  checaria a lista contra o lockfile — não veria uma advisory nova.

### O que FALTA

| Lacuna | Falta | Tamanho |
|---|---|---|
| 1, 2, 6, 8, 13 | as dependências de **produção** acima da versão corrigida | médio |
| 3, 4, 7, 9, 10, 11, 12 | as transitivas que nenhum release upstream fixa | **pequeno** (8 overrides) |
| 5, 14, 15 | três advisories cujo **alcance real é medido** e não se aplica | pequeno (exceção declarada) |
| C3 | o **instrumento** que mede advisories e falha quando uma nova aparece | médio |
| C1 | CSP + headers de segurança no web | médio |
| C2 | pin por SHA das actions do CI | pequeno |

## 2. As etapas

### S1 — O instrumento: `check-dependency-audit`

O gate **roda `pnpm audit --json`** e falha quando há advisory crítica ou alta
que não esteja na lista de exceções.

- **A lista de exceções** é versionada (`.tooling/scripts/ci/excecoes-de-dependencias.json`),
  e cada exceção carrega **o motivo medido** e **a verificação que prova que o
  motivo continua valendo** (um comando que tem de sair 0). A exceção do
  `vitest` diz "o UI server nunca é iniciado" e a verificação é um `grep` que
  falha se alguém passar a rodar `--ui`.
- A severidade que reprova é declarada no gate; moderada e baixa **não**
  reprovam (elas travariam o repo por advisories que não são exploráveis).
- O gate **declara o skip** quando a rede não responde — em silêncio seria
  pior que falhar.

### S2 — As correções de produção

`next` para ≥15.5.28 (o range `^15.0.0` já permite; é o lockfile) e as 8
**overrides** do `pnpm` para as transitivas que nenhum upstream fixa:

```json
"pnpm": { "overrides": {
  "fastify": "^5.12.8", "postcss": "^8.5.32", "sharp": "^0.35.5",
  "source-map-js": "^1.2.2", "tinypool": "^2.1.2", "undici": "^8.12.3",
  "deepmerge-ts": "^8.0.2"
} }
```

São **7**, não 8: o `@opentelemetry/propagator-jaeger` saiu na revisão (§6) —
a versão corrigida (2.9.0+) está **deprecada** no upstream, e a exposição do
advisory é nula (o propagator Jaeger não é registrado).

Cada override é **medido**: a suíte inteira + `pnpm ci:boot` + o `otelcol-audit`
(telemetria) + as migrations (prisma). Um override que quebra algo **não
entra** — e o plano diz o que fazer nesse caso (§4).

### S3 — As quatro exceções medidas

| Exceção | Motivo medido | Verificação que a mantém |
|---|---|---|
| `vitest` 1139528 | o advisory é do **UI server**; o repo roda `vitest run` e **nunca** `--ui` | ausência de `--ui` nos scripts, workflows e fontes |
| `vite` 1242658 | o bypass é do `launch-editor`, que só age no **servidor de dev** e **só no Windows**; o CI é Linux e o build não sobe dev server | ausência de `(vite\|next) dev` nos **workflows** |
| `zod` 1243066 | o advisory é de **coleções constritas**; o repo **não usa** `z.array` nem `z.tuple` (grep: 0 ocorrências fora de spec) | ausência de `z.array(`/`z.tuple(` nas fontes |
| `@opentelemetry/propagator-jaeger` 1124011 | o DoS é no parser do header `uber-trace-id`; a propagação **W3C é o default** do NodeSDK e o repo **não registra** o propagator Jaeger | ausência de `JaegerPropagator` no código |

### S4 — C1: a CSP do web

`next.config.mjs` ganha CSP por **nonce** (o padrão do Next.js: o middleware
gera o nonce por requisição e o Next o aplica nos scripts inline), mais
`Strict-Transport-Security`, `X-Content-Type-Options` e `frame-ancestors`.
`'unsafe-inline'` não entra sem um plano de remoção escrito.

### S5 — C2: as actions do CI pinadas por SHA

As 14 actions passam de `@v4` para o SHA do commit, com o comentário da tag
ao lado (o padrão do GitHub para actions de terceiros). Um gate novo impede a
volta da tag.

### S6 — A Cloudflare (bloqueado, com o caminho pronto)

A dimensão da borda (WAF, rate limiting na edge, TLS, DNSSEC, tokens de API,
2FA dos membros, log de auditoria) **depende da autorização do conector
Cloudflare**, que o usuário ainda não concluiu. O que este PR entrega dela é o
**runbook** com a lista de verificação e o lugar de colar a evidência — e o
plano marca a etapa como **pendente**, não como feita.

## 3. O que NÃO está em jogo, e por quê

- **A dimensão Cloudflare da conta**: o conector `cloudflare_mcp` está
  `pending` — a autorização exige o navegador do usuário. Nenhuma medição de
  borda foi feita, e nada aqui afirma que a borda está boa ou ruim.
- **`zod` 3 → 4**: o advisory só atinge coleções constritas, e o repo não
  tem nenhuma (§S3). Uma major de 1400+ testes por um advisory inaplicável é
  risco sem retorno — e o caminho de upgrade fica registrado, não feito.
- **`vitest` 2 → 3**: a major do toolchain de teste inteira por um advisory
  cujo gatilho (o UI server) o repo não usa. A `tinypool`, que **é** explorável
  no pool normal, sai pelo override.
- **As 62 advisories moderadas/baixas**: nenhuma é explorável no caminho de
  produção medido; e reprovar por elas travaria o repo sem ganho.

## 4. Riscos

| Risco | Como se mede | O que o plano faz |
|---|---|---|
| o override do `tinypool` 1 → 2 quebrar o vitest 2 | a suíte inteira | se quebrar: o override sai e a exceção do `tinypool` é declarada com a versão 1.1.1 e a exposição medida |
| o override do `undici` 5 → 8 quebrar o testcontainers | as specs de integração (testcontainers real) | idem |
| o override do `propagator-jaeger` 1 → 2 quebrar a telemetria | `otelcol-audit` + `ci:boot` + tracing | idem |
| o override do `deepmerge-ts` 7 → 8 quebrar o CLI do prisma | `prisma migrate` + `generate` | idem |
| a CSP do web quebrar a hidratação | `ci:boot` + e2e do web | sem nonce funcional, a CSP não entra |
| o gate de auditoria ficar **verde sem medir** (rede fora) | o gate declara o skip | o skip é visível no painel do preflight |

## 5. Aceite

1. `pnpm audit --json` não tem **nenhuma** advisory crítica ou alta fora da
   lista de exceções — e a lista tem no máximo 3 entradas, cada uma com a
   verificação que a mantém.
2. `pnpm ci:preflight` → **0 erro**, com o gate novo no painel.
3. A suíte inteira verde, `pnpm ci:boot` com a API e o web no ar, e as
   migrations do prisma aplicadas do zero.
4. A CSP do web servida com nonce e sem `unsafe-inline`; o e2e passa.
5. As actions do CI pinadas por SHA, com gate que impede a volta da tag.
6. O relatório da auditoria versionado em `.agents/runs/`, com o comando que
   reproduz cada número.

## 6. A revisão do plano (medida, 2026-11-03)

O plano foi revisado contra o repo real, antes de implementar. O que mudou:

| # | O que o plano dizia | O que a medição mostrou | Correção |
|---|---|---|---|
| R1 | o gate "não fala com a rede" (baseline versionada) | uma baseline só checaria a lista contra o lockfile — **não veria uma advisory nova** | o gate mede **ao vivo** (`pnpm audit --json`); a lista de exceções é que é versionada |
| R2 | 8 overrides | o `@opentelemetry/propagator-jaeger` **não precisa**: a propagação W3C é o default do NodeSDK e o repo não registra o propagator Jaeger (exposição nula). E a versão corrigida (2.9.0+) está **deprecada** no upstream | o override saiu; a advisory virou exceção com verificação |
| R3 | 3 exceções | são **4** (o `propagator-jaeger` entrou) | tabela do §3 corrigida |
| R4 | "60 gates", "14 call-sites", "1400+ testes" | **40** gates, **21** call-sites em 4 workflows, **2.296** testes | números corrigidos |

### O que o plano previu e deu errado

| Risco previsto | O que aconteceu |
|---|---|
| o override do `tinypool` 1 → 2 quebrar o vitest 2 | **não**: 1.461 testes unitários verdes |
| o override do `undici` 5 → 8 quebrar o testcontainers | **não**: 158 testes de integração verdes (com Postgres real) |
| o override do `propagator-jaeger` 1 → 2 quebrar a telemetria | **não aconteceu** — e a override saiu de vez, pela depreciação |
| o override do `deepmerge-ts` 7 → 8 quebrar o CLI do prisma | **não**: `prisma generate` e as migrations ok |
| a CSP do web quebrar a hidratação | **não**: os 14 scripts do HTML têm o nonce, e o e2e passou (59 testes) |

### O que a implementação encontrou que o plano não previu

1. **O `pnpm audit` sai com código 1 quando acha advisory.** O `execFileSync`
   joga o JSON da medição dentro da exceção — e o primeiro teste do gate no
   repo real disse *"a auditoria NÃO RODOU"* com 4 advisories encontradas.
   Hoje há regressão presa na spec.
2. **A exceção do `vite` estava mal escrita**: o padrão `(vite|next) dev`
   casava com o script `dev` do `apps/web` (que é legítimo — dev local). O
   próprio gate acusou; a verificação passou a ser sobre os **workflows**.
3. **A CSP não pode ser montada no `next.config.mjs`**: o `next/headers` é
   importável no escopo da requisição, mas **não** no build — e o build é
   onde o config é avaliado. A CSP foi para o **middleware**, que já tinha o
   nonce; e o middleware roda no runtime **edge**, onde `Buffer` não existe
   (o nonce é `btoa(crypto.randomUUID())`).

### O que o plano deixou de fazer (e por quê)

- **A dimensão Cloudflare**: o conector segue `pending` (a autorização exige
  o navegador do usuário). Nenhuma medição de borda foi feita, e o plano
  marca a etapa como **pendente** — com o runbook pronto, não com um
  veredito inventado.
