---
name: e2e-playwright
version: 1.5
updated: 2026-10-19
maintainer: test-writer
description: "Convenção canônica de cobertura e2e de frontend — todo fluxo de usuário COM tela é mapeado no inventário abaixo e coberto por um spec Playwright que atravessa browser, Next, Server Action, API HTTP e Postgres de ponta a ponta. Gate automatizado em check-e2e-flow-coverage.ts; execução no CI."
---

# Convenção: `e2e-playwright` (cobertura e2e de frontend)

> pt-BR: define a obrigatoriedade de que **todo fluxo de usuário com tela**
> esteja mapeado e coberto por um spec Playwright que atravessa o backend.
> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).

## Objetivo

Fechar a lacuna que nenhuma das outras camadas cobre.

Antes desta convenção o repo tinha três camadas de teste, e a mais importante
não existia:

- **unit (Vitest, jsdom)** — o `CadastroUsuarioForm` recebe a Action por
  **prop**, com a real como padrão. Nos testes ela é quase sempre uma
  simulação: **o componente nunca fala com a API**.
- **integration + e2e (Vitest + `app.inject`)** — só em `apps/api`. Bate nos
  8 endpoints por HTTP, mas **nunca renderiza uma tela**.
- **e2e de browser** — inexistente.

O resultado é uma classe inteira de defeito invisível: o `POST /users`
responde 201, a Action mapeia o erro certo, a página tem o `force-dynamic`
certo — e ainda assim o cadastro não aparece, porque o único momento em que
browser, Next, Server Action, HTTP e Postgres participam do **mesmo** evento é
quando alguém abre a página.

## Escopo

Vale para **todo fluxo de usuário que tenha tela**.

**Não** vale para endpoint sem tela. Hoje são 6: update, delete, restore,
history, get-by-id e `/api/health`. Esses continuam cobertos pelo e2e de API
(`apps/api`, projeto `e2e` do Vitest, via `app.inject`), que é a camada certa
para eles — um `app.inject` não renderiza nada, e um browser para testar um
endpoint que ninguém vê seria custo sem cobertura.

## A Regra

> **Toda tela da aplicação precisa de um fluxo mapeado e de um spec e2e que a
> atravesse.** Tela nova sem linha no inventário é vermelho no preflight, com o
> path nomeado.

A regra tem duas metades, e a segunda é a que costuma faltar:

1. **Todo fluxo tem spec, todo spec pertence a um fluxo.** Isso é paridade
   entre o inventário e os cabeçalhos `// FLUXO:` dos specs — dois conjuntos
   escritos à mão.
2. **Toda rota da aplicação está no inventário.** O inventário transcreve a
   coluna `Rota`, e o gate confere cada token dela contra os `page.tsx` de
   `apps/web/app/**`, que ninguém escreve.

Sem a segunda metade, a regra é circular: o inventário pode ficar em paridade
consigo mesmo enquanto uma tela inteira passa sem cobertura. Foi exatamente o
que aconteceu com `/me/profile` até 2026-10-16 — o preflight anunciava
"reconciliado sobre 12 fluxo(s) e 12 spec(s)" com a tela fora, porque reconciliar
dois conjuntos escritos à mão não é medir a aplicação.

### Se uma tela não pode (ou não deve) ter spec

Não se inventa uma linha vazia. A linha do inventário **precisa dizer por
que** — e o nome da rota na coluna `Rota` continua obrigatório, porque é ele
que faz a tela aparecer no gate. Uma rota isenta é uma decisão registrada, não
um silêncio.

## Inventário de Fluxos

> ⚠️ **Esta tabela é dado, não prosa.** O gate
> `.tooling/scripts/ci/check-e2e-flow-coverage.ts` lê estas linhas e as
> compara com os specs de `apps/web/e2e/*.spec.ts`. Editar o inventário sem
> criar o spec (ou o contrário) deixa o preflight vermelho, nomeando o fluxo.

