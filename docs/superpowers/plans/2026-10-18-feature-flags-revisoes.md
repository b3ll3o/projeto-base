---
name: revisoes-feature-flags
description: Revisoes incrementais por fase do plano de feature flags, com as mutacoes medidas e o que cada revisor nao mediu
version: 1.0.0
updated: 2026-10-18
status: revisto
plan: 2026-10-18-feature-flags.md
---

# Revisoes — plano de feature flags

> Companheiro de [`2026-10-18-feature-flags.md`](./2026-10-18-feature-flags.md).
> Cada `## Revisao (vX)` abaixo registra **uma fase**: o que mudou no plano, a
> tabela de mutacoes medidas e — a parte que mais importa — **o que o revisor
> NAO mediu**.

# Revisoes — plano de feature flags (indice)

> Companheiro de [`2026-10-18-feature-flags.md`](./2026-10-18-feature-flags.md).
> Cada `## Revisao (vX)` registra **uma fase**: o que mudou no plano, a tabela
> de mutacoes medidas e — a parte que mais importa — **o que o revisor NAO
> mediu**. O log e append-only e passou do teto de 300 linhas, entao ele
> vive em dois arquivos irmaos, conforme
> [`tamanho-e-revisao.md`](../../../.agents/specs/conventions/tamanho-e-revisao.md).

| Arquivo | Revisoes | Fases |
|---------|----------|-------|
| [`…-revisoes-fases-0-3.md`](./2026-10-18-feature-flags-revisoes-fases-0-3.md) | v1.1.0 – v1.5.0 | revisao do plano · **F2** · **F3** |
| **este** ([`…-revisoes.md`](./2026-10-18-feature-flags-revisoes.md)) | v1.6.0 em diante | **F4** · **F5** · **F6** · **F7** |

## Revisao (v1.6.0 — Fase 4)

F4 fecha a lacuna que a F3 tinha declarado: a flag agora e lida **na borda**,
por um `FeatureFlagGuard` que devolve 404 quando a chave esta off.

### Mutacoes medidas (Fase 4)

Medido por mim, com `/tmp/mut-f4.sh`, contando **quantos** testes do cenario 12
(`apps/api/test/e2e/scenarios/12-onboarding.e2e.spec.ts`) caem. A spec unitaria
do guard nao entra: ela monta o guard com `new` e nao conhece decorator nem
handler.

| # | Mutacao | Vermelhos | Quem acusa |
|---|---------|-----------|------------|
| F4-a | `@RequireFeatureFlag` fora do `convidar` | 2 | flag off deixa de barring `convidar` |
| F4-b | `FeatureFlagGuard` fora do `@UseGuards` | 2 | metadata sem consumidor |
| F4-c | decorator **so** na classe | **0** | ver abaixo — e a medicao mais cara da fase |
| F4-d | `NotFoundException` → `ForbiddenException` no guard | 2 | o 404 e escolha, nao accidento |

### A mutacao F4-c que deu 0 (e o que ela ensina)

Mover **so** o decorator para a classe e um **no-op silencioso**: o
`FeatureFlagGuard` continua no `@UseGuards` do handler, entao ele le
`getAllAndOverride([handler, classe])` e nao acha metadata nenhuma — passa. Nenhum
teste fica vermelho. Mover **os dois** (guard + decorator) da para 1 vermelho.
A primeira versao do comentario do spec afirmava que mover os dois daria 3; foi
corrigida para o que foi medido, incluindo o porquê de a forma_so-decorador_ ser
a traiçoeira: metadata sem consumidor nao produz erro nenhum, produz *passagem*.

### MEDIDO 2026-10-18 (F4)

- cenario 12: **18/18** verdes (era 15), com os 3 testes novos: flag off ⇒ 404
  **e** `invitation.count() === 0`; a mesma chamada com a flag on ⇒ 201
  (controle positivo, sem o qual o 404 podia ser de qualquer outro motivo); e
  `accept` continua 201 com a flag off — o que **trava** a mutacao de mover a
  guarda para a classe.

## Revisao (v1.7.0 — Fases 5 e 6)

### Onde a implementacao divergiu do plano, e por que

