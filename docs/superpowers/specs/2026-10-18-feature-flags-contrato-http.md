# Contrato HTTP — Feature flags (admin do sistema)

> Documento: parte da feature [`2026-10-18-feature-flags.md`](../plans/2026-10-18-feature-flags.md)
> · Log de revisões: [`…-revisoes.md`](../plans/2026-10-18-feature-flags-revisoes.md)

> ⚠️ **Este contrato foi escrito contra o MEDIDO, não contra a leitura.** Todos os
> corpos de resposta abaixo saíram de uma sonda e2e que chamou as rotas no app
> real e despejou o corpo; a sonda foi apagada depois. Quando este documento e
> uma spec divergirem, **a spec ganha** — e este documento está errado.

## §1. Convenções

- **Base path**: `/api/v1` (prefixo global em `main.ts:40`).
- **Erros**: RFC 7807, serializado pelo `GlobalExceptionFilter` **de todo o app**.
- **Autenticação**: `Authorization: Bearer <jwt>` (`JwtAuthGuard` no `@UseGuards`).
- **Content-Type**: `application/json; charset=utf-8`.
- **Versionamento**: sem `If-Match`, sem `version` na resposta (decisão **D16**).
  O PUT é o estado **inteiro** do recurso, não um patch. ⚠️ Isto **desvia da
  convenção do próprio repo**: `users.controller.ts` manda `ETag: W/"v<n>"` em
  toda resposta mutante e exige `If-Match`. O recurso de flags não tem
  `version` para optimistic locking — a coluna existe na tabela, mas o
  repositório não a escreve nem a lê.
- **Cache**: nenhuma resposta de flags leva `ETag` nem `Cache-Control`. Duas
  leituras seguidas podem ver estados diferentes.

## §2. Endpoints

| Método | Path | Descrição | Auth | Status |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/feature-flags` | Catálogo inteiro + estado efetivo | `admin.manage-feature-flags` + **D2** | implementado |
| `PUT` | `/api/v1/admin/feature-flags/:chave` | Liga/desliga UMA chave | `admin.manage-feature-flags` + **D2** | implementado |

`:chave` não é livre: precisa constar em `FEATURE_FLAGS`
(`apps/api/src/shared/auth/feature-flag-catalog.ts`). Chave fora do catálogo →
`400 FEATURE_FLAG_CHAVE_INVALIDA`.

## §3. Schemas

```typescript
// GET → 200 — um item por chave do CATÁLOGO, sempre na ordem do catálogo
type FeatureFlagDto = {
  chave: string;      // estável; o que o admin envia e o guard lê
  descricao: string;  // texto que a tela mostra; vem do servidor
  ativada: boolean;   // estado EFETIVO (ver D4 em §5)
};

// PUT request body
type UpdateFeatureFlagInputDto = { ativada: boolean };

