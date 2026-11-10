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
gravou. Um retry por timeout é uma situação real: proxy que fecha a
conexão, rede instável, deploy no meio da requisição.

O system design já apontava que a correção é **decisão nova** — e, portanto,
ADR novo:

> A correção seria uma chave de idempotência gravada com a operação —
> **decisão nova**, e portanto **ADR novo**, não tarefa de documentação.

## Decisão

### 1. A chave é do CLIENTE, e é OPCIONAL

O cliente manda o header `Idempotency-Key` quando quer retry seguro.
Sem o header, o pedido é **exatamente** o que era — nenhuma resposta muda,
nenhum custo novo, nenhum contrato novo.

A chave é **do cliente** porque o servidor não tem como saber que dois
pedidos são o mesmo: só o cliente sabe que reenviou.

### 2. Só `POST`, e `/auth` fica de fora

O interceptor age em `POST` com o header. `PATCH` e `DELETE` já têm
`If-Match`/`version` (o [ADR-0001](./0001-arquitetura-ddd-hexagonal-auditoria.md)),
e a lacuna medida é de **criação**.

`/auth` fica de fora porque o bloco de auth tem semântica de **sessão**: o
refresh token é de uso único e é rotacionado no `POST /auth/refresh`
([ADR-0007](./0007-refresh-token-revogavel.md)). Um replay ali devolveria
um token **já consumido** — o cliente receberia um par morto e acharia que
a sessão foi criada.

### 3. A chave é escopada pelo ATOR

A identidade da reserva é o par `(chave, ator)` — e o ator é o `sub` do
token, ou `anônimo` nas rotas `@Public()`.

Sem isso, a chave de uma conta valeria para outra: o replay devolveria a
resposta de **outro** ator — um vazamento. O `POST /users` é `@Public()` e
não tem ator; o que protege o replay anônimo é a **impressão do pedido**
(§4): quem repete tem que mandar o **mesmo** pedido.

### 4. A impressão do pedido: método + rota + corpo

A impressão é o SHA-256 de `método + rota + corpo`, com as chaves do JSON
**ordenadas** — a impressão não pode depender da ordem em que o cliente
serializou o corpo.

A mesma chave com **outro** pedido é **409** (`IDEMPOTENCY_KEY_REUSED`), e
não um replay: o cliente reusou a chave por engano, e devolver a resposta
de outro pedido seria mentira.

### 5. A reserva é COMMITADA antes de a operação rodar

A reserva é um `INSERT` na tabela, em transação própria, commitada **antes**
do handler. É isso que impede dois requests com a mesma chave de executarem
ao mesmo tempo: o segundo encontra a linha reservada e leva 409
(`IDEMPOTENCY_KEY_IN_FLIGHT`).

### 6. Só `2xx` é guardado — e o erro LIBERA a chave

A resposta guardada é a do **2xx**. Quando a operação falha (4xx ou 5xx), a
chave é **liberada**: o cliente pode repetir com a mesma chave, e a
tentativa nova executa de verdade.

A exceção é a falha ao **guardar** a resposta de uma operação que **já
deu 2xx**: ela é logada, e o cliente recebe a resposta normal. Virar 500
aí faria o cliente repetir — e o retry faria a operação **duas vezes**. A
chave fica reservada (o retry leva 409), que é melhor do que duplicar.

### 6.1 O replay repõe os headers que a aplicação escreveu

A resposta guardada é o **status**, o **corpo** e os **headers que a
aplicação escreveu** — hoje, o `ETag` do `POST /users` e do
`POST /users/:id/restore` (`users.controller.ts`).

Sem eles, a resposta do retry não seria a mesma da original: um cliente
que monta o `If-Match` a partir do `ETag` que a criação devolve levaria
**400** no `PATCH` seguinte.

Os headers de **infraestrutura** (os do helmet, os do rate limit) **não**
são repostos: eles são do **request**, e cada request tem os seus. O
interceptor guarda o que o **handler** escreveu — a comparação é com o
estado do reply antes do handler.

### 7. A tabela é do caminho de SISTEMA

A resposta guardada é **PII de outra empresa**: o corpo do `POST /users` tem
nome, e-mail e id. A RLS é o que impede o papel de runtime de ler a base de
outra empresa, e uma tabela **sem RLS** legível pelo runtime seria a
primeira brecha desse controle.