| # | O plano dizia | O que foi feito | Por que (medido) |
|---|---------------|------------------|------------------|
| D-1 | `lib/flags.spec.ts` cobriria "corpo nao-JSON vira `ApiError` (defeito do PR #99)" | **nao** duplicado | `apps/web/lib/api-client.spec.ts:318` ja tem um teste com esse nome literal: "corpo de erro NAO-JSON (502 de proxy) vira ApiError, nao SyntaxError cru". O plano pediu um caso que ja estava provado; o `flags.spec.ts` cobre o que e **dele** (D14, path, corpo, propagacao de erro) |
| D-2 | F6 teste (1): "a tela reflete **sem reload**" | com **reload**, e o reload e obrigatorio | `defaultChecked` num input uncontrolled so vale na **montagem**. Sem recarregar, o checkbox ja aparece nao marcado porque o **usuario** o desmarcou: a asercao passaria com o PUT descartado. Recarregar remonta o input com o que a API devolveu |
| D-3 | F6 teste (2): "com a flag off, `convidar` responde 404 e com ela on responde **como antes**" | off ⇒ **404**, on ⇒ **403** (`NaoAdministraEmpresaException`) | "como antes" = 201 exige uma empresa de verdade com dono, o que na API de e2e vem de `destino: {tipo:'empresa'}` no `POST /users` — um parametro novo num helper compartilhado por todos os specs. O par 404/403 ja separa os dois desfechos **e o `title` nomeia quem recusou** ("So o dono da empresa pode convidar alguem", `domain-exception-to-http.ts:326-331`). O 403 **nao** substitui o 201 do cenario 12: e um sinal mais fraco, e fica declarado |

### Duas corridas de e2e que o plano nao previa

1. **`next build` nao pega Server Action sem `'use server'`.** Medido: build
   saiu **0** com a diretiva ausente e a rota `/admin/flags` listada na saida; o
   primeiro request respondia "Application error: a server-side exception has
   occurred", digest `2923057904`. A pagina e `force-dynamic`, entao o build so
   a **compila** — quem a executa e o request. Um build verde aqui nao e prova de
   tela.
2. **`click()` resolve quando o clique e despachado, nao quando a Server Action
   volta.** O `pedir()` seguinte saia antes do PUT: **duas execucoes do mesmo
   codigo deram 403 e 404 na mesma posicao, em ordens opostas**. Corrigido
   esperando o **estado** (recarregar e exigir o checkbox novo), nao por
   `waitForTimeout` — a espera correta e uma asercao, e se o save nao persistiu
   ela falha ali, nomeando a causa, em vez de fazer o `pedir()` seguinte mentir.

### MEDIDO 2026-10-18 (F5 e F6)

- `npx vitest run lib/flags.spec.ts` → 7/7 · `components/Sidebar.spec.tsx` → 6/6
  (era 4; os 2 novos)
- `npx tsc --noEmit` (web) → exit 0. **Achado no meio:** com
  `configMock = { getToken: undefined }` sem anotacao, o tipo literal `undefined`
  estreita `getToken?.()` para `never` e o tsc acusa `TS2349` **em codigo que roda
  7/7 verde** — o Vitest nao typecheca. A anotacao do `configMock` e o que segura
  o teste
- `npx next build` → exit 0, `/admin/flags` na tabela de rotas como dinamica
- mutacao do Sidebar: link movido para **fora** do bloco `me?.isAdmin === true`
  ⇒ **1 vermelho** (o negativo tem dente; antes de existir o link ele era verde
  por vacuo)
- `npx playwright test e2e/f14-admin-flags.spec.ts` → **3/3**, e
  `--repeat-each 3` → **9/9** (a corrida acima nao reapareceu)
- gate `checkE2eFlowCoverage` → `ok: true`, "reconciliado sobre **14** fluxo(s) e
  **14** spec(s), com **10** rota(s) de pagina conferidas contra o codigo"

## Revisao adversarial da F4 (v1.8.0)

Revisor distinto do implementador, **mutando o codigo** em vez de le-lo (10
mutacoes proprias + as 4 acima; 2 declaradas invalidas por ele, 1 nao rodada).
Mutacoes que deram **0 vermelho** nao sao "robustez" — sao as que o revisor
procura, e por isso vao na tabela.

