# Plano de correção — 11 achados da revisão do PR #108

Data: 2026-10-18. Origem: revisão read-only do PR #108 (11 achados, 4 🔴).

## 0. Regra que decide a ordem aqui

Nenhum achado entra sem reprodução primeiro. A revisão é read-only e roda numa
máquina diferente da minha, e a #4 provou que "medido" num ambiente não é
"medido" no outro. Então cada linha abaixo diz o que foi **medido aqui**, e as
que não medi ainda assim, dizem o que falta medir antes de mexer.

## 1. Estado: o que foi reproduzido

| # | grav | onde | medido aqui |
|---|---|---|---|
| 1 | 🔴 | `perfilEfetivoNoEscopo` devolve `undefined` onde o contrato pede `null` | **CONFIRMADO** por leitura: o `findMany` do bucket global filtra `profile: { is: { tenantId: null } }`, que exclui quem tem `profileId = NULL` — que é toda conta criada pelo produto |
| 2 | 🔴 | admin do sistema recortado em qualquer listagem com header | **CONFIRMADO por execução**: `somenteUsuarioId = "admin-global"`. A cadeia: `obterMeuPerfil` → `findProfileId` só lê membership → `denied{isAdmin:false}` → `semVinculo && semDireito` → recorte |
| 3 | 🔴 | apertar "Salvar" sem editar apaga o perfil | **CONFIRMADO por leitura**: `profileIdAtual` vem do hidden (`perfilEfetivoNoEscopo`), o `<select>` é alimentado por `GET /admin/profiles` que filtra `tenantId`. Duas fontes, e a segunda não lista perfil global |
| 4 | 🔴 | 78 memórias tombstonadas a partir de medição no diretório errado | **PARCIALMENTE REFUTADO**: no meu ambiente a linha canônica resolve para `/root/.claude/projects/-root-projeto-base/memory` e há **2** arquivos; as 78 não existem aqui. O revisor vê **126** na máquina dele |
| 5 | 🟠 | `/me/profile` sem quem receba a propagação | **CONFIRMADO**: `app/me/profile/page.tsx:16` chama `obterMeuPerfil()` sem `try`, e `apps/web/app` não tem `error.tsx` nem `global-error.tsx` |
| 6 | 🟠 | `.env.production.example` declara senha que a migration não cria | **CONFIRMADO**: migration cria `PASSWORD 'app_runtime_dev'`; o example usa outro valor |
| 7 | 🟡 | `semVinculo` afirma mais que o dado sustenta | **CONFIRMADO**: `findProfileId` devolve `null` para "não pertence" e para "pertence sem perfil" |
| 8 | 🟡 | `erro.status === 401` inalcançável no guard | **CONFIRMADO**: `obterMeuPerfil` converte 401 em `null` antes de propagar |
| 9 | 🟡 | guarda morta `if (!out.has(...))` | **CONFIRMADO**: ramo global retorna antes e há índice único em `(user_id, tenant_id)` |
| 10 | 🟡 | segunda transação por página, para todos | **CONFIRMADO**: `perfilEfetivo` é opcional no port e a query roda sempre |
| 11 | 🟡 | comentário do recorte descreve a forma antiga | **CONFIRMADO**: o comentário fala em "decidir pelo alvo"; a linha implementa dois predicados |

## 2. O que cada correção faz, e o que ela NÃO faz

### F1 — o mapa precisa devolver `null`, não ausência (#1)

O `Map` passa a ser preenchido por **todos** os `userIds` da página, com
`null` para quem não tem perfil. Ausente no mapa = sem vínculo no escopo.

Isto mata também o segundo sintoma do #1: o `deletedAt: null` do bucket global
contradiz o `includeDeleted` da listagem. O filtro some, e o mapa é coerente
com o que a listagem devolveu.

### F2 — o recorte não pode usar `profileId === null` como "não pertence" (#2, #7)

Duas mudanças distintas:

**a) `isAdmin` global sobrevive ao header.** `obterMeuPerfil` com `tenantId` não
resolve o perfil do admin global porque ele vive em `users.profile_id`. O
contorno é o token: `request.user.isAdmin` é o bypass global que o
`PermissionsGuard` já aceita. O recorte passa a considerar esse sinal.

**b) `semVinculo` precisa de um dado que sustente o nome.** Hoje ele é
`profileId === null`, que mistura "não pertence" com "pertence sem perfil". A
separação real exige perguntar à membership, e não ao perfil resolvido. Se o
`isAdmin` de (a) resolver o caso do admin, o resto fica contido por `semDireito`
— que é onde o `users.read` decide.

⚠️ **O teste que hoje "cobre" isto mente.** Ele passa mockando `isAdmin: true`
no perfil devolvido, que é justamente o estado que o fluxo real não produz.
Vou reescrevê-lo para usar o `denied` real.

### F3 — o `<select>` e o hidden não podem discordar (#3)

Duas fontes é a raiz. A correção é o **hidden deixar de ser a fonte de verdade**:
o que decide é o que o `<select>` mostra. Se `perfilEfetivoNoEscopo` não está
na lista de `GET /admin/profiles`, o hidden também não o carrega — e aí salvar
sem editar é no-op, não apagamento.

### F4 — as memórias (#4)

A tombstone está errada **no meu ambiente e provavelmente certa no seu**.
O que eu fiz foi medir o meu `$HOME`, e o corpus de uma máquina não é o de
outra. A correção honesta é:
1. reverter as 78 linhas para a disposição original;
2. escrever no ledger que a medição é **por ambiente** e que o gate só pode
   ser satisfeito onde o corpus existe.

⚠️ Isto vai **reabrir o gate de cristalização** no meu sandbox (as 78 não
existem aqui), e isso é correto: é o gate dizendo a verdade sobre o que ele
consegue medir.

### F5–F11 — o resto

- **F5**: `/me/profile` precisa de tratamento, e o app precisa de um
  `error.tsx` que degrade em vez de 500 cru.
- **F6**: o example tem que declarar a senha que a migration cria, com o aviso
  de trocar fora de banda — senão a guarda do #105 deixa passar o resto.
- **F8**: `erro.status === 401` sai do guard; `obterMeuPerfil` já devolveu
  `null` para 401, e o código que não dispara é código que mente.
- **F9**: guarda morta sai.
- **F10**: a query só roda quando alguém pede o campo.
- **F11**: o comentário passa a descrever a linha.

## 3. Ordem

```
1. F2 antes de F1   — o recorte decide quem é listado; mexer no mapa antes
                      deixaria o bug do admin escondido por um dado errado
2. F1, F9, F10      — o mesmo método, uma passada só
3. F3               — depende de F1 (o hidden lê o campo)
4. F5, F6, F8, F11  — independentes
5. F4 por último    — reabre um gate; melhor nãoembaralhar o resto com ele
```

## 4. Verificação

- **Mutation por correção.** Um teste que passa sem provar nada ocupa o lugar
  de um. Cada F tem a mutação que a derruba.
- **A cadeia do #2 sem mock otimista.** O teste passa pelo `denied` real, não
  por um `isAdmin: true` que o fluxo não produz.
- e2e 42/42, api, web, tooling, `ci:preflight`, `turbo lint typecheck`.

## 5. O que este plano NÃO faz

- **Não** muda o contrato das 24 rotas sobre header não conferido. O #102
  deixou isso escrito e continua valendo: a invariante "nenhuma rota abre
  escopo a partir de header" é decisão de produto.
- **Não** mexe no `check-e2e-flow-coverage` (a lacuna de raiz do #103).
- **Não** tenta recuperar as 78 memórias. Nenhuma cópia existe neste ambiente.