// PUT → 200 — o recurso depois de gravado
type FeatureFlagDto;
```

`FeatureFlagDto` e `UpdateFeatureFlagInputDto` vivem em
`packages/shared-types/src/feature-flag.ts`, e o web importa de lá: não há
shape duplicado à mão.

**Campos a mais no corpo são descartados silenciosamente (MEDIDO).** `PUT` com
`{ativada: true, chave: 'tenancy.exports', descricao: 'injetado'}` devolve
**200** e ignora os dois extras — o Zod faz `strip`. A chave é a do **path**, e
um `chave` no corpo não redireciona o recurso. Um cliente que manda corpo
adicional não recebe erro, o que é a escolha padrão do Zod e não um
esquecimento: recusar exigiria `.strict()`, que rejeitaria também campos que o
cliente adiciona adiante sem quebrar nada.

## §4. Respostas de sucesso (MEDIDO)

```http
GET /api/v1/admin/feature-flags
→ 200
[
  {
    "chave": "tenancy.invites",
    "descricao": "Emissão e aceite de convites por empresa. Desligar tranca as três portas: convidar, aceitar e criar conta por convite.",
    "ativada": true
  }
]
```

```http
PUT /api/v1/admin/feature-flags/tenancy.invites     {"ativada": false}
→ 200
{
  "chave": "tenancy.invites",
  "descricao": "Emissão e aceite de convites por empresa. Desligar tranca as três portas: convidar, aceitar e criar conta por convite.",
  "ativada": false
}
```

⚠️ O PUT **não relê o banco depois de gravar**: o corpo devolvido é montado do
input + catálogo. É o que a listagem seguinte mostraria, e economiza um `listar`
por clique do admin.

## §5. Semântica da chave ausente (D4)

**Chave sem linha no banco é ATIVADA.** O sistema nasce ligado; a linha só
existe para dizer "desligada". Consequências:

- chave nova no catálogo **não apaga funcionalidade nenhuma**, mesmo sem migration;
- `GET` sempre devolve **todas** as chaves do catálogo — nunca um subconjunto
  correspondente ao que há gravado;
- o cliente **nunca** infere estado por ausência: lê o booleano.

## §6. Autorização — quem é barrado, e por quem

Duas camadas. A segunda é a que **decide** quem é administrador do sistema — mas a
primeira também recusa, e como as duas devolvem o mesmo `code`, isso muda o
que o cliente consegue concluir:

1. `@RequirePermission('admin.manage-feature-flags')` em cada handler.
2. **D2**, dentro da use case: `tenantId === null && isAdmin`.

⚠️ **D2 é o portão, mas não é o ÚNICO recusor.** O passo 1 recusa antes dele —
e recusou de verdade, com MEDIDO: o signup de empresa concede
`listAllPermissions()` ao dono, mas isso vale para empresa **criada a partir
desta versão**. `grep -rl "manage-feature-flags" apps/api/prisma/migrations/`
devolve **zero** — nenhuma migration faz backfill de `authorizations`. Então o
dono de uma empresa **anterior** não tem a chave no banco, e o
`PermissionsGuard` barra ele em `permissions.guard.ts:110` **antes** de D2.

O desfecho é o mesmo `403 FORBIDDEN`, e é por isso que este parágrafo é
delicado: **o `code` não distingue quem recusou**, porque os dois recusores
devolvem o mesmo `code`. O que os distingue é o `detail` — o do guard nomeia a
permissão exigida, o de D2 diz que só o administrador do sistema alterna
funcionalidades. Um cliente que decide por `code` vai dizer "você não é admin"
para alguém que é dono de empresa, e a orientação está errada; quem precisa
saber quem recusou tem que comparar o `detail` (ver §7).

`ForbiddenException` do Nest, não uma exceção de domínio nova: o
`GlobalExceptionFilter` resolve `HttpException` antes do mapper de domínio.

⚠️ **`X-Tenant-Id` QUEBRA a rota** (MEDIDO). Com o header, o ator sai do bucket
global e leva `403 TENANT_MEMBERSHIP_REQUIRED` — *antes* de D2, e com uma
mensagem que fala em empresa. Cliente que manda o header tem tela quebrada sem
ver por quê: por isso `apps/web/lib/flags.ts` se recusa a montá-lo.

## §7. Erros (MEDIDO, corpo completo)

O `title` é o **nome do status HTTP em maiúsculas** (`NOT_FOUND`,
`BAD_REQUEST`, `FORBIDDEN`, `UNAUTHORIZED`), não um título RFC 7807 — é o que o
`GlobalExceptionFilter` produz e vale para o app inteiro.

| Situação | Status | `code` | `detail` |
|---|---|---|---|
| sem token | `401` | `UNAUTHORIZED` | `Sessão ausente ou inválida. Autentique-se para acessar este recurso.` |
| com token, sem D2 | `403` | `FORBIDDEN` | `só o administrador do sistema alterna funcionalidades do sistema` |
| com token, **sem a chave no banco** (§6) | `403` | `FORBIDDEN` | `permissão requerida ausente: precisa de uma de [admin.manage-feature-flags]` |
| com `X-Tenant-Id` | `403` | `TENANT_MEMBERSHIP_REQUIRED` | `A conta autenticada não pertence à empresa informada em X-Tenant-Id.` |
| chave fora do catálogo | `400` | `FEATURE_FLAG_CHAVE_INVALIDA` | `a chave precisa constar no catálogo de flags` |
| `ativada` não booleano / ausente | `400` | `VALIDATION_ERROR` | `Falha de validação` |
| rota inexistente | `404` | `NOT_FOUND` | `Cannot GET /api/v1/admin/feature-flags-xyz` |

Há **três** 403 na tabela, e eles não se distinguem pelo `code`:

- `X-Tenant-Id` → `TENANT_MEMBERSHIP_REQUIRED`, **o único `code` exclusivo**.
  Distingue "mandou header de empresa" de "não é admin", e o cliente pode
  decidir por ele.
- os outros dois → o mesmo `FORBIDDEN`. Quem recusa muda — o `PermissionsGuard`
  (falta a chave no banco) ou D2 (`tenantId !== null`) — mas o `code` é
  idêntico, e só o `detail` diz qual dos dois foi.

⚠️ **Este parágrafo já esteve errado duas vezes, em sentidos opostos.** A
primeira versão dizia que os dois 403 usavam o **mesmo** `code` e só o
`detail` diferenciava — o que contradizia a tabela logo acima (o header dá
outro `code`). A correção seguinte disse que o `code` **é** a distinção — o que
era verdade para o par header×D2 e **falso** assim que a terceira linha entrou
na tabela: `PermissionsGuard` e D2 compartilham `FORBIDDEN`. Regra que sobra:
**antes de dizer "o `code` distingue isto", conte as linhas da tabela que
compartilham esse `code`.** Um `code` é exclusivo só quando aparece uma vez.

### §7.1 `errors[]` do `VALIDATION_ERROR`

```json
{"field": "ativada", "message": "Expected boolean, received string", "code": "invalid_type"}
```

⚠️ `field` é `"(root)"` quando o corpo **não veio** e `"ativada"` quando veio
`{}` (MEDIDO nos dois). `"false"`, `1` e `0` são **recusados**, não convertidos:
um toggle que aceitaria `"false"` como verdadeiro desligaria a funcionalidade
sem ninguém ter clicado em nada. `z.boolean()` e não coerção — é decisão.

## §8. O efeito no resto do sistema — e o que ele NÃO cobre

Uma chave desligada não muda a resposta desta API. Ela muda a das rotas que
declaram `@RequireFeatureFlag`, e a forma é **404**, não 403:

```http
POST /api/v1/tenants/:id/invitations     (com tenancy.invites DESLIGADA)
→ 404
{"type":"https://errors.projeto.com/NOT_FOUND","title":"NOT_FOUND","status":404,
 "detail":"Not Found","instance":"POST /api/v1/tenants/<id>/invitations",
 "code":"NOT_FOUND","traceId":"req-k"}
