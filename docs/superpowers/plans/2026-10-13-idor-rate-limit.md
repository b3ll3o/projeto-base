# Plano de mudança: autorização por dono e rate limiting

> Branch `feat/login-usuario-senha`, 2026-10-13. Complementa
> [`2026-10-13-pendencias-pre-gate.md`](./2026-10-13-pendencias-pre-gate.md),
> que registrou os dois itens como "fora deste PR"; a decisão do usuário
> inverteu isso no mesmo dia.
>
> Duas decisões de produto separadas, deliberadamente não misturadas:
> **autorização** (o que cada pessoa pode tocar) e **limitação de taxa**
> (quantas tentativas por janela).

## T-A — Autorização: dono do recurso

### O defeito, medido antes de consertar

MEDIDO ao vivo em 2026-10-13, com dois tokens reais: um da conta A e um da
conta B. Sem `UserOwnershipGuard`, o token da conta A recebia `200`/`204`
sobre o id da conta B em **cinco** rotas:

| Rota | Antes | Depois |
|---|---|---|
| `GET /users/:id` | `200` com nome e e-mail da vítima | `403 USER_OWNERSHIP_VIOLATION` |
| `PATCH /users/:id` | `200` + renomeava o registro alheio | `403` |
| `DELETE /users/:id` | `204` + apagava o registro alheio | `403` |
| `POST /users/:id/restore` | `201` + ressuscitava o registro alheio | `403` |
| `GET /users/:id/history` | `200` com o histórico da vítima | `403` |

O que faltava era a segunda metade de autenticação. Não existe modelo de papel
neste repositório, então "admin pode ver todos" não tinha onde ser escrito.
MEDIDO no mesmo dia, `grep -rnE "\b(role|papel|permissao|permissão|admin|RBAC)\b"
apps/api/src --include=*.ts | grep -v "policies/user-ownership.policy.ts"` →
**1**, e essa 1 é a frase "sem token de sem permissão" num comentário de
`jwt-auth.guard.ts`, não código; `grep -rn "tenant\|orgId" apps/api/src` → **0**.

⚠️ **A primeira versão dessa medição dizia "0 ocorrências" com um grep sem
fronteira de palavra, e estava errada por dois motivos ao mesmo tempo.** O
comando sem `\b` casa `role` dentro de "controle" (`tracing.ts:58`), e o
comando com `\b` casava o próprio comentário que documenta a medição —
escrever o número no arquivo é o que o invalida. Um grep cujo único hit é a
frase que o documenta não mede o repo.

### A correção

Duas peças, deliberadamente separadas:

- **Política de domínio** — `exigirPropriedade(actorId, alvoId)` em
  [`user-ownership.policy.ts`](../../../apps/api/src/modules/users/domain/policies/user-ownership.policy.ts).
  Lança `UserOwnershipViolationException`. A função **lança** em vez de
  devolver `boolean`: um `if (pode) { ... } else { segue em frente }` é o
  defeito original com outro nome — o caminho que esquece o `else` continua
  compilando.
- **Casca HTTP** — `UserOwnershipGuard` em
  [`user-ownership.guard.ts`](../../../apps/api/src/modules/users/infrastructure/http/user-ownership.guard.ts),
  aplicado com `@UseGuards` nas 5 rotas. Um guard, e não um `if` por handler,
  porque a 6ª rota por-id nasceria sem proteção **silenciosamente** — o código
  compila e os testes antigos passam.

A mensagem de erro não embute nenhum dos dois ids: o corpo de um 403 não pode
virar um oráculo que confirma a existência do registro alheio.

### Duas decisões que NÃO são só técnica

**1. A listagem `GET /users` continua ABERTA — e isso é produto.** A tela
`/users` lista o diretório; aplicar "só o próprio" devolveria uma linha e
apagaria a tela. Registrado aqui para que a exclusão deliberada não vire
"omissão" na leitura do próximo — e `apps/api/test/e2e/scenarios/08-ownership.e2e.spec.ts`
trava a escolha: se alguém "consertar" a listagem, o teste cai e a mudança vem
com a decisão de produto que a acompanha.

**2. `:id` que não é UUID v7 continua dando `400 VALIDATION_ERROR`.** O guard
roda **antes** dos pipes, então comparar `sub` com `not-a-uuid` devolveria 403
e mandaria quem só errou o formato procurar um bug de autorização que não
existe — MEDIDO: o cenário 04 caía aí depois da primeira versão. O guard defere
o id não-UUID ao domínio, e o cenário 08 fixa o contrato. A deferência só é
segura porque `UserId.create` recusa o **mesmo** `UUID_RE`, que passou a ser
exportado de [`user-id.vo.ts`](../../../apps/api/src/modules/users/domain/value-objects/user-id.vo.ts)
— duas cópias do que é "um id" divergem no primeiro ajuste de formato.

### Dentes medidos

- `user-ownership.policy.spec.ts` — 5 testes: dono aceito, outra pessoa
  recusada, `undefined` recusado, confusão de prefixo recusada nos dois
  sentidos, mensagem sem ids.
