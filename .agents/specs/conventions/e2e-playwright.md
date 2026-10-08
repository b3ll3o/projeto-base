---
name: e2e-playwright
version: 1.0
updated: 2026-10-08
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

## Inventário de Fluxos

> ⚠️ **Esta tabela é dado, não prosa.** O gate
> `.tooling/scripts/ci/check-e2e-flow-coverage.ts` lê estas linhas e as
> compara com os specs de `apps/web/e2e/*.spec.ts`. Editar o inventário sem
> criar o spec (ou o contrário) deixa o preflight vermelho, nomeando o fluxo.

| Fluxo | Rota | Nome | Spec | Estados cobertos |
|-------|------|------|------|-------------------|
| F1 | `/users` | Listagem de usuários | `f1-listagem.spec.ts` | com dados · vazio · API fora do ar |
| F2 | `/users/novo` → `/users` | Cadastro com sucesso | `f2-cadastro-sucesso.spec.ts` | cria · redireciona · aparece na lista · normalização |
| F3 | `/users/novo` | Validação no cliente | `f3-cadastro-validacao.spec.ts` | vazio · email malformado · limite de tamanho · foco no 1º inválido |
| F4 | `/users/novo` | Email duplicado | `f4-cadastro-email-duplicado.spec.ts` | 409 → erro no campo · valores preservados · `aria-invalid` |
| F5 | `/users/novo` | Erro genérico | `f5-cadastro-erro-generico.spec.ts` | 500 com traceId · rede caída sem traceId |
| F6 | `/` ↔ `/users` ↔ `/users/novo` | Navegação | `f6-navegacao.spec.ts` | home · link da listagem · Cancelar |

⚠️ **3 rotas, 6 fluxos.** F2–F5 são quatro estados **da mesma** rota, e F6
atravessa três. Por isso o gate **não** deriva o inventário das rotas: um
mapeamento rota→fluxo 1:1 falha sempre, e uma segunda tabela transcrita à mão
volta a ser o literal que `check-teeth-registry.ts` existe para desconfiar.

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
| Execução | `test:e2e` no job `quality` do CI | que os specs passam de verdade |

São **camadas separadas**, e a distinção importa: o gate mede **paridade
declarativa**, não execução. Ele não se prova passando — se prova
**acusando**.

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

## Ver Também

- [`cobertura-testes.md`](./cobertura-testes.md) — a cobertura **unitária**;
  a exclusão de `app/**` que aponta para cá é a outra metade desta frase.
- [`ci-defense-in-depth.md`](./ci-defense-in-depth.md) — onde o gate e o
  `test:e2e` entram nas 3 camadas.
- [`guard-classes.md`](./guard-classes.md) — as 7 classes pelas quais um
  controle falha reportando verde.