| Fluxo | Rota | Nome | Spec | Estados cobertos |
|-------|------|------|------|-------------------|
| F1 | `/users` | Listagem de usuários | `f1-listagem.spec.ts` | com dados · vazio · API fora do ar |
| F2 | `/users/novo` → `/login?cadastrado=1` → `/users` | Cadastro com sucesso | `f2-cadastro-sucesso.spec.ts` | cria · redireciona · confirmação no login · aparece na lista · normalização |
| F3 | `/users/novo` | Validação no cliente | `f3-cadastro-validacao.spec.ts` | vazio · email malformado · limite de tamanho · foco no 1º inválido |
| F4 | `/users/novo` | Email duplicado | `f4-cadastro-email-duplicado.spec.ts` | 409 → erro no campo · valores preservados · `aria-invalid` |
| F5 | `/users/novo` | Erro genérico | `f5-cadastro-erro-generico.spec.ts` | 500 com traceId · rede caída sem traceId |
| F6 | `/` ↔ `/users` ↔ `/users/novo` | Navegação | `f6-navegacao.spec.ts` | home · link da listagem · Cancelar |
| F7 | `/login` → `/users` | Login de usuário | `f7-login.spec.ts` | válido · senha errada · e-mail inexistente · `autocomplete` · saída para o cadastro |
| F8 | `/users` ↔ `/login`, `/users/novo` | Rota protegida sem sessão | `f8-sessao-obrigatoria.spec.ts` | sem cookie vai ao login · **sem cookie o cadastro é alcançável** · conteúdo NÃO entregue · cookie inválido · volta pelo login |
| F9 | `/admin/profiles` | Listagem de perfis (admin) | `f9-admin-profiles.spec.ts` | admin vê tabela com flags e contagem · quase-admin vê "Acesso restrito" · tabela não renderiza |
| F10 | `/admin/profiles/new` → `/admin/profiles/[slug]` | Criação de perfil | `f10-admin-novo-perfil.spec.ts` | cria com permissão inicial · redireciona ao detalhe · `isAdmin` não é oferecido · quase-admin recusa |
| F11 | `/admin/profiles/[slug]` | Detalhe e troca de permissões | `f11-admin-perfil-detalhe.spec.ts` | perfil comum: marca e salva · perfil de sistema: somente leitura, sem form · quase-admin recusa e não vê o slug |
| F12 | `/admin/users` | Atribuição de perfil a usuário | `f12-admin-usuarios.spec.ts` | atribui e a coluna reflete · quase-admin recusa e não vê nome/e-mail |
| F13 | `/me/profile` | Meu perfil | `f13-meu-perfil.spec.ts` | admin vê o bypass · perfil comum vê nome, slug e permissões · sem perfil: deny-by-default · sem sessão vai ao login |
| F14 | `/admin/flags` | Ativação e desativação de funcionalidades (admin) | `f14-admin-flags.spec.ts` | admin desliga e religa e a tela reflete · a flag salva NA TELA é a que a rota respeita (404 desligada · 403 ligada) · quase-admin recusa e o menu não oferece o link |
| F15 | `/admin/profiles/[slug]` | Edição dos metadados do perfil | `f15-admin-editar-perfil.spec.ts` | admin renomeia e descreve e **o banco é lido** (o `value` do input não prova gravação) · perfil `isAdmin`: somente leitura, sem formulário |

