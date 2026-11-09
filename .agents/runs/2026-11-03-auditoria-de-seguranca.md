# Auditoria de segurança — 2026-11-03

> Branch: `fix/auditoria-de-seguranca` · Base: `main` @ `7a60a5a`
> Origem: pedido do usuário — rodar a auditoria de segurança, analisar os
> apontamentos e corrigir as vulnerabilidades.
> Método: **medir antes de afirmar**. Todo número abaixo saiu de um comando
> neste repositório, e a data está no texto.

## O que foi rodado

| Auditoria | Comando | Resultado |
|---|---|---|
| Dependências | `pnpm audit --json` | **89 advisories**: 4 críticas, 23 altas, 54 moderadas, 8 baixas |
| Cabeçalhos de segurança (web) | `grep -rn 'Content-Security-Policy' apps/web` | **0** — o web não tinha CSP |
| Cabeçalhos de segurança (API) | `apps/api/src/main.ts:51` | `@fastify/helmet` com CSP estrita ✓ |
| Segredos no versionado | `git grep -nIE '(api[_-]?key|secret\|password\|token)\s*[:=]\s*["\x27][A-Za-z0-9_\-]{16,}'` | **0** ✓ |
| Pin das actions do CI | `grep -rn 'uses:' .github/workflows/*.yml` | **21 call-sites, todos por TAG** |
| Instrumentos | `ls .tooling/scripts/ci/check-*.ts` | **40 gates** — nenhum media advisory de dependência |
| Cloudflare (borda/conta) | conector `cloudflare_mcp` | **MEDIDA PARCIAL (2026-11-03)** — a autorização foi feita, mas o conector só expõe **documentação + spec OpenAPI**, sem execução da API da conta. Nenhuma medição do estado real da conta; a baseline oficial e o checklist de verificação ficaram em [`docs/runbooks/cloudflare-edge.md`](../../docs/runbooks/cloudflare-edge.md) |

## O que foi corrigido

### A. As dependências

`pnpm audit --json` depois das correções: **43 advisories**, das quais **1
crítica e 3 altas** — as quatro com exposição medida e nula (as exceções
abaixo).

**O bump que fecha a crítica de produção**: `next` de 15.5.25 para **15.5.28**.
O advisory 1242817 é uma **RCE não autenticada** na otimização de imagem com
SVG (o `next/image` processa o SVG do atacante); o 1242819 é um DoS no App
Router via Server Actions. O range `^15.0.0` já permitia — era o lockfile.

**As 7 overrides** (`pnpm.overrides` no `package.json` raiz) para as
transitivas que **nenhum release upstream conserta**:

| Override | Por que o upstream não resolve |
|---|---|
| `fastify@^5.12.8` | o `@nestjs/platform-fastify@11.2.8` **pina** `5.11.3` exato; só o nestjs 12 (major) traz o corrigido |
| `postcss@^8.5.32` | o `next@15.5.28` **continua** pinando `8.4.31` exato |
| `sharp@^0.35.5` | transitiva do `next` |
| `source-map-js@^1.2.2` | transitiva do `postcss`/`css-tree` |
| `tinypool@^2.1.2` | o `vitest@3.2.7` **continua** pedindo `^1.1.1` |
| `undici@^8.12.3` | o `testcontainers` pede `^5.29.0`; 9 advisories afetam a linha 5 |
| `deepmerge-ts@^8.0.2` | o `@prisma/config@6.19.3` **pina** `7.1.5` exato |

### B. As 4 exceções, cada uma com a verificação que a mantém

A lista é versionada em `.tooling/scripts/ci/excecoes-de-dependencias.json`.
Cada exceção declara o **motivo medido** e a **verificação que prova que o
motivo continua valendo** — o gate roda a verificação, e se ela parar de
valer, a exceção é reprovada.

| Advisory | Exposição | Verificação |
|---|---|---|
| `vitest` 1139528 (crítica) | o advisory é do **UI server** (`--ui`); o repo roda `vitest run` e nunca `--ui` | `ausência de --ui` nos scripts, workflows e fontes |
| `vite` 1242658 (alta) | o bypass é do `launch-editor`, que só age no **servidor de dev** e **só no Windows**; o CI é Linux e o build não sobe dev server | `ausência de (vite\|next) dev` nos workflows |
| `zod` 1243066 (alta) | o advisory é de exaustão em **coleções constritas**; o repo **não usa** `z.array` nem `z.tuple` (grep: 0 fora de spec) | `ausência de z.array(\|z.tuple(` nas fontes |
| `@opentelemetry/propagator-jaeger` 1124011 (alta) | o DoS é no parser do header `uber-trace-id`; a propagação **W3C é o default** do NodeSDK e o repo **não registra** o propagator Jaeger | `ausência de JaegerPropagator` no código |

