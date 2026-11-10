# ADR-0011: Idempotência de escrita (a chave `Idempotency-Key`)

- **Status:** Aceito
- **Data:** 2026-11-10
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [ADR-0004](./0004-tenancy-multi-empresa.md) · [ADR-0007](./0007-refresh-token-revogavel.md) · [ADR-0010](./0010-system-design-canonico.md)
- **ADR anterior:** [0010-system-design-canonico.md](./0010-system-design-canonico.md)

## Contexto

O [system design](./../system-design/README.md) mediu uma lacuna e a
escreveu com precisão — em
[`dados.md` §6](../system-design/dados.md):

> **A lacuna real, escrita com precisão:** não é "o re-execute duplica a
> linha" — é que **retry não é seguro**. Um cliente que repete por timeout
> **não tem como saber** se a primeira gravou, e recebe 409 no lugar de 201.

O que o repo tinha, MEDIDO em 2026-11-10:

| Medida | Resultado |
|---|---|
| `grep -rn "Idempotency" apps/api/src/` | **0** ocorrência |
| Tabela/coluna de idempotência no schema | **não existe** |
| `POST /users` re-executado com o **mesmo** e-mail | **409** `EMAIL_IN_USE` — o `email` é `@unique` e o repositório traduz o `P2002` em 409 (`prisma-user.repository.ts:222`) |
| `POST /users` re-executado com e-mail **novo** | **201** — e uma segunda conta |
| `POST /auth/login` re-executado | **201** — e uma **segunda** linha em `refresh_tokens` (o `jti` é único, mas o login não é) |

O problema não é a duplicata em si: é que o cliente **não tem como saber o
que aconteceu**. O 409 é indistinguível de "criei agora e já existe" — e o
201 é indistinguível de "criei agora" quando a primeira chamada na verdade
gravou. Um retry por timeout é situação real: proxy que fecha a conexão,
rede instável, deploy no meio da requisição.

E o system design já apontava que a correção é **decisão nova** — logo, ADR
novo (e não tarefa de documentação):

> A correção seria uma chave de idempotência gravada com a operação —
> **decisão nova**, e portanto **ADR novo**, não tarefa de documentação.

## Decisão

### 1. A chave é do CLIENTE, e é OPCIONAL

O cliente manda o header `Idempotency-Key` quando quer retry seguro.
Sem o header, o pedido é **exatamente** o que era — nenhuma resposta muda,
nenhum custo novo, nenhum contrato novo.

A chave é **do cliente** porque o servidor não tem como saber que dois
pedidos são o mesmo: só o cliente sabe que reenviou. E ela tem de ter
**alta entropia** — o §9 (piso de 16 caracteres) diz por quê.

### 2. Só `POST`, e `/auth` fica de fora

O interceptor age em `POST` com o header. `PATCH` e `DELETE` já têm
`If-Match`/`version` (o [ADR-0001](./0001-arquitetura-ddd-hexagonal-auditoria.md)),
e a lacuna medida é de **criação**.

`/auth` fica de fora porque o bloco de auth tem semântica de **sessão**: o
refresh token é de uso único e é rotacionado no `POST /auth/refresh`
([ADR-0007](./0007-refresh-token-revogavel.md)) — um replay ali devolveria um
token **já consumido**, e o cliente acharia que a sessão foi criada.

### 3. A chave é escopada pelo ATOR

A identidade da reserva é o par `(chave, ator)` — e o ator é o `sub` do
token, ou `anônimo` nas rotas `@Public()`.

Sem isso, a chave de uma conta valeria para outra: o replay devolveria a
resposta de **outro** ator — um vazamento. O `POST /users` é `@Public()` e não
tem ator; o que protege o replay anônimo é a **impressão do pedido** (§4):
quem repete tem que mandar o **mesmo** pedido.

⚠️ **O preço do ator anônimo, declarado:** o par `(chave, ator)` é
compartilhado por TODOS os clientes anônimos — não há IP nem sessão. Quem
conhece a chave **e** o corpo exato recebe a resposta guardada (o corpo do
`POST /users` carrega a `senha` — o replay exige a senha); quem conhece
**só** a chave bloqueia a escrita da vítima com 409 — e é o que o piso de
entropia (§9) fecha. Em rota **autenticada** o ator é o `sub`.

### 4. A impressão do pedido: método + rota concreta + escopo + corpo

