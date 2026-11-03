# ADR-0006: Feature flags como exceção (linha ausente = ATIVADA)

- **Status:** Aceito
- **Data:** 2026-10-29
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [`../superpowers/plans/2026-10-18-feature-flags.md`](../superpowers/plans/2026-10-18-feature-flags.md) · [`../superpowers/specs/2026-10-18-feature-flags-contrato-http.md`](../superpowers/specs/2026-10-18-feature-flags-contrato-http.md)
- **ADR anterior:** [`0005-rbac-por-perfil.md`](./0005-rbac-por-perfil.md)

## Contexto

O administrador do sistema precisa **ligar e desligar funcionalidade** — e a
primeira porta de consumo real foi a emissão e o aceite de convites de
empresa. A pergunta que a decisão precisa responder é de **persistência**:
onde mora o estado "essa funcionalidade está desligada?".

Três restrições já estavam em cima da mesa quando a decisão foi fechada:

1. **Uma chave nova não pode apagar nada.** Se a chave precisa de migration
   para existir, o erro de digitação ou o rollback custa funcionalidade em
   produção.
2. **O estado é global.** A demanda é do **administrador do sistema** — a
   resposta é a mesma para todo ator, e a tabela não tem dimensão de
   empresa.
3. **Um recurso desligado não pode anunciar que existe.** Se a resposta
   disser "desligado", qualquer cliente — e qualquer scanner externo — lê
   que existe um interruptor.

## Decisão

### 1. A tabela guarda **só as exceções**

O modelo `FeatureFlag` (`apps/api/prisma/schema.prisma`) tem três colunas de
negócio: `chave` (PRIMARY KEY, TEXT), `ativada` (boolean) e os campos de
auditoria. **Sem `tenant_id`** — a flag não é por empresa.

A regra que define tudo:

> **Linha ausente = ATIVADA. A linha só existe para dizer "desligada".**

⚠️ O `DEFAULT true` na coluna é **documentação, não mecanismo** — quem decide
é o código: o repositório devolve **só as linhas gravadas**, e quem resolve o
"e se a chave não existe?" é a use case `listar()`
(`gravadas.get(chave) ?? true`,
`apps/api/src/modules/feature-flags/application/feature-flag.use-cases.ts:78`)
— do outro lado, o caminho de bloqueio passa por `chaveDesligada()`, que
inverte o sinal (desligada = existe linha com `ativada: false`). A distinção
importa: uma coluna com default resolve o "e se a chave não existe?" no
banco; a regra do código resolve na aplicação, e é ela que precisa ser a mesma
em todos os pontos de leitura.

O `DEFAULT true` também é o que torna `DELETE` seguro: apagar a linha devolve
a flag ao padrão, que é a direção segura. O `DELETE` ficou concedido ao
runtime de propósito, como recurso de emergência.

### 2. A chave é código, e o estado é dado

O catálogo vive em `apps/api/src/shared/auth/feature-flag-catalog.ts` — hoje
**1** chave, `tenancy.invites` (medido em 2026-10-29):

```bash
sed -n '/^export const FEATURE_FLAGS = \[/,/\] as const;/p' \
  apps/api/src/shared/auth/feature-flag-catalog.ts | grep -c "chave: '"   # → 1
```

`FeatureFlagKey` é o tipo derivado do array, e `isFeatureFlagKey()` é o type
guard: `@RequireFeatureFlag('typo')` não compila.

⚠️ `chave` é TEXT, **não ENUM**: um ENUM duplicaria a fonte da verdade
dentro do banco e exigiria migration a cada flag nova.

### 3. O guard responde **404 genérico**, não 403

`FeatureFlagGuard` (`apps/api/src/modules/feature-flags/infrastructure/http/guards/feature-flag.guard.ts`)
lanza `NotFoundException()` — o mesmo corpo de uma rota que não existe. Um
403 (ou um 404 com corpo que nomeie a flag) entregaria a existência da porta.

O corpo é idêntico ao de "rota inexistente" porque **é** a mesma resposta do
ponto de vista de quem não deveria saber da porta: para o cliente, a
funcionalidade simplesmente não existe.

⚠️ O guard é **fail-closed sem `req.user`**: `403 ForbiddenException` antes
de qualquer leitura. Ele não substitui a autenticação — e por isso **não
serve para porta `@Public()`**, porque o `JwtAuthGuard` retorna antes de
publicar `req.user` em rota pública.