```

Com a chave religada, a mesma chamada responde **201** (MEDIDO, os dois lados).

⚠️ **O corpo é genérico de propósito.** `detail: "Not Found"` é idêntico ao de
uma rota que não existe. Se o corpo nomeasse a flag, qualquer cliente — e
qualquer scanner externo — leria que existe um interruptor. A F4 mediu o
contrapartida: com o corpo anunciando, os 18 testes do cenário 12 ficavam
**verde**; a aserção que fixa o corpo genérico faz a mesma mutação dar 1
vermelho.

⚠️ **O raio de alcance tem TRÊS portas, e as três respondem 404.** O decorator
`@RequireFeatureFlag` cobre duas (`POST /tenants/:id/invitations` e
`POST /invitations/accept`). A terceira — `POST /api/v1/users` com
`destino: {tipo: 'convite', token}` — é `@Public()`, e o `FeatureFlagGuard`
exige `req.user`, que rota pública nunca recebe (`jwt-auth.guard.ts:170-172`).
A checagem mora no `create()`, depois do Zod, no único ponto onde
`destino.tipo` é conhecido.

⚠️ **A ordem entre 400 e 404 é assimétrica entre as portas, e é a ordem certa.**
`ZodValidationPipe` resolve antes do handler, então um `destino.convite`
malformado responde **400** com a flag ligada *ou* desligada — a validação vem
antes da autorização, e o 400 não revela nada da flag. Com corpo bem formado e
flag desligada, as três portas respondem **404**.

⚠️ **O que o desligamento NÃO faz, e isso é recorte, não brecha.**
`destino: {tipo: 'empresa'}` continua **201** com a flag desligada: `empresa` não
usa token de convite e cria owner. O corte é em `convite`, não em "tem
`destino`" — testado em `12-onboarding.e2e.spec.ts:724`.

## §9. O que este contrato NÃO garante

- **Nada de `version`/ETag.** Duas leituras seguidas podem ver estados
  diferentes, e dois admins salvando ao mesmo tempo o último grava.
- **`x-tenant-id` não é opcional na prática** — ele quebra (§6).
- **O guard lê o banco a cada request** da rota protegida. Não há cache; a coluna
  `version` da tabela existe e não tem consumidor.
- **Não há fronteira de erro no app web.** Falha de rede na tela vira a página
  opaca do Next, e o leitor de perfil engole falha em `null`
  (`perfil.ts:103-107`), então rede caída produz "Esta página exige perfil de
  administrador" — afirmação falsa sobre o ator. **Esta tela chama
  `obterMeuPerfilGlobal()`**, não `obterMeuPerfil()`: o comportamento é o
  mesmo, e a primeira redação deste item citava a função errada para o leitor
  que vier conferir. Mesma forma em `app/admin/profiles/page.tsx`, que é a que
  usa `obterMeuPerfil()`.

## §10. Onde isto é verificado

| O quê | Onde |
|---|---|
| rota, guards, pipe, upsert, D2, 401 | `apps/api/test/e2e/scenarios/13-feature-flags.e2e.spec.ts` |
| 404 do guard **e o corpo genérico** | `apps/api/test/e2e/scenarios/12-onboarding.e2e.spec.ts` |
| `accept` responde **404** com a flag off | idem, cenário 12 |
| as TRÊS portas trancadas com a flag off | `12-onboarding.e2e.spec.ts:551` e `:635` |
| `empresa` continua 201 com a flag off (recorte, não brecha) | `12-onboarding.e2e.spec.ts:724` |
| o bloqueio deixa rastro, e o rastro não leva o token | `users.controller.spec.ts` |
| emenda tela → guarda (HTTP real) | `apps/web/e2e/f14-admin-flags.spec.ts` |
| path, método, D14, escape da chave, erro propaga | `apps/web/lib/flags.spec.ts` |
| corpo de erro NÃO-JSON vira `ApiError` (defeito do PR #99) | `apps/web/lib/api-client.spec.ts:318` — **fora** de `flags.spec.ts` por decisão (D-1 da v1.7.0): o caso é do cliente, não das flags, e duplicá-lo diria que a tela o mede |
| link do menu só para admin | `apps/web/components/Sidebar.spec.tsx` |

## §11. Versionamento deste documento

| Versão | Data | O quê |
|---|---|---|
| 1.0.0 | 2026-10-18 | contrato inicial, escrito contra a sonda e2e das rotas e do 404 do guard |

Atualizar quando: entrar chave nova no catálogo (só a lista de §4 muda), ou
mudar qualquer `code`/`detail` de §7.
