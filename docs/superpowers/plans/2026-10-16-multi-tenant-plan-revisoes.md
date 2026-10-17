# Revisoes do plano multi-tenant

Historico de revisao do plano [\`2026-10-16-multi-tenant-plan.md\`](./2026-10-16-multi-tenant-plan.md).
Ficou em arquivo proprio porque o plano tem limite de 300 linhas e o
historico cresce a cada medicao que corrige uma decisao.

---

## Revisao v1.4.0

Revisao da Fase 3 depois de implementada: um subagente leu o diff procurando
vazamento cross-tenant, e as 8 afirmacoes do plano que ele Tremia foram
conferidas contra o disco. **8 achados, 3 com consequencia de codigo.** O que
muda o plano e o V3.

### V3 — o bucket `null` NAO e deny-by-default (5 comentarios afirmavam que era)

O plano e o codigo diziam, em 5 lugares, que `tenantId = null` e
"deny-by-default / sem perfil de empresa nenhuma". A primeira metade e verdade
(o bucket `null` nunca recebe o perfil de **uma empresa**); a segunda e falsa:

`obterMeuPerfil` resolve `user.profileId()`, coluna **global**. O unico
`isAdmin` do sistema e global (e o seed que o cria — `criar` fixa `isAdmin:
false`). Entao remover o header nao derruba privilegio nenhum: da bypass total.
Medido no codigo, nao em axo.

Isso importa porque a Fase 4 vai construir `tenant_memberships.profile_id`
assumindo que o bucket `null` e seguro como ponto de partida. Nao e. Os 5
comentarios foram corrigidos para dizer o que o codigo faz: bucket `null` = perfil
**global**, e a distincao que o cache garante e "empresa nao contamina empresa",
nao "sem header ninguem pode".

### V4 — `limparSessao` nao apagava a empresa

O cookie `tenant_id` sobrevivia ao logout, e o teste existente **pinava** esse
comportamento (`toEqual([COOKIE_ACCESS, COOKIE_REFRESH])`). Cenario medido: A
escolhe ACME, clica em Sair, B entra no mesmo browser — e toda requisicao de B
sai declarando `X-Tenant-Id: ACME`. Direcao cross-tenant atravessando a fronteira
de sessao. Corrigido no codigo e no teste.

### V5 — `perfil.spec.ts` nao mordia no `getTenant`

`lerTenant` era mockado e **nenhuma assercao o referenciava**; `ApiClient` era
mockado como construtor e o argumento nunca inspecionado. A mutacao `apagar
getTenant` de `perfil.ts` deixava a suite 100% verde. Adicionados 3 testes que
inspecionam a config do construtor; medido que a mutacao agora derruba **exatamente
os 3**, sem colateral.

### V6 — `makeContext` do guard.spec nao montava o request como o Fastify

Achado maior que o reviewer apontei (achado 7): `makeContext` so criava
`request.headers` quando havia `authorization` e jogava o resto no TOPO do
objeto. O teste de rota `@Public()` e o unico que nao manda token — portanto
entregava um `x-tenant-id` num lugar que o guard nunca lia, e passava por **nao
morder**. Corrigido o fixture; a mesma mutacao (extrair o tenant antes do
early-return de `@Public()`) que antes dava 25/25 verde agora derruba 1 teste.

### Sem consequencia de codigo

- **A1** — `AtorAutenticado.tenantId` obrigatorio mas **nao lido** por nenhuma
  trava anti-escalada: as 4 comparam perfil global. O comentario afirmava que o
  campo torna a escalada "estruturalmente incapaz" de confundir empresas.
  Corrigido no codigo e na tabela 3.5 do plano.
- **A3** — `guardarTenant` sem call site: nada escreve o cookie ainda. **Aberto**,
  e e o primeiro item da Fase 5/6 (seletor de empresa).
- **A5** — `guardarTenant` nao valida o UUID; um valor invalido cascateia em 400
  silencioso (o `obterMeuPerfil` engole o erro). Depende de A3.
- **A4** — `getUserProfileAndPermissions` devolve `entry.value` por referencia e o
  `PermissionsGuard` coloca o mesmo array de `permissions` dentro de `req.user`.
  Risco latente, nao defeito hoje (so ha `new Set(...)`, que copia).

---

## Revisao v1.3.0

Duas medidas em Postgres 16 de verdade depois da Fase 2, ambas sobre "a D1
funciona como esta escrita". As duas mudaram o plano.

### V1 — RLS e inerte sob a conexao deste repo

Seis probes no mesmo container, com `ENABLE` + `FORCE ROW LEVEL SECURITY` +
policy instaladas:

| Probe | Resultado |
|-------|-----------|
| `SELECT current_user, usesuper` | `test\|t` — superuser |
| 2 linhas, sem `SET LOCAL` | 2 |
| 2 linhas, `set_config('app.current_tenant', acme)` | **2** |
| `SET ROLE app`, sem `set_config` | 0 (deny-by-default funciona) |
| `SET ROLE app` + `set_config(acme)` | **1** |
| `SET LOCAL ROLE app` + `set_config(outro tenant)` | 0 |

Superuser ignora RLS incondicionalmente e `FORCE` nao se aplica a ele. Entao o
`set_config` sozinho — o produtor que este plano escrevia na Fase 3 — **nao
muda nada**, e teria publicado uma migration que *parece* isolamento e filtra
zero.

A saida existe e foi medida: `SET LOCAL ROLE app` dentro da transacao faz a
policy valer e o conjunto de linhas estreita certo. O preco e que toda query
escopada vira `$transaction` com dois comandos; o raio medido sao 3 tabelas
com `tenant_id` (`profiles`, `tenant_memberships`, `invitations`) em ~6
repositorios que tocam Prisma. O modo de falha de um wrapper esquecido e *ver
linhas de outro tenant sem erro nenhum* — pior que nao ter RLS, porque a
migration se le como protecao. Decisao: RLS sai do caminho critico (§3), com o
pre-requisito exato registrado.

### V2 — `tenant_memberships` nao tem `profile_id`

Duas medidas: `grep -n 'profile_id' .../20261017000000_*/migration.sql` → **1**,
e e um comentario. `schema.prisma:189-206` → `id`, `userId`, `tenantId`,
`role`, `createdAt`, `updatedAt`, `version`. Nenhuma coluna de perfil.

A Fase 2 entregou a tabela da D4 sem o **elo** da D4. A membership carrega so
o rotulo de empresa (`'owner' | 'member'`) e nada que diga qual perfil este
usuario veste *nesta* empresa. Sem a coluna, "perfil diferente por empresa" nao
e representavel, e o `tenantId` de 3.5 chegaria ao `obterMeuPerfil` sem o que
autorizar. Entrou como 3.7.

Um subagente de mapeamento propôs, no item 2,
`prisma.tenantMembership.count({ where: { profileId } })`. Esse campo nao
existe — a proposta nao compilaria, e o raciocinio dela sobre trilha de
auditoria foi construido em cima dele. Descartada.

---

## Revisao v1.2.0

Um defeito meu, achado ao ler `prisma/seed.ts` para checar a Fase 6. **G-004**
afirmava que o banco de dev (`users=1, profiles=0`) deixava a Fase 2 "sem
exercicio" e a Fase 7 "sem sobre o que rodar", exigindo uma "fixture
pre-tenancy". **As duas metades sao falsas:**

- **Fase 2 nao precisa de fixture** — o exercicio dela e a suite e2e, que roda
  em testcontainers: `setupTestDatabase` sobe Postgres novo e aplica as
  migrations (`testcontainers-helper.ts:91`). O proprio CI registra que service
  postgres seria dead code (`ci.yml:158`). O volume do banco de dev nao
  participa.
- **Fase 7 tem sobre o que rodar** — semeia 2 tenants + 2 usuarios dentro do
  proprio spec, no container novo.

E o achado que substitui o problema: **nao existe banco de producao**. Um
backfill precisaria de um tenant padrao para onde apontar, e criar esse tenant e
decisao de produto que a demanda nao pede — ela pede perfis por empresa, nao
uma empresa default. Correcao: **Fase 2 sem backfill**, `users.profile_id` fica
orfa e a Fase 4 muda so o caminho de leitura. `DROP COLUMN` entra em §3 como
decisao adiada, porque `prisma-db-specialist.md:160` exige o tenant padrao antes.

---

## Revisao v1.1.0

Dois subagentes independentes: um procurou erros de estrutura e execucao, o
outro conferiu 20 afirmacoes contra o disco. Resultado: **17 verdadeiras,
2 imprecisas, 1 com premissa falsa**, e 10 defeitos de execucao.

### Defeitos que impediam a execucao

| # | Defeito | Correcao |
|---|---------|----------|
| E1 | Fases 3 e 4 **circulares**: 3.4 passa tenant a `obterMeuPerfil`, que so aceita tenant na Fase 4 | assinatura movida para o change-set da Fase 3 (3.1-3.6) |
| E2 | **RLS na Fase 2 liga deny-all sem produtor** — `SET LOCAL` so chega na Fase 3 | RLS movido para a Fase 3, com produtor e `set_config(..., true)` |
| E3 | **Os indices parciais da D3 sao aditivos**: `profiles_slug_key` continua de pe e anula a customizacao por tenant | `ALTER TABLE profiles DROP CONSTRAINT profiles_slug_key;` antes dos `CREATE INDEX` |
| E4 | **O ramo "convite" da D5 e inalcavel** — nada cria `Invitation` | produtor (`POST /tenants/:id/invitations`) + aceite para conta existente |
| E5 | **`POST /users` e `@Public()`**: sem token, sem tenant hidratado | rotas `@Public()` declaradas isentas de `X-Tenant-Id` |
| E6 | **O gate da Fase 7 nao tem moradia nem ator com tenant** | artefato nomeado (`11-tenant-isolation.e2e.spec.ts`) + `tenantId` no ator (3.5) |

### Defeitos de precisão

- **Contradicao interna:** a §Fase 1 dizia "3 hits" de convencao de backfill e a
  tabela de Evidencia dizia "0". Medido: **3**. E "a fase de backfill nao tem
  dono nem regra" era mais forte que o disco — a regra existe em
  `prisma-db-specialist.md:160`.
- **Citacoes erradas:** `permissions.guard.ts:85` → **:86**; o archive grava em
  `prisma-audit.service.ts:**107**` (o `:45` so cobre o historico); a assinatura
  real e `findByEmail(email: Email)`. "Atravessa 4 controllers" → **3**; os
  specs `f9`-`f13` **nao existem** e foram citados os reais.
- **Evidencia invalida:** `gap_detected` era chamado de "codigo morto" citando um
  comando que **sai em exit 2 (Usage)** — `--demand`/`--paths` sao arquivos e o
  `--paths` faltava. A medicao nunca aconteceu; refeita, a conclusao se
  sustenta por `always_on` incondicional.
