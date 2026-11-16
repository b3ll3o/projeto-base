---
name: plano-password-hash-invalido
description: "O hash da senha vira uma invariante do BANCO: uma função SQL que é o dono da regra argon2id, o reparo das linhas já corrompidas, uma CHECK constraint em users.password_hash e o spec que amarra a regra do banco com a do value object."
version: 1.0.0
updated: 2026-11-16
status: em-andamento
state_snapshot: .agents/runs/state-snapshot-20261116T183713Z.md
---

# Plano — o hash da senha como invariante do banco

> **Demand:** *"analise os erros ao se logar com o usuario admin@admin.com, faça um
> plano para corrigir os erros e prevenir que os erros nao voltem a aparecer,
> revise o plano e corrija os erros, implemente o plano, revise tudo e corrija os
> erros, commit, push e abra um pr"*.
>
> **Snapshot de estado:**
> [`.agents/runs/state-snapshot-20261116T183713Z.md`](../../../.agents/runs/state-snapshot-20261116T183713Z.md)
> (`proceed: true`, `gap_blocker: false`).

---

## §1. O estado medido (AS-IS)

O login do `admin@admin.com` **funciona** (HTTP 201). O que quebra é a tela
depois dele. Medido em 2026-11-16, com os comandos ao lado.

| Medida | Valor | Comando |
|---|---|---|
| Login `admin@admin.com` | **201** — token + refresh | `curl -X POST http://localhost:3000/api/v1/auth/login -H 'content-type: application/json' -d '{"email":"admin@admin.com","senha":"Admin@123"}'` |
| `GET /api/v1/users` | **500 INTERNAL** (`UserPersistenceException`) | `curl -H "authorization: Bearer $TOKEN" http://localhost:3000/api/v1/users` |
| `/users` na UI | "Não foi possível carregar a lista. Tente de novo em instantes." | browser em `http://localhost:3001/users` |
| `/admin/users` na UI | **HTTP 500** (o RSC deixa a exceção escapar) | browser em `http://localhost:3001/admin/users` |
| `/`, `/me/profile`, `/admin/profiles`, `/admin/tenancy`, `/admin/flags` | 200 — **só** a listagem de usuários quebra | browser nas 5 rotas |
| Linhas com hash inválido | **9** de 14 (`password_hash = 'x'`) | `docker exec projeto-base-pg-local psql -U projeto -d projeto_base -tAc "select count(*) from users where password_hash !~ '^\$argon2id\$'"` |
| Login de uma conta com hash inválido | **500** — e não 401 | `curl -X POST http://localhost:3000/api/v1/auth/login -H 'content-type: application/json' -d '{"email":"probe-52d2dca4@x.dev","senha":"SenhaForte123"}'` |
| Guard da regra argon2id | **só** o value object (`password-hash.vo.ts`) | `grep -rn "PasswordHash.create" apps/api/src --include=*.ts \| grep -v spec` |
| `users.password_hash` no banco | `String` sem CHECK (`schema.prisma:36`) | `grep -n -A2 "passwordHash" apps/api/prisma/schema.prisma` |
| Fixtures que gravam hash inválido | **25** (22 com `'x'` + 3 com texto claro) | `grep -rn "passwordHash: 'x'" apps/api/src --include=*.ts \| wc -l` |
| Sites de produção que gravam hash inválido | **0** | idem, `apps/api/src` fora de `*.spec.ts` |
| Gates que medem `users.password_hash` | **0** | `grep -rn "password_hash" .tooling/scripts/ci/` |

### §1.1 Os três defeitos

**D1 — uma linha corrompida derruba a listagem inteira.** `PrismaUserRepository.list`
hidrata **todas** as linhas da página no VO `PasswordHash`
(`user.prisma-mapper.ts:128` → `hidratarSenhaHash`). O VO recusa um valor que não
seja argon2id, e o `catch` converte a recusa em `UserPersistenceException` → 500.
Uma linha inválida entre catorze derruba `/users` e `/admin/users` — o admin
**não consegue ver a lista de contas**.

**D2 — a invariante não tem dono no banco.** `users.password_hash` é `TEXT` sem
CHECK. A única coisa que impede um valor inválido é o VO, que só roda **na
leitura**. Qualquer escrita que não passe pelo VO — SQL manual, script de
administração, bug futuro — grava um valor que a aplicação não consegue ler.
As 9 linhas com `'x'` são a prova: foram gravadas por fora da aplicação, e o
repo nunca ficou sabendo.