⚠️ **10 rotas, 15 fluxos.** F2–F5 são quatro estados **da mesma** rota, e F6
atravessa três. F7–F8 são os fluxos que a demanda `login-usuario-senha`
acrescentou: o login e a rota protegida sem sessão. F9–F12 são as quatro telas
`/admin/*` do RBAC (#97), e cada uma tem um teste que é o **negativo** do
acesso — sem eles, "admin vê a tela" e "qualquer um vê a tela" passam no mesmo
spec. F13 é `/me/profile`, que era a única tela do app com `page.tsx` e nenhum
spec — MEDIDO 2026-10-16, e a coluna `Rota` do inventário é conferida contra
os `page.tsx` do disco, que foi o que apontou a falta. F14 é a quinta tela
`/admin/*` (feature-flags) e a primeira cujo spec **não termina na tela**: ele
salva pela tela e afirma o efeito chamando a API, porque a emenda entre "o que
o admin marcou" e "o que o guard lê" não tem onde ser medida de outro jeito. O
gate **não** deriva o inventário das rotas: um mapeamento rota→fluxo 1:1 falha
sempre, e uma segunda tabela transcrita à mão volta a ser o literal que
`check-teeth-registry.ts` existe para desconfiar. F15 é a **segunda tela** com
mais de um fluxo (a primeira é `/admin/profiles/[slug]`, de F11), e ele não
termina na tela por escolha: `name`/`description` viraram formulário, e um
`expect(input).toHaveValue(...)` passaria **sem gravação nenhuma** — `input`
uncontrolled conserva o que foi digitado depois do re-render. O spec salva
pela tela e **lê o Postgres** (`prismaE2E()`); na tela ele afirma o `<h1>`,
que é derivado do servidor. MEDIDO 2026-10-19: foi a primeira execução do
`PATCH /admin/profiles/:id` de **sucesso** contra Prisma real (o único PATCH
e2e anterior esperava 403) — mutar a descrição esperada deixa o spec vermelho
com o valor gravado no banco ao lado.

⚠️ **Desde 2026-10-13 quase todo spec roda autenticado, e isso é invisível na
tabela.** `/users` — a LISTAGEM — chama `exigirSessao()`, que redireciona para
`/login` sem access token. A sessão é plantada por cookie numa fixture `auto`
(`comSessao`, em `support/fixtures.ts`), e não pelo login pela tela — porque o
login pela tela **é** o F7, e transformá-lo em pré-requisito faria uma falha no
formulário derrubar a listagem, a validação e a navegação. Um spec que precisa
medir o estado deslogado chama `clearCookies(page)` no próprio corpo.

⚠️ **`/users/novo` NÃO está protegida, e a coluna de rota diz isso.** `POST /users`
é público na API (decisão D-2), então exigir sessão na tela de cadastro não
impedia ninguém de criar conta — só impedia a pessoa, num beco sem saída: o link
"Criar conta" do login aponta para lá e quem não tinha conta voltava para o
login. O F8 afirma as duas metades (`/users` leva ao login, `/users/novo` é
alcançável) porque o par é o que segura a decisão; uma metade sozinha passaria
com o produto inteiro do avesso.

Cada spec declara o id do fluxo na **primeira linha**:

```ts
// FLUXO: F3 — Validação no cliente
```

É esse cabeçalho que liga o spec ao inventário. Um spec sem `FLUXO:` é
erro — "o nome do arquivo já diz" não é rastreabilidade, é coincidência.

## Como Adicionar um Fluxo

Fluxo novo é **duas entradas no mesmo PR**, e o gate transforma o meio-cumprido
em vermelho:

1. Uma linha na tabela de **Inventário de Fluxos** acima.
2. Um `apps/web/e2e/f<N>-<slug>.spec.ts` começando com `// FLUXO: F<N>`.

E a coluna `Rota` da linha nova não é decoração: ela é conferida contra os
`page.tsx` do disco. Tela nova sem linha é o que o gate accuse — e a ordem
importa, porque o gate roda no preflight e a linha sai antes do spec quebrar o
build.

Comandos:

```bash
# A suíte (sobe Postgres efêmero + API + Next e roda os specs)
pnpm --filter @projeto/web test:e2e

# Só um arquivo
pnpm --filter @projeto/web test:e2e f3-cadastro-validacao.spec.ts

# O gate de paridade (rápido, não sobe nada)
pnpm ci:preflight
```

## O que a Suíte Monta

`e2e/global-setup.ts` sobe quatro coisas, nesta ordem — a ordem é load-bearing:

1. **Postgres efêmero** (Testcontainers). **Não** é o banco de dev, que tem
   dados reais.
2. **API Nest** — o `src/main.ts` de verdade, numa porta livre. Não
   `app.init()`: `init()` não binda porta, e um browser não faz `inject`.
3. **`next build`** em `.next-e2e/` — não `next dev`, que traz overlay,
   avisos de StrictMode e effects duplicados, exatamente onde esta suíte
   afirma (`startTransition`, `pendente`).
4. **`node .next-e2e/standalone/server.js`** — e **não** `next start`, que o
   Next 15.5 desaconseha sob `output: 'standalone'`.

Ver [`apps/web/playwright.config.ts`](../../../apps/web/playwright.config.ts)
para `workers: 1` (justificativa do isolamento por banco) e para o porquê de
não haver `baseURL`.

⚠️ **`workers: 1` é uma dependência com teeth, não um comentário.**MEDIDO
2026-10-08: `grep -rn "workers"` sobre `.tooling/scripts`, `tooling/scripts`,
`apps/web` e `.agents/specs` trazia 6 ocorrências e ZERO travas — só a config,
comentários e esta linha. A dependência existia sem amarra desde que
`e2e/support/banco.ts` passou a fazer `docker stop` no container COMPARTILHADO:
com 2 workers o F5 derruba o Postgres enquanto o outro está no meio de um
spec. O guard é
[`apps/web/playwright-isolamento.spec.ts`](../../../apps/web/playwright-isolamento.spec.ts)
— mutação verificada: `workers: 2` o deixa vermelho. Ele lê o arquivo, então
**não** cobre `--workers` na CLI, que sobrescreve sem deixar rastro; o CI não
passa a flag, e é por isso que vale.

## Regras que os Specs Devem Seguir

**Medir o efeito, não o trajeto.** Não conte requisições de browser para
provar que a API não foi chamada: todo o tráfego de API deste app é
server-side, e o filtro casaria vazio em **todos** os cenários — bloqueado e
bem-sucedido. Seria verde por construção.

O par que substitui isso: **F3 afirma que a contagem não sobe, F2 afirma que
ela sobe**, e os dois leem a mesma contagem pela API pública. F3 verde com a
validação desligada significaria que a barreira não é a que segura; F2
vermelho com o redirecionamento quebrado significaria que a tela mente.

**Escopar todo locator de erro.** `page.locator('[role="alert"]')` na página
inteira devolve **3** elementos, um vazio — é a live-region do Next Dev Tools.
Nome de botão é **exato**: `Cadastrar` é substring de `Cadastrando…`.

**Semear pela API, não pela tela.** Estado prévio de um fluxo é criado por
HTTP. Criá-lo navegando mediria o fluxo F2 dentro do F4, e um defeito em F2
derrubaria F4 sem dizer qual dos dois quebrou.

## Enforcement em Camadas

| Camada | Onde | O que mede |
|--------|------|------------|
| Paridade | `check-e2e-flow-coverage.ts` (preflight + CI) | inventário ⇄ specs |
| Fiação | `check-ci-local-e2e.ts` (preflight + CI) | que `ci:local` invoca `test:e2e`, alcança todo pacote de e2e por `--filter`, e que cada `test:e2e` com Playwright tem `pretest:e2e` instalando o browser |
| Execução | `test:e2e` no job `quality` do CI **e** em `pnpm ci:local` (Camada 1, 2026-10-08+) | que os specs passam de verdade |

São **camadas separadas**, e a distinção importa: os dois gates medem
**declaração**, não execução; quem executa é o `test:e2e`. Eles não se provam
passando — se provam **acusando**.

### Como verificar que o gate realmente fecha

Um gate que nunca disparou é indistinguível de um gate que funciona:

```bash
# 1. tire um FLUXO do cabeçalho de um spec
# 2. rode o preflight e veja o VERMELHO nomeando o fluxo
# 3. restaure
```

O mesmo vale para o par F2/F3: desligue o `return` de validação em
`cadastro-usuario-form.tsx` e veja **F3 vermelho e F2 verde** — os dois lados
do par, não um.

## Revisões

| Versão | Data | Mudança |
|---------|------|---------|
| 1.0 | 2026-10-08 | Criação. Inventário F1–F6; gate de paridade; execução no CI. |
| 1.1 | 2026-10-13 | Demanda `login-usuario-senha`: F7 (login) e F8 (rota protegida sem sessão). F1–F6 passam a rodar autenticados pela fixture `auto` `comSessao`; `JWT_SECRET` aleatório por execução no `subirApi`; `SENHA_DE_TESTE` e `emailUnico` exportados de `e2e/support/dados.ts` (`:308` e `:359`) para o spec F7 semear a própria conta. `/users/novo` sai do conjunto protegido — a tela de cadastro deixou de chamar `exigirSessao()`, porque `POST /users` já é público. |
| 1.2 | 2026-10-16 | RBAC (#97): F9–F12 cobrem as quatro telas `/admin/*`, que não tinham spec. `e2e/support/rbac.ts` nasce como **segunda exceção** à regra de `dados.ts` (banco direto só em `limparBase()`) — não existe rota HTTP que crie `isAdmin`, então o banco é a única forma de produzir o pré-requisito. Fixture `comoAdmin` em `support/fixtures.ts` (planta os cookies do admin semeado por cima dos de `comSessao`). |
| 1.3 | 2026-10-16 | O gate passa a reconciliar com um **terceiro** conjunto: as rotas de `apps/web/app/**/page.tsx`. Reconciliar dois conjuntos escritos à mão provava paridade, e paridade não é cobertura — `/me/profile` era a única tela do app sem spec e o preflight estava verde. A coluna `Rota` do inventário passa a ser conferida contra o disco (tela nova sem linha é vermelha, com o path nomeado). F13 fecha a lacuna encontrada por essa própria conferência: `/me/profile` com os quatro estados da tela (admin/bypass, perfil comum, deny-by-default, sem sessão). Contador corrigido: eram "8 rotas, 12 fluxos" e são 9 e 13. |
| 1.4 | 2026-10-18 | F14 cobre `/admin/flags` (feature flags) — a quinta tela `/admin/*` e a primeira cujo spec **não termina na tela**: ele salva pela tela e afirma o efeito **chamando a API** (404 desligada · 403 ligada, com o `title` nomeando quem recusou). O escenario 12 da API escreve a flag no banco e o `lib/flags.spec.ts` prova path contra um cliente mockado; nenhum dos dois via o que o admin marca NA TELA, e essa emenda era o buraco. Contador corrigido: eram "9 rotas, 13 fluxos" e são 10 e 14. MEDIDO 2026-10-18: `next build` **nao** pega uma Server Action sem `'use server'` (build sai 0; o digest `2923057904` so aparece no request, porque a página é `force-dynamic`), e `click()` resolve no despacho — o save precisa ser esperado por **estado**, nao por `waitForTimeout`. |
| 1.5 | 2026-10-19 | F15 cobre a edição de `name`/`description` em `/admin/profiles/[slug]` — a rota de F11, que passa a ter **dois** fluxos. É o primeiro spec do inventário que **lê o Postgres** (`prismaE2E()`) para provar gravação, e a razão está no `<input>`: uncontrolled, ele conserva o que foi digitado depois do re-render, então `toHaveValue` passaria com a escrita perdida. Na tela o spec afirma o `<h1>` (derivado do servidor) e no banco o `name`/`description`. MEDIDO 2026-10-19: foi a primeira execução do `PATCH /admin/profiles/:id` de **sucesso** contra Prisma real — o único PATCH e2e anterior (`11-tenant-isolation`) esperava 403 — e ela **verde**: o caminho de escrita estava sem prova desde que `atualizarPerfil` ganhou o cliente. Segundo caso: perfil `isAdmin` mostra "somente leitura" e não renderiza `input[name="name"]` (`atualizar` recusa `isSystem` **e** `isAdmin`, `profiles.use-cases.ts:268,271`). Contador: 14 → 15 fluxos, com as **10 rotas inalteradas**. |

## Ver Também

- [`cobertura-testes.md`](./cobertura-testes.md) — a cobertura **unitária**;
  a exclusão de `app/**` que aponta para cá é a outra metade desta frase.
- [`ci-defense-in-depth.md`](./ci-defense-in-depth.md) — onde o gate e o
  `test:e2e` entram nas 3 camadas.
- [`guard-classes.md`](./guard-classes.md) — as 7 classes pelas quais um
  controle falha reportando verde.
