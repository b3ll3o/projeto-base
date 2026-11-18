# Runbooks — índice

> O **índice** da família de runbooks do kit (item 12 da matriz em
> [`kit-documentacao.md`](../.agents/specs/conventions/kit-documentacao.md)).
> Cada runbook é um ambiente (ou um sintoma) com um procedimento executável.
>
> O runbook **canônico** do ambiente local é o
> [`docs/como-rodar.md`](./como-rodar.md) — o dono do "como executar" do repo.
> Os irmãos abaixo são **runbooks por ambiente**: o mesmo template, com o
> comando e o sintoma do seu ambiente.

| Runbook | Ambiente | Para quê |
|---|---|---|
| [`como-rodar.md`](./como-rodar.md) | 1 — dev local (pnpm nativo) | iterar no dia a dia: apps na máquina, só o banco em container |
| [`docker.md`](./runbooks/docker.md) | 2 e 3 — dev com hot reload e stack completa em Docker | recarregar ao salvar sem reinstalar nada, e rodar exatamente como em produção |
| [`observabilidade.md`](./runbooks/observabilidade.md) | 4 — observabilidade (Grafana, Tempo, Prometheus, OTel Collector) | ver traces e métricas |
| [`e2e-e-ci.md`](./runbooks/e2e-e-ci.md) | 5 e 6 — e2e local (Playwright) e CI (GitHub Actions) | rodar a suíte de navegador e saber o que o CI roda, job por job |
| [`cloudflare-edge.md`](./runbooks/cloudflare-edge.md) | 7 — borda Cloudflare da publicação | verificar e corrigir TLS, WAF, rate limiting, DNSSEC, MFA e tokens da conta |

> **O gate mede a família:** `check-doc-kit` exige que cada arquivo de
> `docs/runbooks/` tenha a âncora `## §1.` e que **este índice cite cada um
> deles** — um runbook que existe e não é listado aqui é um runbook que ninguém
> encontra.

## Ver Também

- [`docs/como-rodar.md`](./como-rodar.md) — o runbook canônico (o mapa dos 7
  ambientes, as variáveis e os scripts).
- [`kit-documentacao.md`](../.agents/specs/conventions/kit-documentacao.md) — a
  matriz do kit.
- [`docs/fluxo-desenvolvimento.md`](./fluxo-desenvolvimento.md) — os gates, em
  qual camada cada um dispara.

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.30.0