**D3 — a falha vaza para o login.** `findByEmail` hidrata a linha do e-mail
informado. O login de uma conta com hash corrompido responde **500**, e não 401
— exatamente o oráculo de existência de conta que
`argon2-password-hasher.ts:29-40` diz que a resposta de credencial inválida
existe para fechar. A resposta certa para registro corrompido é a MESMA
resposta do login normal; hoje não é.

### §1.1 A segunda metade do defeito, descoberta na execução

> **Atualizado em 2026-11-16, depois do conserto do hash.** As MESMAS 9 linhas
> violavam **outra** invariante do mesmo VO: o `id` era um **UUID v4**, e o VO
> `UserId` só aceita **v7** (o `UserId.create()` só produz v7). O sintoma
> trocou de código: com o hash reparado, a listagem passou a responder **400**
> ("o identificador precisa ser um UUID v7 válido") em vez de 500 — um 400 que
> diz ao cliente que o problema é o id DELE, num request em que o cliente não
> mandou id nenhum.
>
> As duas invariantes eram a **mesma classe**: dado persistido violando uma
> regra que só existia em TypeScript. E o conserto é o mesmo: dono da regra no
> banco. Por isso o plano ganhou a segunda metade (T2, T3), e o spec passou a
> medir as DUAS (`invariantes-da-conta-no-banco.integration.spec.ts`).
>
> A diferença de grau entre as duas: o hash inválido pode ser **neutralizado**
> (a conta sobrevive, sem conseguir autenticar); o id **não** — ele é a
> identidade, e as memberships o referenciam por HMAC (a assinatura é calculada
> sobre o `user_id`, e a chave é da aplicação). Trocar o id é possível (o
> `ON UPDATE CASCADE` leva as memberships e os refresh tokens junto); apagar a
> conta levaria tudo junto.

## §2. A causa raiz

> **A regra "o hash da senha é argon2id" mora em UM lugar só — e esse lugar é
> TypeScript. O banco, que é onde o dado morre, não sabe da regra.**

O `PasswordHash` valida o formato (§"O QUE `create()` VALIDA" do VO). O
`users.password_hash` aceita qualquer texto. Entre a escrita e a leitura não há
nenhum dono da regra no lado que persiste.

Por que **não** é o conserto mudar o 500: o repo já decidiu, com justificativa
escrita, que dado corrompido é **infraestrutura** e não requisição inválida
(`user-persistence.exceptions.ts:30-52`). Um 400 mandaria o cliente corrigir e
reenviar, e a linha corrompida continuaria lá. Um 200 que omite a conta
silenciosamente seria pior: o admin não saberia que ela existe. **O conserto
é impedir o dado corrompido, não maquiar a leitura dele.**

## §3. O plano (TO-BE)

Cinco tarefas. A ordem é TDD: o spec (T1) antes da migration (T2).

### T1 — Spec (RED): a regra do banco, provada contra o VO

`apps/api/src/modules/users/infrastructure/persistence/invariantes-da-conta-no-banco.integration.spec.ts`

Prova, contra um Postgres de verdade (testcontainers):

1. **A escrita inválida é recusada.** `'x'`, senha em claro, bcrypt, argon2id
   sem `m`/`t`/`p`, argon2id com `m` duplicado, e hash acima de 512 caracteres:
   todos recusados com violação de CHECK. O mesmo para o `id` fora do formato
   UUID v7 (uuid v4, uuid nil, uuid v1).
2. **A escrita válida passa.** Hash argon2id real, com `m,t,p` em qualquer
   ordem — o VO aceita as duas ordens e o banco precisa aceitar as duas.
3. **O banco é MAIS ESTRITO que o VO** — a implicação que garante que o 500
   não volta: *se o banco aceitou, o VO aceita*. Um corpus vai pelos dois
   lados; o que o VO aceita e o banco recusa (parâmetro extra com valor numérico)
   é a **divergência declarada e na direção segura**: o banco recusa antes de a
   aplicação ler, e o gravador da aplicação nunca produz esse formato.
4. **O reparo neutraliza a linha corrompida** (T2).

### T2 — Migration (GREEN): o banco passa a ser dono da regra

Seis migrations, na ordem da convenção `migracao-de-dados.md` §2 (o backfill
antes da restrição) — **três por invariante**:

