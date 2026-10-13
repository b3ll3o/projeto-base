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
| 1 | `POST` | `/api/v1/auth/login`    | ❌   | `201`, `400`, `401`           |
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

⚠️ **A mensagem de `401` é a mesma para e-mail inexistente e senha errada.**
`InvalidCredentialsException` não distingue os dois casos, e
`Argon2PasswordHasher.verify()` **não lança** para digest malformado — devolve
`false`, porque um `TypeError` da lib escapando viraria `500` e distinguiria
"registro corrompido" (500) de "credencial errada" (401). Esse é o vetor de
enumeração de contas que o 401 genérico fecha.

O spec e2e `e2e/f7-login.spec.ts` compara **o texto** das duas telas, e não
apenas a presença do erro — um `toBeVisible()` passaria com as duas mostrando
mensagens diferentes.

## §5. Configuração

| Variável | Obrigatória | Default | Efeito |
|----------|-------------|---------|--------|
| `JWT_SECRET` | **sim** | **nenhum** | Recusa o boot se ausente, em qualquer `NODE_ENV` |
| `JWT_ACCESS_TTL` | não | `15m` | TTL do access token |
| `JWT_REFRESH_TTL` | não | `7d` | TTL do refresh token |

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