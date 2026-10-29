# Catálogo de rotas — `apps/web`

> Medido em **2026-10-29**. Fonte da verdade: o código de `apps/web/app/**`,
> `apps/web/lib/**` e `apps/web/components/**`. Este doc é **reference**
> (Diátaxis): responde "o que é isto, exatamente?", não "como eu faço X?".
>
> O gate [`check-doc-coverage`](../../.tooling/scripts/ci/check-doc-coverage.ts)
> mede este arquivo: para cada `page.tsx` / `route.ts` sob `apps/web/app/`, o
> **path relativo ao repo** tem de aparecer aqui. É por isso que a coluna
> **Arquivo** traz o path completo (`apps/web/app/...`) e não só a URL.

## §1. Como ler

| Coluna | Significado |
|---|---|
| **Rota** | URL pública. Segmentos dinâmicos aparecem como `[param]`. |
| **Arquivo** | Path relativo ao repo — a chave que o gate mede. |
| **Server ou Client** | `Server Component` roda no servidor Node; `Route Handler` é um `route.ts`. **Nenhuma das 13 páginas é Client Component**: a interatividade chega por Client Component filho (ver §6). |
| **O que faz** | Uma frase, com o que a pessoa vê. |
| **Guard** | O que impede o acesso quando a pessoa não tem o que precisa. |

O guard de `/admin/*` é compartilhado e **distingue três causas** —
`apps/web/app/admin/guard-admin.tsx`:

| Situação | Resposta |
|---|---|
| Sem sessão / `401` | `redirect('/login')` |
| `403` | Tela "Acesso restrito" |
| `5xx` / timeout / rede | Tela "Serviço indisponível", com botão de recarregar |

## §2. Rotas públicas

| Rota | Arquivo | Server ou Client | O que faz | Guard |
|---|---|---|---|---|
| `/` | `apps/web/app/page.tsx` | Server Component | Tela inicial; texto estático "Projeto Base". | — |
| `/login` | `apps/web/app/login/page.tsx` | Server Component | Formulário de login. Traduz `?cadastrado=1`, `?empresa=1` e `?convite=<token>` em aviso na tela. | — |
| `/users/novo` | `apps/web/app/users/novo/page.tsx` | Server Component | Cadastro de usuário. Aceita `?convite=<token>` e repassa o token ao formulário. | — (`POST /users` é `@Public()` na API) |

> ⚠️ `/users/novo` é pública **por escolha**: exigir sessão ali só fechava a
> porta de quem ainda não tem conta. A listagem `/users` é a protegida.

## §3. Rotas autenticadas

| Rota | Arquivo | Server ou Client | O que faz | Guard |
|---|---|---|---|---|
| `/users` | `apps/web/app/users/page.tsx` | Server Component | Lista os usuários da empresa (`GET /users?limit=20`). Botão "Sair". | `exigirSessao()` → `redirect('/login')`. `401` da API também vai ao login. |
| `/empresa/nova` | `apps/web/app/empresa/nova/page.tsx` | Server Component | Cria a empresa; quem cria entra como gerente. | `exigirSessao()` → `redirect('/login')`. |
| `/me/profile` | `apps/web/app/me/profile/page.tsx` | Server Component | Perfil do usuário logado e as permissões efetivas (read-only). | `obterMeuPerfil()`: `401`/`403` → login; `5xx`/timeout/rede → "Serviço indisponível". |
| `/convite/[token]` | `apps/web/app/convite/[token]/page.tsx` | Server Component | Porta de entrada do convite. Sem sessão, manda para `/users/novo?convite=<token>`; com sessão, mostra o botão de aceitar. | Token precisa casar `ehTokenDeConvite` (64 hex); fora disso, "Convite inválido". |

> ⚠️ `/me/profile` **não** usa o guard compartilhado de §1: ele trata o `403`
> como `redirect('/login')`, e não como "Acesso restrito". O `catch` da página
> (`apps/web/app/me/profile/page.tsx:43`) cobre `401` **e** `403` no mesmo
> ramo — o oposto do guard, onde `403` é a tela de acesso restrito. O
> comportamento do **código** é o que está na tabela acima; o comentário da
> página descreve a distinção do guard, que ela não implementa.

## §4. Rotas de administração

| Rota | Arquivo | Server ou Client | O que faz | Guard |
|---|---|---|---|---|
| `/admin/users` | `apps/web/app/admin/users/page.tsx` | Server Component | Atribui ou troca o perfil de cada usuário (um `select` + "Salvar" por linha). | `exigirSessao()` + `exigirAdmin()` — `isAdmin` **da empresa**. |
| `/admin/profiles` | `apps/web/app/admin/profiles/page.tsx` | Server Component | Lista de perfis (slug, admin, sistema, nº de permissões). | `exigirAdmin()` — `isAdmin` **da empresa**. |
| `/admin/profiles/new` | `apps/web/app/admin/profiles/new/page.tsx` | Server Component | Cria um perfil: slug, nome, descrição e permissões iniciais. | `exigirAdmin()` — `isAdmin` **da empresa**. |
| `/admin/profiles/[slug]` | `apps/web/app/admin/profiles/[slug]/page.tsx` | Server Component | Detalhe do perfil: flags, metadados e permissões. | `exigirAdmin()` — `isAdmin` **da empresa**. |
| `/admin/flags` | `apps/web/app/admin/flags/page.tsx` | Server Component | Liga e desliga feature flags, para o sistema inteiro. | `exigirAdminDoSistema()` — `isAdmin` **global** (`tenantId === null`). |
| `/admin/tenancy` | `apps/web/app/admin/tenancy/page.tsx` | Server Component | Inventário da tenancy: empresas com seus membros, e usuários com suas empresas. Leitura pura. | `exigirSessao()` + `exigirAdminDoSistema(accessToken)` — `isAdmin` **global**. |