### 4. A regra D4 mora em **uma** função

`chaveDesligada(repositorio, chave)` é a única implementação da semântica
"ausente = ATIVADA". Ela é exportada e usada nas **duas** portas de
`tenancy.invites`:

| Porta | Mecanismo | Por quê |
|---|---|---|
| `POST /tenants/:id/invitations` | `@RequireFeatureFlag('tenancy.invites')` | o decorator basta |
| `POST /invitations/accept` | `@RequireFeatureFlag('tenancy.invites')` | o decorator basta |
| `POST /users` | `chaveDesligada(flags, 'tenancy.invites')` **no corpo** | a rota é `@Public()` e a decisão depende do `destino` do **corpo**, que o decorator não enxerga |

⚠️ O `POST /users` foi medido com a flag **desligada** e **criava conta e
membership** — 201, com a funcionalidade fora. As duas portas "de propósito"
foram fechadas: o alcance da chave é as **três** portas, e não há exceção.

A lista de portas é **declarativa**, não prosa: o bloco `portas:` do
contrato HTTP §8.1, e o gate `check-feature-flag-portas` confere a paridade
nos **dois** sentidos (porta listada que não existe no código, e controller
que tranca a chave e não está na lista). A porta esquecida de declarar é o
modo de falha real — o `FeatureFlagGuard` passa quando não há requisito, e
esquecer o decorator **não desliga nada**.

### 5. Várias chaves são **E**, não OU

`@RequireFeatureFlag('a', 'b')` exige que **todas** estejam ligadas. É o
oposto de `@RequirePermission`, que é OU ("basta uma destas"). A diferença é
semântica: permissão é "basta uma destas"; flag é "esta funcionalidade
depende destas".

### 6. O bloqueio é registrado, e o token **nunca** é

`registrarBloqueio(chave, req)` loga com campos estruturados (`featureFlag`,
`metodo`, `rota`, `ator`, `traceId`) e **nunca** o token — em `POST /users` o
token do convite está literalmente no escopo (`body.destino.token`), e log é
onde segredo vaza com mais frequência.

O log é **involuntário quanto ao status**: o 404 é o contrato da porta e não
depende de o log ter funcionado. O `try/catch` existe para isso — um `warn`
que lança (stdout em pipe morto, disco cheio) trocaria um 404 honesto por um
500.

### 7. Quem alterna é o administrador do **sistema**

`ehAdministradorDeSistema(ator)` — `tenantId === null && isAdmin`. Um admin de
**empresa** (`tenantId` preenchido) é barrado: flag global não é dele.

⚠️ O `@RequirePermission('admin.manage-feature-flags')` no controller **não**
é o portão: o cadastro de empresa concede `listAllPermissions()` ao dono, e
nenhuma migration faz backfill de `authorizations` — então o dono de empresa
criado a partir desta versão tem a chave no banco e é barrado pelo
`PermissionsGuard` **antes** do portão. O desfecho é o mesmo 403; muda só
quem recusou.

O mesmo motivo impede o client web de mandar `X-Tenant-Id` na tela de flags:
enviar o header tira o ator do bucket global, e o portão exige `tenantId ===
null`.

### 8. Sem cache, sem RLS, sem optimistic locking

- **Sem cache**: cada request guardado lê o banco. É o comportamento de
  kill-switch — o valor tem de valer no instante em que o admin desliga.
- **Sem RLS**: a tabela não tem `tenant_id`, e a policy de empresa não teria
  o que olhar. Escrever RLS aqui seria **teatro de segurança**.
- **Sem `If-Match`/`ETag`**: o `PUT` é o estado inteiro do recurso, e a
  coluna `version` **não é lida nem escrita** por nada. Isso desvia da
  convenção do próprio repo — e está registrado como tal no contrato HTTP §1.

## Consequências

### Positivas

- **Chave nova não apaga nada.** Entra no catálogo, aparece ligada na tela,
  e nenhuma migration é necessária.
- **Desligar é reversível em um passo.** `DELETE` na linha volta ao padrão.
- **O 404 não entrega a porta.** Nem o cliente legítimo nem o scanner externo
  conseguem distinguir "desligada" de "não existe".
- **A semântica tem um dono.** `chaveDesligada()` é a única implementação; a
  segunda cópia de D4 foi justamente o defeito que a função existe para
  impedir.
