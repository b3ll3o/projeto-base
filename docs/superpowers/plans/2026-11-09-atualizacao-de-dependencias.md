# Plano — Atualização de dependências (actions + pnpm) em PR único

- **Data:** 2026-11-09
- **Branch:** `feat/atualizacao-de-dependencias`
- **Base:** `origin/main` = `3e3ab80` (v1.23.0, o #148 mergeado)
- **Origem:** os 5 PRs abertos do Dependabot (#150–#154) + o `pnpm outdated -r` do workspace

## Objetivo

Um **único PR** que atualiza todas as dependências do projeto — as actions do CI
e as do pnpm — e que **não deixe passar para a `main`** nenhum erro que a
atualização introduza. Para isso, o PR traz **gates novos** que medem as
condições que, hoje, ninguém mede.

## 1. O que a medição encontrou (2026-11-09)

### 1.1 Os PRs do Dependabot (#150–#154)

Os 5 PRs abertos são **todos de `github-actions`** — nenhuma dependência de
pnpm, porque o `.github/dependabot.yml` declara só o ecosystem
`github-actions`. Todos os 5 passam no CI (preflight, quality, review, sync,
docker-build-prod).

| PR | Action | De | Para | SHA proposto | CI |
|---|---|---|---|---|---|
| #150 | `actions/checkout` | 4.4.0 | 7.0.1 | `3d3c42e5…` | ✅ |
| #151 | `docker/setup-buildx-action` | 3.12.0 | 4.4.1 | `f87e5991…` | ✅ |
| #152 | `actions/upload-artifact` | 4.6.2 | 7.0.2 | `cf430e03…` | ✅ |
| #153 | `actions/setup-node` | 4.4.0 | 7.1.0 | `949feb24…` | ✅ |
| #154 | `pnpm/action-setup` | 3.0.0 | 6.1.1 | `73e46992…` | ✅ |

**Um defeito real no #154:** o pin vai para `6.1.1`, mas o **comentário de
versão fica `# v3`**. O HumansONS do GitHub mostra o comentário — o humano
lê "v3" e acredita num pin antigo. MEDIDO 2026-11-09, comparando a major
proposta com a major do comentário nos 5 PRs: 4 batem, **1 erra** (`pnpm/action-setup`).

### 1.2 As dependências de pnpm

`pnpm outdated -r` → **53 pacotes**: 27 minor/patch (já cabem no range `^`
declarado) e **26 major** (quebram API).

**O range declarado já permite os 27 minor/patch.** `pnpm outdated` mostra
`wanted` = `latest` para quase todos — ou seja, o range `^` no `package.json`
já aceitaria a versão nova, e o lockfile é que está atrás.

**Drift entre workspaces (4 pacotes) — MEDIDO 2026-11-09:**

| Pacote | Versões em uso | Onde |
|---|---|---|
| `@types/node` | `^20.16.0` / `^20.11.0` | raiz, api, web / tooling/scripts |
| `tsx` | `^4.19.0` / `^4.7.0` | raiz / tooling/scripts |
| `typescript` | `^5.6.0` / `^5.3.3` | raiz, api, web, shared-types / tooling/scripts |
| `vitest` | `^2.1.9` / `^2.1.0` | raiz, api / web |

Nenhum gate mede isso: `check-package-json-drift` confere os **scripts**,
não as **versões**.

### 1.3 O que NÃO tem dono

O `.github/dependabot.yml` cobre **só `github-actions`** — e o próprio
comentário do arquivo diz: *"Só o ecosystem `github-actions`: o resto do repo
(pnpm) tem o `renovate`/lockfile próprio, e um segundo dono de atualização é
pior do que nenhum."*

**MEDIDO 2026-11-09: não existe `renovate.json`, `.renovaterc`, nem `renovate`
no `package.json`.** O dono do pnpm **não existe** — o comentário do config
aponta para uma ferramenta que não está no repo. As 53 dependências de pnpm
envelhecem sozinhas, e foi assim que o `next` ficou 4 minors atrás até o
`check-dependency-audit` (#143) aparecer.

## 2. O escopo desta atualização

### 2.1 Actions do CI — 5 bumps, o escopo inteiro dos PRs do Dependabot

Aplico os 5 SHAs propostos pelo Dependabot — **o Dependabot é o dono
legítimo** das actions, e ele já rodou o CI de cada uma. O PR único fecha os
5 PRs do Dependabot.

Correção: o comentário do `pnpm/action-setup` vai para `# v6.1.1` (o do #154
está errado).

### 2.2 pnpm — os 27 minor/patch, e nada além

Aplico **os 27 minor/patch**, que cabem no range `^` já declarado — nenhum
deles muda a API que o repo consome. O `lockfile` é atualizado e o `pnpm
install --frozen-lockfile` (o que o CI usa) tem que passar.

**Os 26 major ficam de fora, e por quê — cada um medido:**

| Major | Por que não agora |
|---|---|
| `@nestjs/*` 11→12 | breaking change de framework; exige migração do app inteiro |
| `prisma` 6→8 | o `latest` é **8.0.0-rc.33** — um *release candidate*; RC não entra em `main` |
| `@prisma/client` 6→7 | incompatível com `prisma` 6 (mesma causa) |
| `next` 15→16 + `eslint-config-next` | breaking change de framework; o CSP e o middleware do #143 são sensível |
| `vitest`/`@vitest/coverage-v8` 2→5 | o runner inteiro muda; o `check-test-set-covered` e o `ci:local` são acoplados |
| `eslint`/`@eslint/js` 9→10 | flat-config breaking; o `eslint-config` do repo é da série 9 |
| `typescript` 5→7 | o TS 7 é a reescrita nativa; muda o `tsc` inteiro |
| `zod` 3→4 | API reescrita; os schemas do auth usam a API do v3 |
| `@opentelemetry/*` 1→2/3 | renomeia pacotes e muda a API de tracing |
| `nestjs-pino` 4→5, `pino-http` 10→11, `pino-pretty` 11→13 | breaking de API de logging |
| `@types/node` 20→26 | `@types/node` major随手 = quebra de tipos; `engines.node` é `>=22.6` |
| `@testcontainers/postgresql` 10→12 | API do container mudou |
| `web-vitals` 4→6 | API de medição mudou |
| `jsdom` 30→31, `@types/supertest` 6→7 | major de suporte, baixo risco isolado |

**Este PR atualiza o que é seguro e declara o resto.** Um PR que atualiza 26
majors de framework ao mesmo tempo é um PR que não se revisa — e o repo já
demonstrou que a taxa de defeito sobe quando a revisão não acompanha.

O que **é** feito com os major: um **gate novo** (§3.2) que mede e publica a
divergência, para que a dívida fique **com dono e visível**, e não em silêncio.

### 2.3 O drift entre workspaces — corrigido

Os 4 pacotes com drift (`@types/node`, `tsx`, `typescript`, `vitest`) passam a
ter **uma versão só** em todos os workspaces que os consomem. Isso é
pré-requisito do gate de drift (§3.1) — o gate entra **verde** no mesmo PR.

## 3. Os gates novos

Cada gate novo é **medido por mutação** (a mutação o leva a VERMELHO), e
entra no `preflight-gates.ts` (fonte única), no `preflight.ts` (runner), no
**Registro de dentes** e na **Tabela de Checks** — o `check-teeth-registry`
reconcilia os quatro.

### 3.1 `check-dependency-drift` — uma versão por pacote

**A lacuna:** `check-package-json-drift` confere os **scripts** de cada
`package.json`; **nenhum gate confere se o mesmo pacote tem versões
diferentes** em workspaces diferentes. MEDIDO 2026-11-09: 4 pacotes divergem
(`@types/node`, `tsx`, `typescript`, `vitest`).

**A regra:** o mesmo pacote, declarado em 2+ `package.json` do workspace, tem
que ter **a mesma faixa de versão** em todos — salvo uma **exceção
declarada** num arquivo versionado, com o motivo.

**Por que isso impede erro na `main`:** duas versões do mesmo pacote no
lockfile significam duas cópias em `node_modules`, e o `check-bloco-duplicado`
mede **código** duplicado, não dependências. O resultado é a classe 2 de
`guard-classes.md`: o controle existe mas não pega o que promete.

### 3.2 `check-dependency-freshness` — a dívida de major, com dono

**A lacuna:** o `check-dependency-audit` mede **advisory** (risco de
segurança). Ninguém mede **idade** (risco de obsolescência). As 26 majors
ficaram meses sem dono — e o próprio `dependabot.yml` afirma que o pnpm tem
"dono próprio" que não existe.

**A regra:** para cada dependência declarada, se existe uma versão **major**
mais nova, a dependência entra na lista de pendência. A pendência é uma
**tabela versionada** (`.tooling/scripts/ci/dependencias-major-pendentes.json`)
com, por item: o pacote, a versão atual, a major mais nova e o **motivo**
de não subir agora.

**A regra de reprovação:** a pendência só reprova quando o motivo **deixa de
ser verdade** — isto é, quando o pacote é **removido do workspace** (a
pendência envelheceu) ou quando a **faixa declarada já permite** a major
(a pendência envelheceu). E a lista tem que ter **um dono**: a CI publica a
contagem de majors **pendentes** como advisory, e a lista é reconciliada por
gate.

**Por que isso impede erro na `main`:** sem isso, a próxima major (o NestJS 13,
o Prisma 9) chega sem ninguém medindo, e o repo só descobre no CVE. Com
isso, a major pendente é **um item datado com dono**, e a lista não pode
envelhecer em silêncio.

### 3.3 `check-action-version-comment` — o comentário tem que dizer a verdade

**A lacuna:** o `check-ci-action-pinning` confere **só o formato** do SHA
(40 hex). O **comentário** de versão — o que o HumansONS do GitHub mostra ao
humano — não é medido por ninguém. O próprio `.github/dependabot.yml` admite:
*"Ele NÃO resolve a tag, NÃO tem rede, e NÃO exige o comentário `# v4`"*.

**MEDIDO 2026-11-09: o PR #154 do Dependabot sobe `pnpm/action-setup` para
6.1.1 e deixa o comentário `# v3`.** O CI passa — o SHA está pinado, o
formato está certo — e o humano lê a versão errada na interface.

**A regra:** todo `uses:` de action de terceiro tem que ter um **comentário de
versão** (`# vN` ou `# vN.M.N`), e:
- a **major** do comentário tem que bater com a major da **tabela de pins
  versionada** do repo (`.tooling/scripts/ci/ci-action-pins.json`), que é a
  fonte da verdade do que está pinado;
- **a mesma action não pode estar pinada em SHAs diferentes** em workflows
  diferentes.

**Por que isso impede erro na `main`:** o pin por SHA é o que fecha o supply
chain; o comentário é o que dá **legibilidade** ao pin. Um comentário que mente
não é um problema estético — é o HumansONS do GitHub mostrando a versão
errada para quem aprova o PR.

## 4. A execução

1. **Branch** a partir do `origin/main` atualizado.
2. **Actions:** aplicar os 5 SHAs do Dependabot + corrigir o comentário do
   `pnpm/action-setup` para `# v6.1.1`.
3. **pnpm minor/patch:** `pnpm update` (sem `--latest`) em todos os
   workspaces — fica dentro do range `^` declarado. **Não** usar `--latest`:
   ele atravessaria a major e traria os 26 breaking changes sem revisão.
4. **Drift:** alinhar `@types/node`, `tsx`, `typescript`, `vitest` em todos os
   workspaces.
5. **Rodar tudo:** preflight, suíte de gates, suíte da API, suíte do web, e2e,
   typecheck, lint, `ci:boot`.
6. **Corrigir** o que a atualização quebrou.
7. **Gates novos:** `check-dependency-drift`, `check-dependency-freshness`,
   `check-action-version-comment` — cada um com spec e **mutação** que prova
   que ele falha.
8. **Registrar** os 3 gates (preflight-gates, preflight, dentes, catálogo).
9. **Documentar:** bump minor da versão, tabela de versões, README, e o
   `dependabot.yml` (o pnpm passa a ter dono).
10. **Commit, push, PR único** — e **fechar os 5 PRs do Dependabot**, que
    viram um só.

## 5. O que este PR **não** faz, e por quê

- **Não atualiza os 26 major.** Cada um tem o motivo medido em §2.2, e o
  gate §3.2 publica a pendência com dono. Um PR com 26 breaking changes de
  framework não se revisa — e o repo já provou que revisão que não acompanha
  produz defeito.
- **Não fecha os 5 PRs do Dependabot sem substituto.** Este PR **é** o
  substituto: os mesmos 5 SHAs, aplicados, com o comentário corrigido.
- **Não toca no `prisma` RC.** `8.0.0-rc.33` é *release candidate*; um RC
  não entra na `main` de um template.

## 6. Como cada erro seria barrado

| Erro | Quem barra |
|---|---|
| `pnpm install --frozen-lockfile` falha (lockfile fora de sintonia) | o **CI** (`preflight` e `quality` já rodam) |
| versão divergente entre workspaces | **`check-dependency-drift`** (novo) |
| major pendente sem dono / pendência envelhecida | **`check-dependency-freshness`** (novo) |
| comentário de versão mentindo | **`check-action-version-comment`** (novo) |
| mesma action em SHAs diferentes | **`check-action-version-comment`** (novo) |
| action sem pin por SHA | `check-ci-action-pinning` (existente) |
| advisory crítica/alta sem exceção | `check-dependency-audit` (existente) |
| `engines.node` divergente | `check-engines-consistency` (existente) |
| versão de footer divergente | `check-version-footers` (existente) |
| gate novo sem entrada no registro | `check-teeth-registry` (existente) |

## 7. Aceitação

- [ ] Os 5 SHAs do Dependabot aplicados, com o comentário do
      `pnpm/action-setup` em `# v6.1.1`.
- [ ] Os 27 minor/patch de pnpm aplicados; `pnpm install --frozen-lockfile`
      passa.
- [ ] Os 4 pacotes com drift em **uma versão só**.
- [ ] Os 3 gates novos: spec verde + **mutação** que os leva a VERMELHO.
- [ ] `preflight` com **0 erro**; suíte de gates, API, web e e2e verdes.
- [ ] `typecheck` e `lint` verdes; `ci:boot` sobe a aplicação.
- [ ] Bump minor da versão nos 6 footers + tabela de versões + README.
- [ ] **1 PR** com tudo, e os 5 PRs do Dependabot fechados.