| # | Achado | Medicao | Destino |
|---|--------|---------|---------|
| F4-1 | O **corpo** do 404 nao estava preso a nada: trocar o throw por `{code:'FEATURE_FLAG_DESLIGADA', detail:'… está desligada'}` deixava a suite inteira verde. A propriedade que sustenta a decisao 404 era comentario | 0/18 antes | **CORRIGIDO** — `12-onboarding` passa a exigir `code:'NOT_FOUND'` e `detail:'Not Found'`; a mesma mutacao agora da **1 vermelho** |
| F4-2 | O spec do guard e **estruturalmente cego** a chave de metadata: o `Reflector` e mockado devolvendo o valor que o proprio teste escolheu, entao `featureFlags.key` pode virar `featureFlag.key` e nenhum dos 8 testes ve | 0 unit / **2 e2e** | **DECLARADO** — e a forma "espelhar a arvore onde nao ha costura": o sujeito (`Reflector`) e real, o fio e falso |
| F4-3 | O ramo `req.user === undefined => 403` e **codigo morto em producao**: com o guard na frente do `JwtAuthGuard` no handler, quem nao tem token leva **401** do guard de CLASSE | mutacao da checagem: 1 unit / 0 e2e | **DECLARADO** — o texto `'autenticação requerida'` tambem destoa do `{code, detail}` do resto do HTTP |
| F4-4 | `@UseGuards(FeatureFlagGuard, JwtAuthGuard)` invertido e **no-op**, confirmado ao vivo (nao so por 0 vermelhos) | 0/0 | **DECISSAO** — registrado porque e do tipo de linha que parece significado e nao tem |
| F4-5 | O raio de alcance de `tenancy.invites` e **maior que `POST /tenants/:id/invitations`**: `POST /users` com `destino:{tipo:'convite',token}` cria conta e membership com a flag DESLIGADA (201, membership 2) | HTTP+banco reais | **CORRIGIDO** — escrito no cabecalho do guard. Decisao, nao bug: e o `accept` por outra porta, e o token so existe se foi emitido antes do desligamento |
| F4-6 | O 404 e indistinguivel **so por `code`**: `detail` difere do 404 de rota inexistente (`Not Found` vs `Cannot POST …`), entao o front tambem nao distingue "convites desligado" de "empresa nao existe" | lado a lado | **CONSEQUENCIA DECIDIDA** — e o preco do 404. Se a UI precisar dizer "desligado", o formato atual nao comporta sem codigo novo |
| F4-7 | Com a flag OFF, um uuid **malformado** responde 404 e nao o 400 do `ZodValidationPipe` — guards rodam antes de pipes. Quem alcanca a rota le o estado da flag | medido | **DECLARADO** — severidade desprezivel (o mesmo ator ja leva 404 de qualquer jeito), mas o nome que a fase da a isso e mais forte que a implementacao |
| F4-8 | Mapa de cobertura das 3 falhas de DI: `@Inject(PORT)` so pelo **e2e** (12 vermelhos); `@Inject(Reflector)` e aresta de modulo so pelo **spec de modulo** (1 vermelho cada) | medido | **DECLARADO** — rodar so a suite unit achando que ela cobre a fase deixa 2 das 3 passarem |
| F4-9 | A coluna `version` nao tem leitor, e o guard chama `listar()` a cada request, sem cache | leitura | **DECISSAO** — para uma kill-switch e o comportamento desejado; `version` fica sem consumidor ate existir cache |
| F4-10 | O revisor **vazou uma propria mutacao** na arvore entre medições (a ordem invertida ficou) e so achou na conferencia de md5 final | 2 linhas, restauradas por `Edit`; 4 arquivos conferidos byte a byte contra backup | **LICAO DO REPO, nao dele** — backup/restore so e evidencia se o md5 for conferido depois de CADA mutacao, nao no fim |

Veredito do revisor, que concordo: **404 em vez de 403 esta certo e a
justificativa se sustenta** — com uma ressalva que a fase nao registrava, o404
e uniforme *para quem ja passou pela tenancy* (e nao para o conjunto de atores),
e a propriedade "o corpo nao diz que a flag existe" nao tinha dente (F4-1, agora
tem).

## Revisao adversarial das F5 e F6 (v1.9.0)

Revisor distinto, mutando o codigo. O que **sobreviveu** (e o numero que prova):

