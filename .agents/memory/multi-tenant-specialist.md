---
agent: multi-tenant-specialist
scope: estratégia de isolamento, fronteira de tenant, escopo de query, RLS, cache por tenant, backfill, gate cross-tenant — arquitetura + auditoria
skill: .agents/skills/multi-tenant-audit/SKILL.md
---

# Memory: `multi-tenant-specialist`

Memory file canônico. **Estado atual: stub inicial** (criado em 2026-10-16
com a Fase 1 do plano `docs/superpowers/plans/2026-10-16-multi-tenant-plan.md`).

## Skill carregada

Carrega `.agents/skills/multi-tenant-audit/SKILL.md` quando a task é de
**auditoria** (o processo determinístico, read-only e offline são os passos
shell). A skill encapsula os passos + dedup + persistência; este arquivo de
memória guarda estado entre execuções.

O resto do tempo (decidir estratégia, desenhar a fronteira, escrever migration)
é papel do **agent**, não da skill.

## Estado atual

- Agent file: `.agents/agents/multi-tenant-specialist.md`
- Primeira aparição: v1.0 (Fase 1 do plano multi-tenant, 2026-10-16)
- Findings emitidos: vide `.agents/runs/findings-<ts>/findings.yaml`

## Decisões fechadas que o agente herda

Registradas aqui porque são o estado que a memória precisa preservar — cada uma
mudou o que o agente checa:

| # | Decisão | Onde |
|---|---------|------|
| D1 | schema único + `tenant_id`, RLS como 2ª camada | plano §1 |
| D2 | contexto por header `X-Tenant-Id` | plano §1 |
| D3 | perfis globais (`tenant_id IS NULL`) + customizados por tenant | plano §1 |
| D4 | 1 conta, N memberships; `email` UNIQUE global | plano §1 |
| D5 | entrada por empresa própria **ou** convite | plano §1 |

> `schema-per-tenant` e `db-per-tenant` estão **fora de escopo** (D1 decidiu
> contra). Se alguém pedir, isso é revisão de D1, não execução.

## Baseline medido (2026-10-16, antes de qualquer código de tenancy)

Números que a primeira auditoria vai reencontrar — o "antes":

| Medida | Comando | Valor |
|--------|---------|-------|
| Models sem `tenantId` | Passo 1.1 da skill | **5/5** |
| `tenantId` no schema | `grep -cE "tenantId" apps/api/prisma/schema.prisma` | **0** |
| Índice em tenant nas migrations | Passo 1.2 | **0** |
| Arquivos com `tenant` em `apps/api/src/modules/` | `grep -rlniE "tenant" apps/api/src/modules/ \| wc -l` | **0** |
| Queries Prisma sem filtro de tenant | Passo 2.1 | **17** |
| Cache com chave sem tenant | Passo 3.3 | **4** (`user-profile-cache.service.ts`, chave = `userId`) |
| RLS (policy ou produtor) | Passo 4 | **0** |
| Spec de isolamento cross-tenant | Passo 5.1 | **ausente** |

## Falsos positivos conhecidos

Para não relatar de novo:

- **`findByEmail`** (`prisma-user.repository.ts:233`) **não** deve filtrar por
  tenant: sob D4 o login é global, é a porta de entrada da identidade.
- **`in-memory-user.repository.ts`** aparece no grep de repositório mas é
  fake de teste, não query de produção.
- **Governor de rotas `@Public()`** (`auth.controller.ts:100,171`,
  `users.controller.ts:106`) são 3; nenhuma delas é tenant-scoped por desenho.

## Convenções observadas

Este arquivo é atualizado pelo agent sempre que ele produzir findings novos:

1. **Findings recorrentes** que indicam classe de bug sistêmico
2. **Heurísticas** que funcionaram e devem virar regra
3. **Falsos positivos** conhecidos (acima — para não relatar de novo)
4. **Cruzamentos** com outros agents (ex.: finding de `prisma-db-specialist`
   que só vira vazamento quando combinado com ausência de filtro)
5. **Backlog de gaps** — detectado e ainda não corrigido

Formato de entrada (a ser preenchido pelo agent):

```yaml
- date: 2026-10-16
  finding_id: <id>
  severity: P0|P1|P2
  outcome: <resolved|deferred|false-positive|recurred>
  lesson: <1-liner do que aprendemos>
```

## Findings registrados

```yaml
- date: 2026-10-17
  finding_id: MT-4-1
  severity: P1
  outcome: resolved
  lesson: >-
    A porta declarava "a checagem de DONO do perfil e do implementador" e o
    implementador a fazia em UM dos dois ramos de findProfileId. Garantia
    escrita na porta precisa de asserção em CADA caminho: o ramo que nenhum
    teste exercita e onde a garantia morre em silencio.
- date: 2026-10-17
  finding_id: MT-4-2
  severity: P2
  outcome: resolved
  lesson: >-
    Um segundo `null` no mesmo teste pode vir do filtro errado. O teste de
    soft-delete apontava users.profile_id para perfil DE EMPRESA e passava pelo
    filtro de dono, nao pelo deletedAt. Quando um teste mede DUAS propriedades,
    cada precisa do dado que isola a sua.
- date: 2026-10-17
  finding_id: MT-4-3
  severity: P2
  outcome: deferred
  lesson: >-
    Trocar o caminho de LEITURA sem fechar o de ESCRITA deixa o isolamento
    pela metade, e nenhuma fase do plano tinha dono do write path. Achados
    registrados como pre-condicoes P1/P2/P3 da Fase 6.
```