Por isso a tabela espelha o `refresh_tokens`
([ADR-0007](./0007-refresh-token-revogavel.md)): **sem RLS**, `REVOKE ALL`
do `app_runtime` e do `PUBLIC`, `GRANT` do `app_system`, e o acesso pela
credencial de sistema (`comEscopoDeSistema`).

### 8. A validade é de 24 h, e a poda roda no boot

A chave vale 24 h (`expires_at`). O retry de um cliente acontece em
minutos — por timeout, por rede instável, por deploy no meio da requisição.
24 h cobrem isso com folga, e o registro não fica para sempre: a poda roda
no `prepara-papeis.sh`, junto com a do `refresh_tokens`.

### 9. O replay se anuncia

A resposta de replay traz `Idempotency-Replayed: true`. O cliente (e o log)
sabem que a resposta veio da reserva — e não de uma operação nova.

## Consequências

### O que mudou para quem usa a API

- `POST` com `Idempotency-Key` repetido com o **mesmo** corpo → a **mesma**
  resposta, mesmo status, os mesmos headers da aplicação (o `ETag`) e o
  header `Idempotency-Replayed: true`.
- A **mesma** chave com **outro** corpo → **409** `IDEMPOTENCY_KEY_REUSED`.
- A **mesma** chave com a operação em andamento → **409**
  `IDEMPOTENCY_KEY_IN_FLIGHT`.
- Um erro (4xx/5xx) **libera** a chave: o retry executa de verdade.

### O que NÃO mudou

- Nenhum endpoint exige o header. Sem ele, o comportamento é idêntico ao de
  antes.
- Nenhum contrato OpenAPI mudou: o header é opcional e não entra como
  requisito.
- `/auth` ficou de fora — a sessão não tem idempotência.

### O preço, declarado

- **A chave guardada é PII**, e a tabela é do caminho de sistema: o papel de
  runtime **não** a alcança (o spec de integração afirma o `42501`).
- **O custo é de duas transações** no pool do cliente de **sistema** por
  POST com chave (reservar + guardar) — e não no pool do runtime. Só quem
  manda o header paga.
- **A chave expirada ainda ocupa a linha** até a poda rodar (o `prepara-papeis.sh`
  roda no boot do container). Quem reusar uma chave expirada leva 409
  `IDEMPOTENCY_KEY_IN_FLIGHT` — não um replay.
- **O replay não é transacional com a operação**: entre a reserva e a
  gravação da resposta há uma janela em que a chave está reservada e sem
  resposta. É a janela do `em_voo`.
- **`POST /auth/login` continua duplicando** o refresh token quando o
  cliente repete: o login tem semântica de sessão, e a decisão é explícita.

## Alternativas rejeitadas

- **Idempotência implícita, por conteúdo do corpo.** O servidor calcula a
  impressão e usa como chave. Rejeitada: obriga o servidor a **guardar o
  corpo de todo POST** (custo e PII), e a colisão entre dois clientes que
  criam o mesmo usuário é indistinguível do retry legítimo.
- **Resolver o 409 com um "GET do que foi criado" depois do erro.** O
  cliente ainda não sabe se a primeira gravou, e o "GET" depende de a
  unicidade ser a mesma chave de negócio — o que nem toda criação tem (o
  `slug` do perfil tem unicidade por índice parcial, e a corrida dava 500).
- **Guardar só o id do recurso criado, e reidratar no replay.** Funciona,
  mas cada rota passa a saber reidratar a sua própria resposta — e a
  idempotência deixa de ser um mecanismo **geral** para virar um
  comportamento por rota.
- **A chave no corpo (`idempotencyKey` no payload).** Rejeitada: o header
  é o padrão do mercado (Stripe, IETF), e não obriga a mudar o schema de
  todo cliente.
- **Deixar o cliente guardar a resposta e repetir por conta própria.**
  Rejeitada: é justamente o caso do timeout o que o cliente não resolve —
  ele não sabe se gravou.

## Ver Também

- [ADR-0004](./0004-tenancy-multi-empresa.md) — a credencial que abre o
  bucket de sistema, e a que não abre a tabela da chave.
- [ADR-0007](./0007-refresh-token-revogavel.md) — o precedente do registro
  de sessão em tabela do caminho de sistema.
- [`../system-design/dados.md` §6](../system-design/dados.md) — a lacuna que
  esta ADR fecha.
- [`../api/users.md`](../api/users.md) — o contrato do `POST /users`.
