# API Reference — BC `auth`

> Documento de referência da API HTTP do **Bounded Context `auth`**.
> Contrato exportado para `apps/api/openapi.json` — artefato **derivado**,
> gitignored (`.gitignore:11`). Para regenerar: `pnpm --filter @projeto/api openapi:export`.
> ADR-0002 (o que o JWT **não** garante): [`../adr/0002-autenticacao-jwt-argon2.md`](../adr/0002-autenticacao-jwt-argon2.md).
> Medido em 2026-10-13: os 3 endpoints abaixo conferem com o contrato gerado.

## §1. Visão geral

- **Base path**: `/api/v1/auth`
- **Content-Type**: `application/json; charset=utf-8`
- **Erros**: RFC 7807 (Problem Details)
- **Guard**: `JwtAuthGuard` na **classe** do controller. `login` e `refresh` se
  libertam com `@Public()`, lido via `Reflector` antes de qualquer validação.

## §2. Endpoints

| # | Método | Path                    | Auth | Códigos principais            |
|---|--------|-------------------------|------|-------------------------------|
| 1 | `POST` | `/api/v1/auth/login`    | ❌   | `201`, `400`, `401`, `429`    |
| 2 | `POST` | `/api/v1/auth/refresh`  | ❌   | `201`, `400`, `401`           |
| 3 | `GET`  | `/api/v1/auth/me`       | ✅   | `200`, `401`                  |

## §3. Payloads

### `POST /auth/login`

```json
{ "email": "pessoa@example.com", "senha": "uma senha qualquer" }
```

```json
{
  "accessToken": "eyJhbGciOi…",
  "refreshToken": "eyJhbGciOi…",
  "user": { "id": "0190a8b6-…", "nome": "Pessoa", "email": "pessoa@example.com" }
}
```

⚠️ **`senha` no login é `min(1)`, não a política de senha (8..72) — de
propósito.** A política responde "esse valor serve como senha"; o login
responde "essa senha abre ESTA conta". Quem tem senha de 4 caracteres e conta
criada antes da regra precisa conseguir entrar. Se o boundary recusasse senha
curta com 400, e-mail inexistente (400 pelo VO `Email`) e senha curta (400)
dariam o **mesmo status mas corpo diferente** — o corpo reabriria o oráculo de
enumeração que o 401 genérico existe para fechar.

⚠️ **A resposta NUNCA inclui `senhaHash`.** O `user` acima é `UserOutputDto`.

### `POST /auth/refresh`

```json
{ "refreshToken": "eyJhbGciOi…" }
```

Devolve o mesmo par do login. `401` para refresh token ausente, expirado ou
inválido.

### `GET /auth/me`

Sem body. Devolve o perfil do usuário da sessão, resolvido pelo `sub` do token.
`401` quando a sessão não existe.

## §4. Erros

| Status | Quando |
|--------|--------|
| `400`  | Payload inválido (Zod no boundary, ou VO de domínio) |
| `401`  | Credenciais inválidas — **genérico, por decisão de segurança** |
| `429`  | Limite de tentativas por conta (`ip:email`) excedido — **só no `login`** |

⚠️ **A mensagem de `401` é a mesma para e-mail inexistente e senha errada.**
`InvalidCredentialsException` não distingue os dois casos, e
`Argon2PasswordHasher.verify()` **não lança** para digest malformado — devolve
`false`, porque um `TypeError` da lib escapando viraria `500` e distinguiria
"registro corrompido" (500) de "credencial errada" (401). Esse é o vetor de
enumeração de contas que o 401 genérico fecha.

O spec e2e `e2e/f7-login.spec.ts` compara **o texto** das duas telas, e não
apenas a presença do erro — um `toBeVisible()` passaria com as duas mostrando
mensagens diferentes.

⚠️ **O `429` é por conta (`ip:email`), não só por IP.** O teto global de
`THROTTLE_LIMIT` por IP é a rede larga: "muitas senhas contra UM e-mail" nunca
esgota o bucket de nenhum IP do atacante, e um IP único de verdade (NAT, VPN)
tranca a rede inteira atrás de quem errou a senha uma vez. Por isso o `login`
carrega um `@Throttle` próprio, com chave `ip:email` e
`LIMITE_LOGIN_POR_MINUTO = 5` (NIST SP 800-63B), **somando** ao global.

O nome do throttler é `default` e não um nome próprio: `forRoot` sem `name`
registra UM throttler, e um `@Throttle({ login: … })` que nomeia um throttler
inexistente é inerte — o header continua `x-ratelimit-limit: 100` e o `429`
nunca chega. MEDIDO: foi assim que o spec de limite caiu 3/3 com `401` onde
esperava `429`.

## §5. Configuração

| Variável | Obrigatória | Default | Efeito |
|----------|-------------|---------|--------|
| `JWT_SECRET` | **sim** | **nenhum** | Recusa o boot se ausente, em qualquer `NODE_ENV` |
| `JWT_ACCESS_TTL` | não | `15m` | TTL do access token |
| `JWT_REFRESH_TTL` | não | `7d` | TTL do refresh token |
| `THROTTLE_TTL_MS` | não | `60000` | Janela do limite global por IP |
| `THROTTLE_LIMIT` | não | `100` | Tentativas por IP na janela |

`LIMITE_LOGIN_POR_MINUTO` **não** é variável de ambiente: é constante no
controller, porque um teto de login que a configuração afrouxa é um controle de
segurança que alguém afrouxa.

O fallback é `\|\|` e não `??` **de propósito**: `JWT_ACCESS_TTL=` vazio numa
linha de `.env` chega como string vazia, e `??` deixaria passar um
`expiresIn: ''`.

## §6. O que o JWT não garante

**Um token já emitido não é revogado** — não existe lista de revogação.
Soft-delete não derruba sessão viva, e trocar a senha não derruba sessões
existentes. O impacto é medido e registrado no
[ADR-0002](../adr/0002-autenticacao-jwt-argon2.md).

## Ver Também

- [`users.md`](./users.md) — o BC de onde `auth` lê e escreve usuário.
- [`../superpowers/plans/2026-10-08-login-usuario-senha.md`](../superpowers/plans/2026-10-08-login-usuario-senha.md) — plano da demanda.