| # | Migration | O que faz |
|---|---|---|
| 1 | `20261116000000_password_hash_funcao` | cria `password_hash_is_valid_argon2id(text)` — o dono da regra do hash no banco |
| 2 | `20261116000001_password_hash_reparo` | repara as linhas: cada hash inválido vira um envelope argon2id **com digest aleatório** — envelope válido (o VO aceita), senha impossível (o `argon2.verify` nunca casa), e a **linha sobrevive** para a auditoria |
| 3 | `20261116000002_password_hash_constraint` | a CHECK constraint `users_password_hash_argon2id` |
| 4 | `20261116000003_user_id_funcao` | cria `user_id_is_uuid_v7(uuid)` |
| 5 | `20261116000004_user_id_reparo` | troca o id das contas cujo id não é v7 (e leva junto o histórico, o arquivo e a chave de idempotência, que não têm FK) |
| 6 | `20261116000005_user_id_constraint` | a CHECK constraint `users_id_uuid_v7` |

O reparo do hash **não apaga conta** e **não habilita acesso**: uma conta cujo
hash estava corrompido já não conseguia entrar; depois do reparo, ela entra
como credencial inválida (401), que é a resposta certa. O reparo do id **não
apaga conta** também: o id é a identidade, e as memberships o referenciam por
HMAC — apagar a conta levaria o resto junto.

Por que uma **função** e não a regra escrita duas vezes (no `WHERE` do reparo e
no CHECK): é a exigência da convenção `dry.md` — *o fato tem UM dono*. A função
é o dono no banco; o VO é o dono na aplicação; e o spec da T1 é o **instrumento
que amarra os dois**, medindo que o banco nunca é mais frouxo que o VO.

⚠️ A função é `IMMUTABLE` (só regex e `length`) — sem isso o Postgres recusa
uma CHECK constraint que a chame. E o `WHERE` do reparo usa **a mesma função**:
se as duas expressões divergissem, uma linha poderia escapar do reparo e a
constraint falharia no `migrate deploy` (barulhenta, e ainda assim tarde demais
para o dado).

### T2.1 O que a constraint passa a ser a ÚLTIMA barreira

O port `UsuarioParaProvisionar.senhaHash` (`tenant-onboarding.port.ts:34`) é uma
**string crua** — o repositório de onboarding grava nela sem passar pelo VO.
Hoje um valor inválido entra ali silenciosamente e quebra a listagem depois.
Com a constraint, a mesma escrita falha **no write**, com o erro do banco. É uma
melhora, mas a assimetria fica registrada aqui: nesse ponto o banco é o dono da
regra e a aplicação não é.

### T3 — Fixtures: o teste para de gravar dado que a aplicação não consegue ler

As **25** fixtures que gravam hash inválido passam a gravar um hash argon2id
válido — o `HASH_REAL` que já existe em `apps/api/test/fakes/fake-password-hasher.ts`.
Sem isso, a CHECK constraint recusaria o próprio insert nos specs de integração,
e a suíte ficaria verde só porque parou de exercitar o caminho. **Esta é a parte
que mais trabalha**: é mecânica, mas toca 7 arquivos.

A **segunda** invariante tem o mesmo preço: as fixtures gravavam `id:
randomUUID()` — um **UUID v4** — e a constraint `users_id_uuid_v7` recusa. O
`UserId.create().value` (v7) é o que passa, e é o que a aplicação usa. Havia
**20** sitios, em 6 arquivos (o `randomUUID()` que NÃO é id de conta — o slug de
um e-mail, o id de uma tenant — fica).

Três sites não quebrariam (a escrita morre na RLS antes de a CHECK ser avaliada) —
**e mesmo assim mudam**, porque o valor gravado é irrelevante para o que eles
afirmam, e um fixture que grava lixo é a mesma armadilha que produziu este
defeito:

| Site | O que o spec afirma | Por que muda mesmo sem quebrar |
|---|---|---|
| `prisma-rls.integration.spec.ts:766` | update de senha alheia é barrado (RLS) | o `USING` filtra a linha → `UPDATE 0`; o hash nunca é avaliado |
| `prisma-rls.integration.spec.ts:806` e `:828` | insert sem escopo é barrado (RLS) | o `WITH CHECK` da RLS é avaliado **antes** da CHECK constraint (medido) |
| `prisma-rls.integration.spec.ts:845` e `:852` | **CONTROLE**: com escopo, a escrita **passa** (`alterados === 1`) | aqui a constraint **rejeita** — é o que quebra |

⚠️ Ordem de avaliação medida no Postgres: em um INSERT, a policy de RLS
(`WITH CHECK`) é avaliada **antes** da CHECK constraint; em um UPDATE cuja linha
é filtrada pelo `USING`, a CHECK **não é avaliada** (0 linhas afetadas, sem
erro). Os specs que continuam medindo RLS continuam medindo RLS.