A impressão é o **HMAC-SHA256** (pepper: o `JWT_SECRET`, com separação de
domínio) de `método + rota CONCRETA + escopo + corpo`, com as chaves do JSON
**ordenadas** — a impressão não pode depender da ordem em que o cliente
serializou o corpo.

Três decisões dentro dessa, e cada uma fecha um furo:

- **A rota é a CONCRETA** (path param resolvido), e não o template:
  `POST /tenants/:id/invitations` tem o **mesmo** template para toda
  empresa, e a resposta da empresa A seria replayada na empresa B.
- **O escopo (a empresa) entra.** O `tenantId` não está na URL: sem ele, a
  mesma chave no mesmo recurso em empresas diferentes seria a mesma impressão.
- **É um HMAC, e não um SHA-256.** O corpo cru carrega a `senha` em texto
  plano (`POST /users`), e um SHA-256 simples seria um **oráculo de senha
  barato** para quem lê a tabela (um dump, um backup) — mais fraco que o
  `argon2id`. Com o pepper, quem lê a tabela não consegue testar senhas.

A mesma chave com **outro** pedido é **409** (`IDEMPOTENCY_KEY_REUSED`), e
não um replay: o cliente reusou a chave por engano, e devolver a resposta de
outro pedido seria mentira.

⚠️ **O preço do pepper compartilhado, declarado:** o segredo é o mesmo que
**assina o token**. Quem vazar o `JWT_SECRET` já forja access token para
qualquer `sub` — e ganha, além disso, um oráculo **offline** de senha
(SHA-256 contra o `argon2id`). O custo marginal é real, mas é **dominado**
pelo que o vazamento já entrega; o decoupling (um `IDEMPOTENCY_PEPPER`
próprio) custa uma variável a mais em todo app derivado.

### 5. A reserva é COMMITADA antes de a operação rodar

A reserva é um `INSERT` na tabela, em transação própria, commitada **antes**
do handler. É isso que impede dois requests com a mesma chave de executarem ao
mesmo tempo: o segundo encontra a linha reservada e leva 409.

### 6. Só `2xx` é guardado — e o erro LIBERA a chave

A resposta guardada é a do **2xx**. A implementação **confere o status**
(`reply.statusCode`), e não apenas "o handler não lançou": um 4xx devolvido
sem exceção seria replayado como se fosse resultado, e a chave ficaria
presa. Quando a operação falha (4xx ou 5xx), a chave é **liberada**: o
cliente pode repetir com a mesma chave, e a tentativa nova executa de verdade.

A exceção é a falha ao **guardar** a resposta de uma operação que **já deu
2xx**: ela é logada, e o cliente recebe a resposta normal. Virar 500 aí faria
o cliente repetir — e o retry faria a operação **duas vezes**. A chave fica
reservada (o retry leva 409), que é melhor do que duplicar.

### 6.1 O replay repõe os headers que a aplicação escreveu

A resposta guardada é o **status**, o **corpo** e os **headers que a
aplicação escreveu** — hoje, o `ETag` do `POST /users` e do
`POST /users/:id/restore`. Sem eles, um cliente que monta o `If-Match` a
partir do `ETag` da criação levaria **400** no `PATCH` seguinte.

Os headers de **infraestrutura** (helmet, rate limit) **não** são repostos:
são do **request**. O interceptor guarda o que o **handler** escreveu — a
comparação é com o estado do reply antes do handler.

### 7. A tabela é do caminho de SISTEMA

A resposta guardada é **PII de outra empresa**: o corpo do `POST /users` tem
nome, e-mail e id. A RLS é o que impede o papel de runtime de ler a base de
outra empresa, e uma tabela **sem RLS** legível pelo runtime seria a
primeira brecha desse controle.

Por isso a tabela espelha o `refresh_tokens`
([ADR-0007](./0007-refresh-token-revogavel.md)): **sem RLS**, `REVOKE ALL`
do `app_runtime` e do `PUBLIC`, `GRANT` do `app_system`, e o acesso pela
credencial de sistema (`comEscopoDeSistema`).

⚠️ **O conteúdo declarado, completo:** a resposta guardada é PII — e, na
rota de convite (`POST /tenants/:id/invitations`), é o **token do convite**,
uma credencial. A cópia não é revogável, mas a **validade do token continua
decidida pelo registro de origem** (`invitations`, que tem RLS e expira): a
cópia na tabela é só o texto.

