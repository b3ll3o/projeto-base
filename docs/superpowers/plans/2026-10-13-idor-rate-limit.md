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

## T-B — Rate limiting: IMPLEMENTADA

**Status: implementada.** O bloqueio era o `pnpm add`, e ele ficou sem objeto
sem ter sido resolvido — o pacote não chegou por aqui:

```text
pnpm --filter @projeto/api add @nestjs/throttler
→ Permission denied (auto mode classifier): "Untrusted Code Integration"
```

MEDIDO (`git log -S'@nestjs/throttler' -- apps/api/package.json`): quem
instalou foi `0943662`, "fix: resolve 9 issues abertas (4 P0 + 5 P1) em 1 PR
unificado" (**#80**, merged em 2026-10-14T02:13:14Z) — aprovado e mergeado
pelo usuário na main, e chegou a esta branch via rebase. A regra que barra
`pnpm add` de origem não aprovada continua valendo; o que mudou é que a
origem deixou de ser esta tarefa e passou a ser uma PR já revisada.

O que o #80 trouxe, e que a T-B não precisa mais decidir:

- `@nestjs/throttler ^6.5.0` em `apps/api/package.json`;
- `ThrottlerModule.forRoot([{ ttl: THROTTLE_TTL_MS ?? 60_000, limit:
  THROTTLE_LIMIT ?? 100 }])` e `providers: [{ provide: APP_GUARD, useClass:
  ThrottlerGuard }]` — um teto **global por IP**, de 100/min.

### Colisão de escopo: resolvida pelo rebase

MEDIDO: o plano da main era `ae5015a` (**#79**, merged 2026-10-14T01:40:08Z,
"plano + state-snapshot de fix das 9 issues abertas"), que reservava a branch
`fix/api-hardening-cors-ratelimit` para a issue #72 — a mesma que o #80
resolveu. A colisão existiu e já aconteceu: o rebase desta branch sobre
`origin/main` puxou `package.json`, `app.module.ts` e o lockfile do #80, e o
que era uma colisão prevista virou integração. Não há PR-2 a reduzir: o #80
veio inteiro.

### O que a T-B acrescenta por cima do teto global

O global (100/min por IP) é a rede larga. O que falta é o **corte por conta**
em `POST /auth/login`, que é o ataque que importa: "muitas senhas contra
**um** e-mail". Com chave por IP, um atacante distribuído nunca esgota o bucket
de nenhum IP seu, e um IP único de verdade (NAT, VPN) tranca a rede inteira
atrás de um usuário que errou a senha uma vez.

- **Número e chave**: `LIMITE_LOGIN_POR_MINUTO = 5` (NIST SP 800-63B), chave
  `ip:email`, em `@Throttle({ default: { … } })` no ponto de uso — o
  `limit`/`ttl` sobrescrevem o do `forRoot` **só** nessa rota.
- **Por que `default` e não um nome próprio**: `forRoot` sem `name` registra
  um único throttler. MEDIDO, com `@Throttle({ login: { … } })`: o header
  continuava `x-ratelimit-limit: 100` em todo request e o spec caía 3/3 com
  401 onde esperava 429. Um decorator que nomeia um throttler inexistente é
  inerte, e o sintoma é justamente o 429 que nunca chega.
- **Cadastro (`POST /users`)**: **não ganhou limite próprio**. O teto global
  de 100/min por IP do #80 é o que existe contra spam de conta, e a T-B não
  adiciona um segundo número para o mesmo teto.
- **Dentes, nos dois sentidos**: `09-rate-limit.e2e.spec.ts` importa
  `LIMITE_LOGIN_POR_MINUTO` do código de produção (número duplicado no spec
  deixaria a suíte verde mentindo quando o limite mudasse) e mede que a 6ª
  tentativa **da mesma conta** leva 429 e que uma **conta B** não herda o
  bucket da A. Removendo o `getTracker` (o tracker padrão da lib volta a ser o
  IP), 2 dos 3 testes caem — e o que morre é justamente o per-conta, com a
  conta B recebendo 429 onde esperava 401.

### O que a e2e custou, medido

A previsão do plano era que a suíte quebraria por limite; a realidade foi a
inversa, e mais interessante: **as duas quebras eram bugs de spec, não do
controle**.

- `users.e2e.spec.ts` fazia **6** logins da MESMA chave `ip:email` — seis `it()`
  independentes que por acaso compartilhavam `a@b.com` (o banco é limpo entre
  testes, então são seis contas diferentes). O 6º levou 429 e o teste de
  histórico de versões caiu por um motivo que nada tinha a ver com histórico.
- O harness gastava um `POST /users` + `POST /auth/login` da conta de sessão
  em **todo** `beforeEach`: 17 testes vermelhos, 34 ocorrências de
  `o login da conta de sessão do e2e falhou: HTTP 429`.

As duas correções foram nos specs — e-mail próprio por teste, e o token da
sessão reaproveitado em vez de reemitido (`emitirTokenDeSessao` já apaga a
conta depois de emitir, então relogar não restaurava nada) — e **nenhuma no
número**. Subir o teto para a suíte passar seria trocar o controle de segurança
pela conveniência do teste.

## Abertos desta mudança (não corrigidos aqui)

Registrados, não escondidos:

- **Sem `jti` / revogação de refresh.** O `POST /auth/refresh` emite um par
  novo sem invalidar o anterior; um refresh vazado continua válido até expirar.
  Sem issue conhecida.
- **Log redaction sem teste.** `app.module.ts:11` declara
  `REDACT_PATHS = ['req.headers.authorization', 'req.headers.cookie']`, mas
  nenhum spec afirma que o header **não** aparece no log. MEDIDO: a e2e imprime
  `"authorization":"[Redacted]"` no stdout, o que é evidência de que funciona —
  evidência de log, não asserção. Sem issue conhecida.
- **Logout sem revogação server-side.** O `Sair` existe e funciona no browser:
  Server Action `sair` (`apps/web/app/users/actions.ts:21`) → `limparSessao()`
  (`apps/web/lib/sessao.ts:109`), que apaga os dois cookies httpOnly. O que
  não existe é o outro lado: MEDIDO, `grep -n logout` no `auth.controller.ts`
  → vazio. Não há rota de logout nem tabela de revogação, então um par vazado
  antes do `Sair` continua válido até expirar. Sem issue conhecida.

### Fechadas pelo #80 enquanto esta branch existia

O plano citava duas issues como "planejadas na PR-2 do plano da main". O #80
veio antes, e elas não estão mais abertas — MEDIDO no código atual, não na
memória do plano:

- **#72 (rate limiting global)** — resolvida: `ThrottlerModule.forRoot` +
  `APP_GUARD` em `app.module.ts`, 100/min por IP.
- **#73 (CORS `origin: true`)** — resolvida: `main.ts:56-58` agora passa
  `origin: allowedOrigins` / `parseAllowedOrigins()`, e o compose publica
  `ALLOWED_ORIGINS`. O `origin: true` que este plano descreveu não existe mais.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
**Versão do documento:** 1.1
**Status:** T-A e T-B concluídas