| Mutacao | Resultado |
|---------|-----------|
| `getTenant` de volta em `lib/flags.ts` | **2 vermelhos** (o GET e o PUT), pela propriedade, com a mensagem nomeando `getTenant` |
| `href="/admin/flags"` → `"/admin/flags-WRONG"` | **1 vermelho**, no teste do admin |
| link do Sidebar para fora do bloco `isAdmin` | **1 vermelho**, no teste do "usuário comum NÃO vê" |
| `/admin/flags` → `/admin/naoexiste` na linha F14 do inventario | gate **vermelho** ("a rota existe no código e não aparece na coluna Rota") |
| linha F14 deletada | gate vermelho com as **duas** accusations (spec sem fluxo + rota sem linha) |

E o detalhe que contraria o medo padrao da classe "gate ciego": o
`check-e2e-flow-coverage.ts:60,158,383` usa **`readdirSync`, nao `git ls-files`** —
ele enxerga arquivo untracked, e o `git add -N` nao foi necessario para medilo.

### Achado A5 — o comentario estava invertido (CORRIGIDO)

O spec afirmava que `toHaveCount(0)` na tabela e o que separa "recusou" de
"renderizou". MEDIDO pelo revisor em 3 execucoes: com o guard neutralizado, a
pagina vira o digest de erro do Next — e um digest **tambem** tem zero tabela,
zero chave e zero link. As contagens passam com a tela em 500. Quem diz "recusou"
e o heading; as contagens dizem "nao entregou o dado".

Corrigido: o comentario foi reescrito e o spec passou a exigir
`await expect(page.locator('main')).toHaveCount(1)` — a linha que separa uma
pagina de recusa de um digest de erro.

### A4 — o par 404/403 medido (fechei eu, com a janela livre)

Trocar `NotFoundException` por `ForbiddenException` no `feature-flag.guard.ts:71`
e rodar so o `f14`: **1 vermelho**, e na posicao certa —

```
✘ 2 › a flag que o admin desliga na tela é a que a rota de convites respeita
    > 106 | expect(desligada.status()).toBe(404)
      Expected: 404   Received: 403
```

O teste 1 (a tela persiste o que foi salvo) continua **verde** com a mutacao, o
que e a particao correta: ele mede o save, e o teste 2 mede que o desfecho da
rota e o que a flag mudou. Restaurado, md5 conferido, **3/3**.

### Achado de tela, FORA do escopo desta fase — declarado, nao corrigido

Duas coisas que o revisor mediu e que nao sao regressao desta fase:

1. **Nao ha fronteira de erro em lugar nenhum do app**: `ls apps/web/app/**/error.tsx`
   nao devolve nada, e `page.tsx:44` faz `await listarFeatureFlags()` sem `try`.
   Quando a chamada falha, o admin ve a pagina opaca do Next, **em ingles**, com
   digest — MEDIDO: `Digest: 2073873883`.
2. **`obterMeuPerfil()` engole toda falha em `null`** (`lib/perfil.ts:60-74`), e a
   pagina mapeia `me === null` para "Acesso restrito". Entao **rede caida produz
   "Esta pagina exige perfil de administrador"**, que e uma afirmação falsa sobre o
   ator.

Por que nao corrigi aqui: o precedente `app/admin/profiles/page.tsx:20-23` faz
**exatamente** o mesmo (`me === null || me.isAdmin !== true`), e a separacao
exigida pelo comentario de `perfil.ts:69-72` ("quem quiser distinguir faz isso na
pagina") mudaria `obterMeuPerfil`, que e compartilhado pelo `Sidebar` e pelo F13.
E uma demanda nova (fronteira de erro do app), nao um efeito colateral das flags.

### O que o revisor NAO mediu (fica declarado)

- **A3** — `revalidatePath` provavelmente nao e exercitado pelo F14: o spec usa
  `irPara('/admin/flags')` (um `goto` completo) depois de cada save, e um `goto`
  ignora o Router Cache. Nao e codigo morto — ele trabalha para quem navega em
  soft-navigation — e o **spec** e que nao o exercita.
- **A2** — o "checkbox desmarcado nao e enviado, e a ausencia E o false" e
  sustentado pelo ciclo inverso do teste 1 (desmarca → salva → recarrega →
  exige desmarcado), mas nao por um teste dedicado a essa frase.