⚠️ **Armadilha para o próximo PR:** o `ALTER DEFAULT PRIVILEGES` das
migrations `20261020000000` e `20261027000001` dá CRUD em **toda tabela
nova** para o `app_runtime` (MEDIDO: `pg_default_acl` =
`{app_runtime=arwd/projeto, app_system=arwd/projeto}`) — a tabela nova com
PII precisa **repetir o `REVOKE`**.

### 8. São DOIS prazos: a reserva (5 min) e a resposta guardada (24 h)

O `expires_at` depende do estado da linha: **reservada** (`status IS NULL`)
→ **5 min** (`PRAZO_DA_RESERVA_MINUTOS` — a reserva vale enquanto a operação
roda); **com resposta** → **24 h** (`VALIDIDADE_DA_CHAVE_HORAS` — o prazo do
replay).

⚠️ **A reserva curta é o que fecha a janela da QUEDA.** A reserva é
commitada antes do handler (§5) e a resposta é gravada depois — e, se o
processo morre no meio, a linha fica reservada e sem resposta. Com o prazo
único de 24 h, o cliente levaria 409 a cada tentativa por **24 h** — e
trocar de chave (o único caminho que ele tem) **re-executa** a operação, que
é a duplicata que a chave existe para impedir. MEDIDO 2026-11-10: a linha
órfã sobrevivia com `expires_at - now() = 23:59:59`. Com 5 min, ela expira
sozinha e o retry a **reconquista**. O prazo é folgado: o orçamento da API
no banco é de 8 s (`statement_timeout`, ADR-0012) e o cliente web desiste
em 10 s.

A **linha** expirada some em dois momentos: a poda do `prepara-papeis.sh`
(no boot do container) e uma **varredura oportunista** (a cada 100 reservas)
— a segunda existe porque a poda do boot só roda quando o container reinicia.

A chave **expirada já deixa de valer** antes de a linha sumir: o `reservar`
trata a expiração e **reconquista** a chave — em UM `UPDATE` condicional
(`expires_at <= agora`), e não em um DELETE seguido de INSERT. A condição
fecha a corrida: dois requests que encontram a chave expirada ao mesmo tempo
não podem apagar a reserva um do outro, e só um fica com a chave (MEDIDO no
spec de integração — `DUAS reservas concorrentes da MESMA chave expirada: só
uma fica "livre"`; sem a condição, os dois saem com `livre` e a operação roda
duas vezes).

### 9. A chave tem teto de tamanho — e piso de entropia

**Teto**: a chave vai para a PRIMARY KEY; sem teto, um header de 16 KB (o
limite do Fastify) viraria uma linha de 16 KB. São **255 caracteres**
(`TAMANHO_MAXIMO_DA_CHAVE`) — e o que passar disso leva **400**
(`IDEMPOTENCY_KEY_TOO_LONG`), antes de tocar o banco.

**Piso**: **16 caracteres** (`TAMANHO_MINIMO_DA_CHAVE`) — o que ficar abaixo
leva **400** (`IDEMPOTENCY_KEY_TOO_SHORT`). O motivo está no §3: o ator
anônimo é uma constante compartilhada, e uma chave adivinhável deixa quem
adivinha **bloquear a escrita de outra pessoa**. MEDIDO 2026-11-10: quem
usasse a chave da vítima antes dela recebia `409` na escrita legítima da
vítima. A recomendação é um **UUID v4**.

### 10. O replay se anuncia

A resposta de replay traz `Idempotency-Replayed: true`. O cliente (e o log)
sabem que a resposta veio da reserva — e não de uma operação nova.

### 11. A chave não vai para o log

A chave é do cliente e é **parte da capacidade de replay** (junto com o
corpo e o ator): um log que a traz em claro é um log que entrega a
capacidade — e o repo classifica credencial em log como o vetor nº 1 de
vazamento. O header `idempotency-key` entra na redação do `pino`
(`REDACT_PATHS`), e as mensagens de erro do interceptor logam um **prefixo
de 8 hex** do **HMAC-SHA256** da chave, nunca a chave crua. O prefixo é
HMAC — e não SHA-256 — porque uma chave fixa no código o tornaria um oráculo
de verificação: quem lesse o log testaria um palpite de chave e saberia se
acertou.