O hash usado precisa ser aceito pelo VO **e** pela constraint: a regex do banco
tem de aceitar `m,p,t` e `m,t,p` (as duas ordens existem no repo — `HASH_REAL`
é `m,p,t`, `HASH_COM_FORMA` é `m,t,p`), e salt/digest curtos (o
`prisma-tenant-onboarding.repository.integration.spec.ts:64` grava um hash de
42 caracteres com salt de 4). O VO aceita `[^$]+` (1+ caracteres) e a constraint
tem de acompanhar.

### T4 — Banco local: o defeito sai do caminho

`prisma migrate deploy` no `projeto-base-pg-local` aplica o reparo (9 linhas) e
a constraint. Verificação ao vivo: `GET /api/v1/users` → 200, `/users` e
`/admin/users` sem erro na UI, e o login de uma conta com hash reparado →
401 (e não 500).

### T5 — Documentação

- `docs/como-rodar.md`: a linha do troubleshooting para "GET /api/v1/users → 500"
  e o passo de `migrate deploy` na §1.3.
- `docs/adr/0002-autenticacao-jwt-argon2.md`: o ADR que diz onde o hash é
  validado — a regra agora tem **dois** donos, e o ADR precisa dizer isso.
- Este plano e o snapshot de estado.

### T6 — Gates, revisão e PR

`pnpm ci:local` (preflight + lint + typecheck + testes + `ci:boot`), revisão do
diff por subagente (code-reviewer + stack-code-reviewer), correção do que a
revisão achar, commit convencional, push e PR.

## §4. O que NÃO entra (e por quê)

| Fora do escopo | Por quê |
|---|---|
| Trocar o 500 por 207/lista parcial | O repo já decidiu: dado corrompido é infraestrutura (`user-persistence.exceptions.ts:30-52`). Omitir a conta em silêncio é pior que o 500. |
| Aggregate `User` sem hash (listagem sem hidratar) | Mudança de domínio (o VO *é* a credencial do agregado), e não previne a escrita inválida — só contém o estrago. |
| `/admin/users` degradar com elegância | É um defeito **independente**: hoje ela quebra a página com qualquer falha da API, porque não tem o `try/catch` que `/users` tem (`app/users/page.tsx:52-60`). Não é o erro desta demanda (depois do conserto, a API não falha mais aqui) e mistura duas mudanças num PR. Registrado como observação para uma demanda própria. |
| Recriar a base local | O conserto é a migration; recriar o banco esconderia o defeito e perderia os dados de dev. |
| Um comando "doctor" que caça hash inválido | A constraint é a prevenção; o doctor seria detecção de um caso que a constraint já torna impossível. |
| O port `UsuarioParaProvisionar.senhaHash` virar `PasswordHash` | O tipo cru é **deliberado** (convenção de BC: `tenancy` não importa `users/domain`), e o chamador de produção passa o valor do VO (`user-use-cases.ts:159`). Com a constraint, uma escrita inválida nesse ponto falha **no write**, com o erro do banco — o furo de TIPO continua, o de DADO não. Mudar o tipo é uma decisão de fronteira entre BCs, e é de outra demanda. |
| Apagar as 9 contas quebradas em vez de rekeyar | O id é a identidade e as memberships o referenciam por HMAC; apagar levaria o resto junto. Trocar o id preserva a conta e o `ON UPDATE CASCADE` leva as referências junto. |

## §5. Riscos

| Risco | Mitigação |
|---|---|
| A constraint recusa um hash legítimo gravado por outra ferramenta | O gravador da aplicação é o `Argon2PasswordHasher`, que emite `m,t,p` — a constraint aceita. Hash de outra origem com parâmetro extra é recusado: falha **barulhenta e cedo**, no write, e não 500 na leitura. |
| O reparo torna uma conta "trancada" sem o operador saber | Ela já estava trancada: com hash inválido o login era 500, nunca 200. O reparo só troca 500 por 401. O relatório da migration diz quantas linhas foram reparadas. |
| O reparo do id muda a identidade de uma conta | O id novo é um UUID v7 de verdade (timestamp + `7` + variante + aleatório), gerado em SQL com a mesma forma do `UserId.create()`. O histórico, o arquivo e a chave de idempotência viajam com ele; memberships e refresh tokens, por `ON UPDATE CASCADE`. |
| 45 fixtures mudarem de valor pode alterar o que um spec mede | O `HASH_REAL` é um hash argon2id válido e o `UserId.create().value` é um v7 — os specs que medem RLS, auditoria e tenancy medem acesso, não formato de hash nem versão de id. O `ci:local` roda a suíte inteira. |
| A regra do banco divergir do VO no futuro | A T1 é o instrumento: o corpus passa pelos dois lados e afirma a implicação "banco aceitou ⟹ VO aceita". Mudar a regra em um lado sem o outro deixa o spec vermelho. |
| A constraint falhar no `migrate deploy` de um banco com linha quebrada | É o comportamento PROPOSITAL: o `ADD CONSTRAINT` valida as linhas existentes, e a falha nomeia a linha. E o reparo vem antes na ordem das migrations. |