## Baseline medido (2026-10-17, depois da Fase 4)

| Medida | Comando | Valor |
|--------|---------|-------|
| Writers de membership (`create`/`upsert`/`update` de `tenantMembership`) | `grep -rn "tenantMembership\.\(create\|upsert\|update\|updateMany\)" apps/api/src --include=*.ts \| grep -v spec` | **v1.6.0: 3 escritas** (2 `create` no onboarding + 1 `updateMany` na Fase 6). Antes da Fase 6: **0 escritas** |
| Leituras de perfil global | `grep -rn "\.profileId()" apps/api/src --include=*.ts \| grep -v spec` | **4 linhas, 1 delas de decisão**: `user.output.ts:35` e `user.prisma-mapper.ts:153` sao serializacao do DTO, `profiles.use-cases.ts:579` e comentario. So `profiles.use-cases.ts:586` le para decidir, de proposito (a escrita logo abaixo e na mesma coluna) |
| Isolamento cross-tenant provado | `grep -c "  it(" apps/api/src/modules/tenancy/infrastructure/persistence/tenancy-migration.integration.spec.ts` | **19**, Postgres real |

> ⚠️ A primeira linha muda o que a auditoria pode encontrar: ate a Fase 5 criar
> membership, **nenhum achado de vazamento cross-tenant e exploit** — e codigo
> exercitado so por spec. Nao reportar como P0 o que e latente.

## Revisão v1.6.0 (2026-10-17, Fase 6 — a escrita do perfil por empresa)

O achado `MT-4-3` (leitura resolvida, escrita não) fechou: existe agora
`TenantMembershipRepositoryPort.atribuirPerfil`, chamada por
`ProfileUseCases.atribuirProfileAoUser` quando o ator manda `X-Tenant-Id`.
Cinco travas, todas no caminho da empresa: R1 perfil alheio, R2 admin global,
R3 subconjunto, R4 remoção de admin da empresa, R5 alterar o próprio perfil.

### Lição que generaliza: `where` de `updateMany` não vê o valor que ele escreve

Duas propriedades que o filtro **não** pode ter, ambas medidas contra Postgres:

1. `where: { profileId }` casa linhas que **já** têm aquele valor — toda
   escrita nova dava `count: 0` e `atribuirPerfil` devolvia `false` 100% das
   vezes. Um `updateMany` de mentira responde `count: 1` para qualquer `where`,
   então a spec unitária que confere o `where` entregue **passa**.
2. `where: { profile: { OR: [...] } }` filtra a linha que EXISTE — e a linha é
   a MEMBERSHIP, não o perfil que está entrando. O filtro protegia o perfil já
   vestido e deixava passar o da empresa vizinha (MEDIDO: devolvia `true` e
   escrevia).

Consequência de projeto: **a checagem de DONA do valor novo tem de ser uma
leitura antes da escrita**, não um filtro. `profile.tenant_id` é imutável no
agregado (`readonly #tenantId`, sem mutador), então ler-e-depois não tem
corrida a fechar e dispensou `$transaction`.

⚠️ Isso vale para todo `updateMany`/`update` condicional deste repo, e a
armadilha do "verde pelo motivo errado" é dupla: o teste passa E a segurança
está aberta. Spec unitária de repositório com mock **não** prova `where` —
prova a intenção.

### Falso positivo de spec: guarda pré-existente mascara a regra nova

R1 e R2 nasceram verdes com mutação que as apaga. Motivo: com ator
`isAdmin: false`, a guarda do #97 (`profile.isAdmin() && !ator.isAdmin`) e a de
subconjunto já recusavam — a regra nova nunca era alcançada. A correção foi
mudar o ATOR do teste para `isAdmin: true`, que é também o cenário real: quem
admin dentro da empresa pode vestir alguém, mas só com perfil **daquela**
empresa.

Corolário de método: ao adicionar uma guarda nova, o teste precisa de um
ator para quem **as guardas antigas não mordem**. Sem isso, "teste verde" é
informação sobre as guardas antigas.

E o mascaramento **não desaparece** por consertar o unitário: sobrevive no
e2e, porque por HTTP o único perfil alheio que dá para alcançar é o de DONO
da empresa, que nasce `isAdmin: true`, e a guarda seguinte (R2) recusa
primeiro. MEDIDO (2026-10-17): R1 virada no-op (`dono !== null && false`)
deixa o e2e 11 em 6/6 e derruba UM teste unitário. Ou seja, uma guarda pode ter
dente e ainda assim não ter dente no nível superior — e "o e2e cobre" não é
prova de que a guarda é exercitada, é prova de que o conjunto delas é. Para
saber qual guarda um e2e mede, desligue uma de cada vez.