## Consequências

### O que mudou para quem usa a API

- `POST` com `Idempotency-Key` repetido com o **mesmo** corpo → a **mesma**
  resposta, mesmo status, os mesmos headers da aplicação (o `ETag`) e o
  header `Idempotency-Replayed: true`.
- A **mesma** chave com **outro** corpo → **409** `IDEMPOTENCY_KEY_REUSED`.
- A **mesma** chave com a operação em andamento → **409**
  `IDEMPOTENCY_KEY_IN_FLIGHT`.
- Um erro (4xx/5xx) **libera** a chave: o retry executa de verdade.
- Uma chave com **menos de 16** caracteres → **400**
  `IDEMPOTENCY_KEY_TOO_SHORT`; com **mais de 255** → **400**
  `IDEMPOTENCY_KEY_TOO_LONG`. A chave recomendada é um **UUID v4**.
- A chave vale **5 min** enquanto a operação roda e **24 h** com a resposta
  guardada (§8): um retry depois da queda do processo a reconquista.

### O que NÃO mudou

- Nenhum endpoint exige o header. Sem ele, o comportamento é idêntico.
- Nenhum contrato OpenAPI mudou: o header é opcional e não é requisito.
- `/auth` ficou de fora — a sessão não tem idempotência.

### O preço, declarado

O preço de cada decisão está na seção dela — aqui é o índice:

- **PII (e credencial, na rota de convite)** na tabela, que o runtime não
  alcança (§7).
- **Duas transações** no pool de **sistema** por POST com chave — e não no
  pool do runtime.
- **A resposta antiga se perde** quando a chave expira: quem reusa uma chave
  expirada reconquista a reserva e a operação roda de novo (§8).
- **A janela do `em_voo`** (reservada e sem resposta) morre com o prazo da
  reserva — 5 min, e não 24 h (§8).
- **O ator anônimo não escopa nada** (§3): a resposta guardada vai para quem
  tiver a chave **e** o corpo exato, e o piso de entropia fecha o bloqueio
  da escrita de outra pessoa (§9).
- **`POST /auth/login` continua duplicando** o refresh token: o login tem
  semântica de sessão, e a decisão é explícita (§2).
- **A rotação do `JWT_SECRET` empurra o cliente a re-executar**: o retry cai
  em 409 `IDEMPOTENCY_KEY_REUSED`, e um cliente que leia assim **gera outra
  chave** — o que re-executa a operação. Num evento raro, é o preço aceito.
- **A tabela usa o pool de SISTEMA** (o mesmo do `refresh_tokens`): a API
  ganha **um segundo pool** contra o mesmo Postgres.

## Alternativas rejeitadas

- **Idempotência implícita, por conteúdo do corpo.** O servidor calcula a
  impressão e usa como chave. Rejeitada: obriga o servidor a **guardar o
  corpo de todo POST** (custo e PII), e a colisão entre dois clientes que
  criam o mesmo usuário é indistinguível do retry legítimo.
- **Resolver o 409 com um "GET do que foi criado" depois do erro.** O cliente
  ainda não sabe se a primeira gravou, e o "GET" depende de a unicidade ser a
  mesma chave de negócio — o que nem toda criação tem (o `slug` do perfil tem
  unicidade por índice parcial, e a corrida dava 500).
- **Guardar só o id do recurso criado, e reidratar no replay.** Funciona, mas
  cada rota passa a saber reidratar a sua resposta — e a idempotência deixa de
  ser um mecanismo **geral** para virar um comportamento por rota.
- **A chave no corpo (`idempotencyKey` no payload).** Rejeitada: o header é o
  padrão do mercado (Stripe, IETF), e não obriga a mudar o schema de todo
  cliente.
- **Deixar o cliente guardar a resposta e repetir por conta própria.**
  Rejeitada: é o caso do timeout o que o cliente não resolve.

## Ver Também

- [ADR-0004](./0004-tenancy-multi-empresa.md) — a credencial que abre o
  bucket de sistema, e a que não abre a tabela da chave.
- [ADR-0007](./0007-refresh-token-revogavel.md) — o precedente do registro de
  sessão em tabela do caminho de sistema.
- [`../system-design/dados.md` §6](../system-design/dados.md) — a lacuna que
  esta ADR fecha.
- [`../api/users.md`](../api/users.md) — o contrato do `POST /users`.