## §6. O que a revisão do diff mudou

> **Revisado em 2026-11-16**, depois da implementação: dois subagentes
> revisaram o diff (um `code-reviewer`, um `prisma-db-specialist`) e mediram o
> que o plano afirmava. Doze achados; onze viraram mudança, um foi registrado
> como decisão.

| # | Achado | Mudança |
|---|---|---|
| 1 | **[major]** o rekey deixava **sete** referências soltas apontando para o id velho: `users.created_by/updated_by/deleted_by`, `users_history.changed_by`, `users_archive.deleted_by` e o `id` DENTRO de três snapshots JSONB (`users_history.snapshot`, `users_archive.snapshot`, `idempotency_keys.response`) | a migration passou a atualizar todas — e o spec passou a **afirmar** o `snapshot` e o `changed_by`, para o teste ter dente no achado |
| 2 | **[major]** a justificativa da migration afirmava que o id de uma membership "não pode ser trocado sem refazer a assinatura" — e não há coluna de assinatura: o HMAC é conferido no INSERT e **descartado** | o texto foi reescrito com a razão verdadeira |
| 3 | **[minor]** "o Postgres recusa uma CHECK constraint que chame uma função volátil" é **falso** (MEDIDO: aceita; é o **índice** e a coluna gerada que exigem `IMMUTABLE`) | o motivo foi corrigido nas duas migrations de função |
| 4 | **[minor]** quatro migrations citavam um spec que não existe (`password-hash-no-banco.integration.spec.ts`) | o nome passou a ser o real (`invariantes-da-conta-no-banco.integration.spec.ts`) |
| 5 | **[minor]** o reparo é **um no-op silencioso** se a sessão não for a do dono (a RLS filtra a linha, o `UPDATE` afeta 0, sem erro) e a migration fica marcada como aplicada | as duas migrations de reparo ganharam uma **guarda** que levanta com o motivo |
| 6 | **[minor]** não havia procedimento para **restaurar um dump** anterior às constraints (o `INSERT` é recusado) | o procedimento está em [`docs/api/users.md` §7.1](../../api/users.md) |
| 7 | **[minor]** a neutralização não deixa rastro em `users_history` | **decisão registrada** (e o porquê): encher a trilha ajustando `version` deixaria um buraco nela |
| 8 | **[minor]** o corpus do spec cobria 2 das **6** ordens dos parâmetros | as 4 ordens que faltavam entraram no corpus |
| 9 | **[minor]** o teste do histórico afirmava só o `entityId` — e passava com a inconsistência que ele mesmo produzia | o teste passou a afirmar o `snapshot` e o `changedBy` |
| 10 | **[minor]** o ADR se contradizia: "um registro corrompido continua respondendo a MESMA coisa que uma senha errada", duas linhas depois de dizer que ele respondia 500 | o texto foi corrigido: o §3 cobre a senha errada (401); a corrupção respondia 500, e é a constraint que impede ela de existir |
| 11 | **[minor]** dois ids literais da spec de RLS (`ffffffff-…`, `dddddddd-…`) não são v7 — a dependência da RLS era invisível no teste | viraram `UserId.create().value` |
| 12 | **[minor]** o helper do spec engole qualquer erro: o caso "texto que não é uuid" passava pelo **cast**, não pela constraint | o spec passou a medir o **motivo** da recusa (`23514` = constraint, `P2023` = cast) |
| 13 | **[info]** "byte a byte" na descrição do UUID v7 | "no mesmo formato" |

⚠️ Um achado **não** virou mudança: o port `UsuarioParaProvisionar.senhaHash`
continua com o tipo cru (`string`). O motivo está no §4 — a convenção de BC
proíbe o `tenancy` de importar `users/domain`, e o chamador de produção passa
o valor do VO. Com a constraint, uma escrita inválida nesse ponto falha **no
write**: o furo de TIPO continua, o de DADO não.