### Helper de e2e não carrega o header de empresa

`criarUsuarioAutenticado` devolve só `authorization`. Ler `GET /me/profile`
com esses headers cai no bucket GLOBAL e devolve `[]` — que é o resultado
esperado do "antes do perfil", então o teste inteiro passa sem tocar a
membership da empresa. Medido: `profileId` veio `null` na leitura "depois" e
denunciou. O header da empresa tem de ser montado à mão no spec.

## Revisão v1.7.0 (2026-10-17, Fase 9 — RLS e a inversão da conexão)

O isolamento deixou de ser só da aplicação: existem policies no Postgres e a
aplicação conecta com um papel que **não** as ignora.

| Medida | Comando | Valor |
|--------|---------|-------|
| Policies criadas | `SELECT tablename FROM pg_policies WHERE schemaname='public'` (local, apos `prisma migrate deploy`) | **20** em **5** tabelas |
| Tabelas com RLS | `SELECT c.relname FROM pg_class c ... WHERE c.relrowsecurity` | `authorizations`, `invitations`, `profiles`, `tenant_memberships`, `tenants` |
| Atributos do papel | `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='app_runtime'` | `app_runtime` / `false` / `false` |
| Papel do CLI vs. da aplicação | `DIRECT_DATABASE_URL` no `schema.prisma` (`directUrl`) | `migrate`/`seed` = DONO; `PrismaClient` = `app_runtime` |

`users`, `users_history` e `users_archive` **deixaram de ter policy** — de
propósito: são globais, e a Fase 9 não mexeu no dado de usuário.

### `set_config(…, true)` é LOCAL: sem transação, não há escopo

O parâmetro de sessão morre no fim da transação. Consequência que mudou código
que já estava verde: **todo** acesso precisa de `$transaction` — inclusive o
`CREATE`, que antes não tinha. Sem escopo a sessão volta com **zero linhas**, e
o sintoma não é erro: é "as permissões do perfil sumiram".

### Tabela sem `tenant_id` precisa de policy que ATRAVESSA a relação

`authorizations` é onde mora `users.delete`, e a policy dela resolve a dona com
`EXISTS` sobre `profiles`. Deliberadamente **não** é `SECURITY DEFINER`: assim a
RLS de `profiles` também vale na travessia. Uma tabela sem `tenant_id` e sem
essa travessia fica sem proteção nenhuma, e nenhuma revisão de `where` a pega.

### Inversão de conexão: o que mede e o que só parece medir

`url` = `app_runtime`, `directUrl` = DONO. Medido: `prisma generate` **não**
resolve env de datasource (logo o CI não precisa da variável); `prisma validate`
e `migrate` **precisam**; e o `PrismaClient` de runtime funciona sem
`directUrl`. Um teste por conexão *parece* cobrir a exclusão mútua e mede só o
`findMany`.

⚠️ `docker-compose.yml` **não** ganhou a variável: `environment:` tem precedência
sobre `env_file`, então `${DIRECT_DATABASE_URL}` não interpolado sobrescreveria o
valor do `.env.production` com string vazia — a armadilha que o próprio compose
documenta para o `JWT_SECRET`. O `env_file` já basta.

### Conjunto vazio: "fail-closed devolve 0" semeia verde no vazio

O banco local estava com **0 linhas** em `profiles`, `tenants` e
`authorizations`. Aí a medição de que a sessão sem escopo não vê nada é
**indistinguível** de não haver nada — os dois dão 0. O mesmo verde por
conjunto vazio que já mordeu em critério de gate, agora em medição de segurança.
Depois de popular com o DONO, a mesma medição separa: DONO vê 3/2/1;
`app_runtime` sem escopo vê 0/0/0; com o escopo da empresa vê 2 perfis (o dela +
o global) e **zero** da empresa vizinha.

⚠️ Ao medir RLS, **confirme o total pelo dono antes** de afirmar que a sessão
não enxerga nada. Sem isso o número medido não distingue garantia de ausência
de dado.

### Falso negativo de tipo: implementação com MENOS parâmetros compila

O TypeScript aceita uma classe que implementa a porta com menos parâmetros que a
interface. O `findById` do duplo das use cases ignorava `tenantId`, compilava,
e os **779** testes seguiam verdes sem que nada afirmasse que o escopo chega ao
repositório. O conserto foi o duplo **registrar** o que recebeu
(`escoposPedidos`) e 4 specs afirmarem a sequência exata. `toContain` não serve:
passaria com todos virados para o bucket de sistema.

## Triggers retroativos

Findings repetidos sobre o mesmo arquivo/location (>3x) é sinal de **classe de
bug sistêmico** — abrir issue classificada como tal, não como achado isolado.
O caso já medido: cache de perfil sem tenant reaparece em toda alteração de
perfil/RBAC desde o PR #97.