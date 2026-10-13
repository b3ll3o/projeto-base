# ADR-0002: Autenticação por JWT + senhas com argon2id

- **Status:** Aceito
- **Data:** 2026-10-13
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [`../superpowers/plans/2026-10-08-login-usuario-senha.md`](../superpowers/plans/2026-10-08-login-usuario-senha.md)
- **ADR anterior:** [`0001-arquitetura-ddd-hexagonal-auditoria.md`](./0001-arquitetura-ddd-hexagonal-auditoria.md)

## Contexto

O projeto tinha cadastro de usuário com auditoria completa (ADR-0001) e **nenhuma
autenticação**: qualquer rota que lesse dados de usuário estava aberta, e não
existia noção de "quem fez esta mudança".

Tornou-se obrigatório que **todo usuário tenha senha** — inclusive os já
cadastrados. Isso força duas decisões que não são óbvias:

1. **O que fazer com quem já existe** sem senha na base?
2. **Onde a senha vive**, dada a auditoria de 3 tabelas que grava *snapshot
   JSONB* de cada versão?

A segunda é a armadilha. `users_history.snapshot` e `users_archive.snapshot`
guardam o estado inteiro do agregado em JSONB. Se o hash entrar no snapshot, ele
passa a existir em **duas cópias permanentes** que nenhuma política de
`DELETE` alcança, e o ADR-0001 promete rastreabilidade de alteracoões — o que
inclui apagar a conta.

## Decisão

### 1. argon2id, não bcrypt

Escolhido por dois motivos concretos, não por preferência de moda:

| | bcrypt | argon2id (escolhido) |
|---|---|---|
| Senha acima de 72 bytes | **trunca silenciosamente** | hasha o tamanho que receber |
| Custo de um ataque de GPU | 4 KiB por hash — barato | 64 MiB por hash — caro |

Parâmetros: os **defaults da lib** (`argon2id`, `m=65536`, `t=3`, `p=4`),
medidos em ~48 ms por hash neste ambiente. Eles **não** viram constante em
`argon2-password-hasher.ts` porque o VO `PasswordHash` valida o formato do hash
com regex que aceita qualquer `m`/`p`/`t` — fixar nos dois lugares criaria duas
fontes de verdade para o mesmo número. Se a política mudar, o caminho é
`argon2.needsRehash()`: o hash antigo continua verificável e só o `hash()` do
cadastro passa a emitir o novo formato.

### 2. A senha NÃO é parte do agregado

`PasswordHash` (`users/domain/value-objects/password-hash.vo.ts`) é um value
object **do agregado**, mas `toPersistence()` **omite** o campo e o snapshot é
construído por uma função separada que nunca o inclui. Três garantias:

- `PasswordHash.toString()` devolve `'[redacted]'` — nunca o hash.
- O hash nunca entra em `users_history.snapshot`, `users_archive.snapshot`,
  `UserOutputDto`, log ou mensagem de exceção.
- A senha **em claro** nunca entra no agregado, em log ou em template de
  mensagem — inclusive por interpolação `${valor}`.

### 3. Falha de login é genérica

`POST /auth/login` devolve `401` com **a mesma** mensagem para e-mail inexistente
e para senha errada. `Argon2PasswordHasher.verify()` **não lança** — devolve
`false` para digest malformado, porque um `TypeError` da lib escapando viraria
500 e o chamador distinguiria "registro corrompido" (500) de "credencial errada"
(401), que é o vetor de enumeração de contas que o 401 genérico existe para
fechar.

### 4. Token stateless, guardado em cookie httpOnly

Access token (15 min) e refresh (7 dias) viajam em cookie `httpOnly`,
`sameSite=lax`, `path=/`. **Nunca** em `localStorage`/`sessionStorage` — lá
qualquer XSS lê o token; em cookie httpOnly o JavaScript da página não lê.

`JWT_SECRET` é **obrigatório e sem valor default**: o `JwtTokenService` recusa o
boot sem ele, em qualquer `NODE_ENV`. Motivo: um segredo JWT padrão em
repositório é pior que nenhum segredo — todos que installaram o projeto
compartilham a chave de assinatura.

## Consequências

### O que o JWT **NÃO** garante — leia antes de auditar

**Um token já emitido não é revogado.** O JWT é stateless: não existe lista de
revogação, e o `guard` valida assinatura e expiração, não o estado da conta.
Duas consequências concretas, ambas MEDIDAS em 2026-10-13 no fluxo e2e:

1. **Soft-delete não derruba a sessão.** Apagar um usuário invalida o login
   *novo* com aquele e-mail (`findByEmail` filtra soft-deleted → `401`), mas um
   token já na mão continua válido até expirar. Em consequência o `limparBase()`
   do harness e2e apaga a própria conta de sessão, e foi exatamente isso que
   fez 29 de 29 specs caírem em `INVALID_CREDENTIALS` numa primeira execução.

2. **Trocar a senha não derruba sessões existentes.** Não há caminho de
   revogação em toda a aplicação.

Se alguma dessas duas virar requisito ("sair dos outros dispositivos ao trocar a
senha"), a decisão a tomar é: lista de revogação por `jti`, `version` de sessão
no banco, ou token curto sem refresh. **Não** é um bug — é o preço da
estatelessness, registrado aqui para que ninguém o descubra em produção.

### other consequences

- **Custo por request.** O access token é verificado por assinatura a cada
  request; o TTL curto (15 min) é o que limita a janela de um token vazado.
- **Refresh ainda não é usado pelo front.** O endpoint existe e está testado;
  o fluxo automático de renovação não foi implementado (ver o comentário de
  decisão em aberto em `apps/web/lib/sessao.ts` sobre `maxAge`).
- **`openapi:export` precisa de `JWT_SECRET`.** O script monta o `AppModule`
  inteiro para o Swagger ler metadados; sem o segredo ele falha. O script
  injeta um valor **descartável, só naquele processo** — um segredo real ali
  passaria a morar no repositório.

## Alternativas rejeitadas

- **`node:crypto` scrypt** — sem dependência nativa e sem algoritmo OWNED; escolhido o
  argon2 porque é a recomendação do OWASP e resiste a GPU *e* aASIC.
- **Sessão em banco (opaque token)** — dá revogação imediata, ao custo de uma
  leitura de banco por request. Rejeitada agora porque o volume não justifica;
  é a saída natural se a statelessness virar problema.
- **Guardar o hash no snapshot de auditoria** — rejeitado: duas cópias
  permanentes sem política de apagamento.

## Ver Também

- [`../api/auth.md`](../api/auth.md) — contrato HTTP de auth.
- [ADR-0001](./0001-arquitetura-ddd-hexagonal-auditoria.md) — a auditoria de
  3 tabelas cuja decisão 2 protege.