- `08-ownership.e2e.spec.ts` — 5 testes: a **metade positiva** nas 5 rotas (sem
  ela, um 403 verde nos dois lados é o modo mais barato de um gate medir
  nada); a negativa nas 5 rotas com `if-match` correto, para que o 403 não
  possa ser um 412 mascarado; o efeito (o nome da vítima continua `'Vitima'`
  na base), não só o status; e o corpo do 403 sem nome/e-mail da vítima.
- ⚠️ O `id` **aparece** em `instance` do corpo do 403, e a primeira versão do
  teste o proibia. MEDIDO: `global-exception.filter.ts:55` monta
  `instance = \`${request.method} ${request.url}\`` — o id volta porque **o
  atacante o digitou na URL**. Proibi-lo exigiria reescrever o filtro inteiro
  para esconder a própria requisição de quem a fez. O teste agora afirma o
  que importa: o corpo não devolve nada que o caller não tivesse antes de
  perguntar.

## T-B — Rate limiting: BLOQUEADO

**Status: decisão tomada, implementação não feita.** O usuário aprovou
("Adicionar throttler agora"), e o primeiro comando foi recusado:

```text
pnpm --filter @projeto/api add @nestjs/throttler
→ Permission denied (auto mode classifier): "Untrusted Code Integration"
```

O classificador exige aprovação explícita da **origem do pacote**, e o plano
não pode instalar a dependência sem isso. Estado atual, verificado: `grep -n
throttler apps/api/package.json` → vazio; o pacote não está em
`node_modules/.pnpm`.

### Colisão de escopo com o plano que está na main

MEDIDO em `origin/main` (`ae5015a`, "plano + state-snapshot de fix das 9 issues
abertas", #79): a issue **#72** ("Sem `rate-limit` global na API") já está
planejada, e o plano reserva para ela a branch
`fix/api-hardening-cors-ratelimit`, com `apps/api/src/main.ts`,
`apps/api/src/app.module.ts` e `apps/api/package.json` como arquivos
principais — **os mesmos que a T-B tocaria aqui**.

O usuário pediu o throttler **nesta** branch, o que é legítimo; o que precisa
sair escrito é a consequência: se a T-B for implementada aqui, a PR-2 do plano
da main tem de ser **reduzida à issue #73 (CORS)**, senão as duas branches
mudam `app.module.ts` e `package.json` ao mesmo tempo e o conflito aparece no
merge. Não corrigi o plano da main porque ele não é meu e a decisão de
reparto é do usuário.

### Decisões de desenho já tomadas (para quando o install for autorizado)

- **Números**: `POST /auth/login` — 5 tentativas por minuto por **conta**
  (chave `ip:email`), não por IP. É a chave certa para brute force de senha:
  o ataque que importa é "muitas senhas contra **um** e-mail", e chavear por IP
  deixa passar o ataque distribuído e prende a rede inteira atrás de um
  usuário legítimo atrás de NAT. `POST /users` (cadastro, `@Public()`) —
  teto por IP, bem mais alto, porque é o que existe contra spam de conta.
- **Ponto de aplicação**: `@Throttle` na rota, com `ThrottlerGuard` em
  `@UseGuards` nos controllers, e **sem `APP_GUARD`**. O mesmo argumento que o
  `JwtAuthGuard` usa neste repositório (ver o bloco no topo de
  `auth.controller.ts`): um `APP_GUARD` global troca o marcador no ponto de
  uso por uma lista centralizada que alguém esquece, e a rota nova fica
  protegida por acidente em vez de por leitura.
- **O que a e2e vai custar**: as suítes compartilham container e IP
  (`127.0.0.1`), e `apps/api/test/e2e/users.e2e.spec.ts` sozinho faz **21**
  `POST /users` num app — `grep -c "url: '/api/v1/users'"` → 5 literais, mais 6
  de `criarUsuarioAutenticado` (`grep -c "criarUsuarioAutenticado(e2e,"`), mais
  1 por `beforeEach` × 10 `it`s. Um teto de cadastro por IP abaixo de ~60/min
  quebraria a suíte por um motivo que não é do spec. Por isso o limite de
  cadastro é alto **e** a prova de dentes é um spec que importa o número do
  código de produção e dispara até o `429` — medir que o limite existe, não que
  o número é grande.

## Abertos desta mudança (não corrigidos aqui)

Registrados, não escondidos. Os dois primeiros já são issues abertas com PR
planejada na main (`ae5015a`) — estão citados pelo número em vez de
re-descritos aqui, porque copiar a decisão de outro plano é como ela envelhece:

- **Sem `jti` / revogação de refresh.** O `POST /auth/refresh` emite um par
  novo sem invalidar o anterior; um refresh vazado continua válido até expirar.
  Sem issue conhecida.
- **Log redaction sem teste.** `app.module.ts:11` declara
  `REDACT_PATHS = ['req.headers.authorization', 'req.headers.cookie']`, mas
  nenhum spec afirma que o header **não** aparece no log. MEDIDO: a e2e imprime
  `"authorization":"[Redacted]"` no stdout, o que é evidência de que funciona —
  evidência de log, não asserção. Sem issue conhecida.
- **Rate limiting global** — issue **#72**, planejada na PR-2 do plano da main.
- **CORS `origin: true` em dev/staging** — issue **#73**, mesma PR-2.
  `main.ts:32`, `app.enableCors({ origin: true, credentials: true })`.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
**Versão do documento:** 1.0
**Status:** T-A concluída · T-B bloqueada no install