> ⚠️ Os dois `isAdmin` **não são a mesma pessoa**: o da empresa é o perfil de
> DONO (`true` em toda empresa nova), e o global é o do bucket de SISTEMA.
> `/admin/flags` e `/admin/tenancy` exigem o global — autorizar pelo sinal
> errado mostraria a base inteira para um gerente que a API recusa.

## §5. Route Handler

| Rota | Arquivo | Server ou Client | O que faz | Guard |
|---|---|---|---|---|
| `/api/health` | `apps/web/app/api/health/route.ts` | Route Handler (`GET`) | Responde `{ status: "ok", timestamp }`. `force-dynamic`. | — |

## §6. Server Actions

Duas formas no repo: **arquivo** com `'use server'` no topo (5) e **inline**,
declarada dentro do `page.tsx` (5) — **10 no total** (contagem reproduzida em
§11). As duas são invocadas por `<form action={...}>`.

### 6.1 Em arquivo (`'use server'` no topo)

| Action | Arquivo | O que faz | Redirect |
|---|---|---|---|
| `entrar` | `apps/web/app/login/actions.ts` | Valida com o schema Zod, `POST /auth/login`, grava os dois tokens em cookie `httpOnly` e decide a empresa da sessão. | `/users`, `/empresa/nova` ou `/convite/<token>`. |
| `sair` | `apps/web/app/users/actions.ts` | Apaga os cookies de sessão (os dois tokens **e** a empresa). | `/login`. |
| `cadastrarUsuario` | `apps/web/app/users/novo/actions.ts` | Valida e `POST /users`; com token, manda `destino.tipo='convite'`. | `/login?cadastrado=1`. |
| `criarEmpresaDoAtor` | `apps/web/app/empresa/nova/actions.ts` | `POST /tenants` e grava o cookie `tenant_id` da empresa nova. | `/users` (ou `/login?empresa=1` em `401`). |
| `aceitarConviteDoAtor` | `apps/web/app/convite/[token]/actions.ts` | `POST /invitations/accept` e grava o cookie `tenant_id` da empresa que convidou. | `/users` (ou `/login?convite=<token>` sem sessão / em `401`). |

### 6.2 Inline (dentro da página)

| Action | Arquivo | O que faz | Redirect |
|---|---|---|---|
| `atribuir` | `apps/web/app/admin/users/page.tsx` | Decide atribuir ou remover e faz `PUT /admin/users/:userId/profile`. | — (`revalidatePath('/admin/users')`). |
| `create` | `apps/web/app/admin/profiles/new/page.tsx` | Normaliza o slug e faz `POST /admin/profiles`. | `/admin/profiles/<slug>`. |
| `salvarMetadados` | `apps/web/app/admin/profiles/[slug]/page.tsx` | `PATCH /admin/profiles/:id` (nome e descrição). | — (`revalidatePath`). |
| `saveAuthorizations` | `apps/web/app/admin/profiles/[slug]/page.tsx` | `trocarPermissoes()` — revoga antes de conceder, uma chamada por permissão. | — (`revalidatePath`). |
| `alternar` | `apps/web/app/admin/flags/page.tsx` | `PUT /admin/feature-flags/:chave` com o estado final da linha. | — (`revalidatePath('/admin/flags')`). |

> ⚠️ `salvarMetadados` e `saveAuthorizations` **não engolem erro**: sem
> `revalidatePath`, o erro sobe e a tela não recarrega fingindo sucesso sobre um
> estado parcial.

## §7. Client Components

Seis arquivos com `'use client'` (fora de specs):

| Componente | Arquivo | Por que é client |
|---|---|---|
| `LoginForm` | `apps/web/components/login-form.tsx` | Valida no navegador enquanto a pessoa digita; `useActionState` + `startTransition`. |
| `CadastroUsuarioForm` | `apps/web/components/cadastro-usuario-form.tsx` | Idem, para o cadastro de usuário. |
| `EmpresaForm` | `apps/web/components/empresa-form.tsx` | Idem, para a criação de empresa. |
| `AceitarConvite` | `apps/web/app/convite/[token]/aceitar-convite.tsx` | `useActionState` para mostrar o erro na tela do convite. |
| `ErroDePagina` (default) | `apps/web/app/error.tsx` | Recebe o `reset()` do React — o Server Component que lançou já terminou. |
| `WebVitalsReporter` | `apps/web/src/telemetry/web-vitals-reporter.tsx` | Registra os callbacks de `web-vitals` no browser. |