- **O gate torna a lista de portas verificável.** A porta esquecida de
  declarar falha o preflight, nos dois sentidos.

### Negativas, e o que fica proibido daqui pra frente

- **Proibido: `default: false` em qualquer lugar do caminho.** A linha
  ausente **é** ATIVADA. Um `?? false` onde cabe `?? true` troca o default
  do sistema inteiro.
- **Proibido: semântica de flag duplicada.** Toda leitura passa por
  `chaveDesligada()` ou pelo `listar()` da use case, que faz
  `gravadas.get(chave) ?? true`.
- **Proibido: 403 (ou corpo que nomeie a flag) no caminho de bloqueio.** O
  404 genérico é o contrato.
- **Proibido: estado de flag em `localStorage`/cookie do cliente.** O cliente
  lê o booleano que a API devolve; ele nunca infere estado por ausência.
- **Proibido: `tenant_id` na tabela de flags.** A tabela responde "esta
  funcionalidade está disponível no sistema inteiro?", e a resposta é a mesma
  para todo ator.
- **Proibido: chave fora do catálogo.** `chave` é TEXT no banco, mas o
  catálogo é o vocabulário — e uma chave gravada sem estar no catálogo
  não aparece na tela nem é lida pelo `isFeatureFlagKey`.
- **O `DELETE` é um recurso sem consumidor.** Ele fica de propósito
  (emergência), mas é um verbo que ninguém usa — e verbo concedido sem
  chamador é superfície.

### Em aberto

- **A lista de portas é declarativa, e o gate não cobre consumo indireto.**
  Uma porta que **consuma** a funcionalidade sem mencionar a chave é
  indistinguível, para qualquer gate que leia texto, de uma rota que não
  consome nada. Detectar "consome" exigiria análise de fluxo — é decisão de
  projeto, não de implementação, e está declarado no contrato HTTP §8.1.
- **A coluna `version` está inerte.** Ela existe por convenção das outras
  models do schema. O dia que houver cache de flag, ou ela passa a ser
  escrita e o PUT ganha `If-Match`, ou ela sai em migration. O que não pode
  é continuar muda sem ninguém dizer por quê.

## Alternativas consideradas

- **Linha presente = ATIVADA, ausente = DESLIGADA (default desligado)** —
  rejeitado: o default tem de ser o estado que o sistema **já tem**. Com
  default desligado, chave nova no catálogo nasce desligada, e o erro de
  digitação custa funcionalidade em produção.
- **Bandeira em código, sem tabela** — rejeitado: a demanda é o admin
  **do sistema** ligando e desligando, e um toggle em código só muda com
  deploy. A tabela existe para o estado; o catálogo continua em código,
  porque o **vocabulário** de chaves é código revisável.
- **Coluna `tenant_id` na tabela (flag por empresa)** — rejeitado: a
  demanda é do administrador do **sistema**, e flag por empresa é decisão de
  produto que ninguém pediu. A tabela sem `tenant_id` é o que torna a
  pergunta ("no sistema inteiro?") expressável.
- **403 em vez de 404 no bloqueio** — rejeitado: 403 diz "existe e você não
  pode", e isso entrega a existência da porta. O 404 genérico é a mesma
  resposta de uma rota que não existe.
- **RLS na tabela de flags** — rejeitado: não há `tenant_id` para a policy
  olhar. Seria uma condição constante inútil — teatro de segurança.
- **Cache do estado da flag** — rejeitado: cache traria `invalidateAll()` e
  a classe de bug de estado obsoleto de graça, e o valor de uma kill-switch
  tem de valer no instante em que o admin desliga.

## Ver Também

- [`../agents/domain.md`](../agents/domain.md) — o índice de decisões
  arquiteturais do repo.
- [`../api/feature-flags.md`](../api/feature-flags.md) — contrato HTTP do BC
  `feature-flags`.
- [`../superpowers/specs/2026-10-18-feature-flags-contrato-http.md`](../superpowers/specs/2026-10-18-feature-flags-contrato-http.md)
  — o contrato HTTP e a lista declarativa de portas (§8.1).
- [`./0005-rbac-por-perfil.md`](./0005-rbac-por-perfil.md) — a **outra**
  forma de desligar comportamento: permissão é *quem pode*, flag é *se existe*.