**O override do `propagator-jaeger` foi descartado na revisão do plano**: a
versão corrigida (2.9.0+) está **deprecada** no upstream (*"package no longer
supported"*) — trocar um advisory de exposição nula por um pacote morto e um
aviso em cada install é dívida trocada por dívida.

### C. O instrumento: `check-dependency-audit`

Nenhum gate media advisory de dependência — a mesma doença do F11 (as
procedures das skills de auditoria que ninguém executava). O gate novo roda o
`pnpm audit --json` e reprova quando há advisory crítica ou alta fora da
lista. **17 testes**; a spec fixa o denominador.

**A severidade que reprova mora no CÓDIGO** (`SEVERIDADES_QUE_REPROVAM`), não
no arquivo de exceções: na primeira versão ela vinha do JSON, e quem editasse
o arquivo trocando `["critical","high"]` por `[]` zerava a reprovação. O
arquivo é DADO; o gate é REGRA.

### D. A CSP do web

O web não tinha CSP nenhuma. Agora tem, com **nonce por requisição** (o
middleware `apps/web/middleware.ts` gera; o Next aplica nos scripts inline
que ele gera):

```
default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic';
style-src 'self' 'nonce-…'; img-src 'self' data: blob:; font-src 'self' data:;
connect-src 'self'; frame-ancestors 'none'; base-uri 'self';
form-action 'self'; object-src 'none'
```

Mais `X-Content-Type-Options`, `X-Frame-Options` e
`Strict-Transport-Security`. **Medido**: o nonce do header bate com o nonce
dos 14 scripts e dos styles do HTML; **0** scripts sem nonce.

`connect-src 'self'` basta porque o web **não** chama a API pelo browser — as
chamadas são server-side (RSC e Server Actions).

### E. As actions do CI pinadas por SHA

As 21 actions eram pinadas por **tag** — que é ponteiro mutável: quem
controla a action move a tag e o código novo entra no CI sem revisão. Agora
todas por SHA, com a tag no comentário. O gate `check-ci-action-pinning`
(10 testes) impede a volta da tag.

## O que NÃO foi corrigido, e por quê

- **A dimensão Cloudflare** (WAF, rate limiting na borda, TLS, DNSSEC, tokens
  de API, 2FA dos membros, log de auditoria): a autorização do conector foi
  feita em 2026-11-03, mas ele só expõe **documentação e spec OpenAPI** — não
  há ferramenta que execute a API da conta, e não há token no ambiente. **Nenhuma
  medição de borda foi feita** — e nada aqui afirma que a borda está boa ou
  ruim. O plano marca a etapa como pendente, com o runbook pronto.
- **`zod` 3 → 4** e **`vitest` 2 → 3**: as majors do toolchain inteiro
  (2.296 testes) por advisories cuja exposição foi medida como nula.
- **As 39 advisories moderadas/baixas**: nenhuma é explorável no caminho de
  produção medido, e reprovar por elas travaria o repo sem ganho.

## Como reproduzir

```bash
pnpm audit --json | jq '.metadata.vulnerabilities'   # 43 advisories
pnpm exec tsx .tooling/scripts/ci/preflight.ts       # o gate novo no painel
pnpm exec vitest run --root .tooling/scripts/ci check-dependency-audit
pnpm exec vitest run --root .tooling/scripts/ci check-ci-action-pinning
```

## Os dois defeitos que o trabalho encontrou em si mesmo

1. **O `pnpm audit` sai com código 1 quando acha advisory** — e o
   `execFileSync` joga o JSON da medição dentro da exceção. O primeiro teste
   do gate no repo real disse *"a auditoria NÃO RODOU"* com 4 advisories
   encontradas. Hoje há uma regressão presa na spec.
2. **A exceção do `vite` estava mal escrita** — o padrão `(vite|next) dev`
   casava com o script `dev` do `apps/web` (que é legítimo: dev local). O
   próprio gate acusou. A verificação passou a ser sobre os **workflows**.

## A revisão do PR #143 sobre o PR #143

O PR foi revisado com o mesmo método (medir, mutar, corrigir) e achou **9
defeitos**, todos corrigidos com regressão:

| # | Defeito | Como se reproduz |
|---|---|---|
| R1 | a CSP com `connect-src 'self'` **bloqueava a telemetria do browser** (o collector é de outra origem) — em silêncio, porque o `try/catch` do `instrumentation-client.ts` engole a recusa | `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` (o `.env.example`) vs a CSP |
| R2 | a CSP sem `'unsafe-eval'` **quebrava o servidor de dev** (o HMR do webpack usa `eval`) | o padrão do Next: `isDev ? "'unsafe-eval'" : ""` |
| R3 | a severidade que reprova vinha do **arquivo de dados** — quem editasse o JSON enfraquecia o gate | `severidadesQueReprovam` no JSON → `[]` |
| R4 | a verificação do `zod` cobria `apps/web/app` e **não** `apps/web/src`, `lib` nem `components` | o path da exceção |
| R5 | a regra do `uses:` acusava `docker://imagem:tag` como se fosse action (a mensagem estava errada) | `uses: docker://alpine:3.19` |
| R6 | o `docker://` por **digest** era reprovado (o check do digest olhava `@sha256:` numa ref já sem o `@`) | o próprio spec pegou |
| R7 | a verificação da exceção varria `dist/`, `coverage/` e `.turbo/` — o padrão podia casar em artefato de build | `arquivosEm` |
| R8 | os campos `severidade` e `modulo` da exceção eram **decorativos** — quem mudasse `"critical"` para `"low"` no arquivo acharia que rebaixava a exceção, e não rebaixava nada | o gate usava a severidade da advisory |
| R9 | o Next ainda anunciava a framework no `X-Powered-By` (Information exposure do OWASP) | `curl -I` no `/login` |

O R1 é o mais caro: **telemetria que morre em silêncio** é o modo de falha
mais difícil de notar — nenhum teste quebra, nenhum erro aparece no console.
A correção mede: a origem do collector entra no `connect-src`, e o `unsafe-eval`
entra **só** em desenvolvimento.