> ⚠️ `apps/web/components/Sidebar.tsx` está na pasta de componentes, mas
> **não** é Client Component: é um Server Component async que decide no
> servidor se desenha o link "Admin".

## §8. Telemetria do browser

| Onde | Arquivo | O que faz |
|---|---|---|
| Web Vitals | `apps/web/src/telemetry/web-vitals-reporter.tsx` | Registra LCP, CLS, INP, FID e TTFB em histogramas OTel `web.vitals.{lcp,cls,inp,fid,ttfb}` (meter `projeto-base-web`). Side-effect no module-load, guardado por `typeof window !== 'undefined'`. |
| SDK web | `apps/web/instrumentation-client.ts` | `WebTracerProvider` + `OTLPTraceExporter` para `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT`; auto-instrumenta `fetch`, `document-load` e `user-interaction`. A URL precisa ser **absoluta** — relativa o exporter lança e aborta a hidratação. |
| SDK servidor | `apps/web/instrumentation.ts` | Shim por runtime: `nodejs` → `instrumentation.node.ts` (NodeSDK); `edge` → `instrumentation.edge.ts` (stub, sem efeito). |

## §9. Sessão e cookies

`apps/web/lib/sessao.ts`:

| Cookie | `httpOnly` | Para que serve |
|---|---|---|
| `access_token` | sim | Vai em `Authorization: Bearer` de todo request. Vive 15 min (TTL da API). |
| `refresh_token` | sim | Só renova o access. **Não abre porta nenhuma**: `exigirSessao()` olha exclusivamente o access. |
| `tenant_id` | **não** | A empresa em que a sessão age. Legível pelo JS de propósito — não é segredo, e um cookie `httpOnly` obrigaria toda troca de empresa a passar por Server Action. |

Atributos: `sameSite: 'lax'`, `path: '/'`, `secure` só em produção, e **sem
`maxAge`** — são cookies de sessão, então fechar o browser encerra a sessão.

> ⚠️ `cookies()` só **escreve** em Server Action ou Route Handler. Ler é
> permitido em qualquer lugar do servidor. No Next 15 `cookies()` é assíncrono.

## §10. Cliente HTTP

`apps/web/lib/api-client.ts` — o único caminho do web até a API:

- **Base URL**: `process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1'`.
- **Headers**: `authorization: Bearer <token>` (só quando há token),
  `x-tenant-id` (só quando há empresa — string vazia viraria `400`
  `INVALID_TENANT`), e `content-type: application/json` **só quando há corpo**
  (o Fastify recusa `DELETE` sem corpo que declare JSON).
- **Timeout**: 10 s por padrão, sobrescrevível por request (`init.timeoutMs`),
  via `AbortController`.
- **Erros**: `ApiError` carrega o Problem Details RFC 7807 (`code`, `status`,
  `errors[]`, `traceId`); `ApiTimeoutError` distingue "tempo esgotado" de
  "erro genérico". Corpo de erro que não é JSON vira um Problem Details
  sintético com `code: 'UNKNOWN'`.
- **Resposta vazia** (`204`) devolve `undefined` — não faz parse.

## §11. Como reproduzir as contagens

```bash
# 14 rotas do App Router (13 páginas + 1 route handler)
find apps/web/app -name 'page.tsx' -o -name 'route.ts' | wc -l

# 5 Server Actions em arquivo com 'use server' no topo
grep -rlE "^'use server';[[:space:]]*$" apps/web/app --include=actions.ts | wc -l

# 5 Server Actions inline (dentro de page.tsx)
grep -rhE "^[[:space:]]*'use server';[[:space:]]*$" apps/web/app --include=page.tsx | wc -l

# 10 Server Actions no total (5 em arquivo + 5 inline)
{ grep -rlE "^'use server';[[:space:]]*$" apps/web/app --include=actions.ts | wc -l; \
  grep -rhE "^[[:space:]]*'use server';[[:space:]]*$" apps/web/app --include=page.tsx | wc -l; \
  } | awk '{s+=$1} END {print s}'

# 6 Client Components (fora de specs)
grep -rl "^'use client'" apps/web --include=*.tsx --include=*.ts | grep -v '\.spec\.' | wc -l
```

> ⚠️ As duas contagens de Server Action ancoram a diretiva na **linha inteira**
> (`…;$`), e não numa substring solta. `apps/web/app/admin/flags/page.tsx`
> menciona `'use server'` num **comentário** (linha 32, sobre o build que
> passou com a diretiva ausente) — um `grep "'use server'"` sem âncora conta
> esse comentário e devolve **6**, não 5.

## §12. Ver mais

- Contrato entre web e api: [`packages/shared-types/README.md`](../../packages/shared-types/README.md)
- Referência HTTP da API: [`docs/api/`](../api/)
- Runbook (como subir o ambiente): [`docs/como-rodar.md`](../como-rodar.md)
- Versões das stacks: [`docs/STACK.md`](../STACK.md)
- Convenção de documentação: [`.agents/specs/conventions/documentacao.md`](../../.agents/specs/conventions/documentacao.md)
