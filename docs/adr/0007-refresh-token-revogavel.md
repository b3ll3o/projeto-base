# ADR-0007: Refresh token revogável (o `jti` no registro)

- **Status:** Aceito
- **Data:** 2026-11-08
- **Decisores:** Equipe de arquitetura + agents especialistas
- **Specs relacionadas:** [ADR-0002](./0002-autenticacao-jwt-argon2.md) · [issue #132](https://github.com/b3ll3o/projeto-base/issues/132)
- **ADR anterior:** [0006-feature-flags-como-excecao.md](./0006-feature-flags-como-excecao.md)

## Contexto

O [ADR-0002](./0002-autenticacao-jwt-argon2.md) decidiu por **access + refresh
stateless**, e ele registrou o preço com honestidade:

> **Um token já emitido não é revogado.** O JWT é stateless: não existe lista
> de revogação, e o `guard` valida assinatura e expiração, não o estado da
> conta.

Era um preço aceito, e o ADR dizia o que fazer quando ele virasse requisito:
*"lista de revogação por `jti`, `version` de sessão no banco, ou token curto
sem refresh"*. A [issue #132](https://github.com/b3ll3o/projeto-base/issues/132)
é o dia em que ele virou.

O desenho que existia:

- access e refresh saíam da **mesma função**, com o **mesmo payload**
  (`sub`, `email`, `typ`) — e **sem `jti`**;
- o refresh valia por **7 dias** (`DEFAULT_REFRESH_TTL = '7d'`);
- **não existia** rota de logout no backend — o "sair" do web apagava o
  cookie, e o token continuava válido no servidor;
- **não existia** binding de sessão, nem troca de senha pela API, nem
  verificação de e-mail.

O resultado: um refresh token vazado (XSS em origem não relacionada, log de
proxy, backup de browser, dispositivo compartilhado) valia por 7 dias e **se
renovava sozinho** — nenhuma ação do titular o invalidava, e a única forma de
matar a sessão era trocar o `JWT_SECRET` global (que derruba **todas** as
sessões de **todos** os usuários) ou deletar a conta.

## Decisão

### 1. O refresh token ganha `jti`, e o `jti` é REGISTRADO

Toda emissão de token passa a carregar um `jti` (`randomUUID()`) — **cada
token com o seu**, e não um `jti` compartilhado pelo par.

O `jti` do refresh vai para a tabela `refresh_tokens`
(`jti` PK, `user_id`, `revoked_at`, `expires_at`, `created_at`). A assinatura
HMAC prova que o token é do servidor; o **registro** prova que ele ainda vale.
Um token cujo `jti` está revogado é recusado, mesmo com a assinatura
perfeita.

### 2. Rotação: o refresh token é de uso ÚNICO

`POST /auth/refresh` **consome** o `jti` apresentado (grava `revoked_at`) e
emite um par novo, com um `jti` novo, no mesmo registro.

O efeito é o que importa: um token usado deixa de valer. Se alguém roubou o
token e a pessoa legítima renovou primeiro, o token roubado já é lixo.

### 3. Detecção de replay, com janela de tolerância

Um `jti` **já revogado** que reaparece é, na maioria das vezes, um **uso
concorrente** — um retry de cliente, duas abas, dois workers. Ler isso como
ataque mataria a sessão de quem está usando a API de verdade.

Por isso há uma **janela de 30 segundos**: um `jti` revogado há menos de 30 s
é uso concorrente (401, e a sessão sobrevive). Passada a janela, é **replay** —
e a resposta é `revogarTodosDoUsuario`, que derruba a sessão da conta
inteira.

Por que a conta inteira, e não só a "família" do token? Porque a família não
é representável no modelo sem uma coluna a mais, e porque o efeito
desejado (o atacante que tem o token roubado perde a sessão) é o mesmo. O
preço — o usuário logado em outro dispositivo perde a sessão também — está
declarado abaixo.

### 4. `POST /auth/logout` — e ele é `@Public()`

A rota recebe o **refresh token no corpo** (o mesmo formato de
`/auth/refresh`) e revoga o `jti`.

Ela é `@Public()` porque **o refresh token é a credencial do logout**: quem
apresenta o token é quem manda revogá-lo. Exigir o access token seria pedir a
credencial de quem já tem o equivalente do token que se quer matar — e o
access vive 15 minutos, o refresh 7 dias: quem ficou logado mais de 15 min
sem usar a API levaria 401 no logout, e o token (que é o que importa)
continuaria válido.

O web chama a rota antes de apagar o cookie. A revogação é **tentativa**: se
a API estiver fora do ar, o logout acontece igual (o cookie é apagado), e o
pior caso é o token ficar vivo no servidor — que é o estado anterior a esta
ADR, e não um estado novo.

### 5. A tabela é do caminho de SISTEMA — e `app_runtime` NÃO a alcança

`ALTER DEFAULT PRIVILEGES` dá CRUD em **toda** tabela nova para `app_runtime`
e para `app_system`. Isso é um problema: `app_runtime` é a credencial que o
próprio repo classifica como *"a que mais vaza (está no env, em log, em
mensagem de erro)"*, e com `UPDATE` liberado ela **desrevogaria** qualquer
refresh token — inclusive o token roubado que disparou a detecção de replay.
A revogação seria um controle que a credencial mais exposta do sistema
consegue desfazer.

A migration faz `REVOKE ALL … FROM app_runtime` (e de `PUBLIC`), e o
`GRANT` explícito para `app_system`. Login, refresh e logout falam com a
tabela pela credencial de sistema (`comEscopoDeSistema`), que é o mesmo
caminho que o login já usava para ler o usuário.

**Sem RLS, de propósito:** o predicado de escopo do banco
(`no_escopo_atual`) compara a coluna com a **EMPRESA** (`app.tenant_id`), e
a coluna daqui é o **USUÁRIO**. Não há policy que case as duas — e uma policy
que não filtra nada é pior do que nenhuma: ela parece proteção.

### 6. O prazo de 7 dias FICA — e a justificação é esta

O TTL padrão do refresh continua `7d`. A justificativa, e o que ela NÃO
promete:

- **O prazo efetivo hoje é o da sessão do browser, não os 7 dias.** O web
  **não tem** fluxo de renovação (`lib/api-client.ts` não tem método de
  refresh), e o cookie de sessão **não tem `maxAge`** — ele morre quando o
  browser fecha. Os 7 dias são o **teto** de validade do token, e não o
  prazo que a pessoa sente.
- **Com a revogação, o prazo deixou de ser o único controle.** Antes, 7 dias
  era o tempo que um token roubado tinha de vida útil. Agora ele é o tempo
  que um token legítimo pode ser usado — e o logout o corta na hora.
- **O que continua sendo verdade:** um token roubado **não** dá logout ao
  atacante, e a pessoa só descobre o comprometimento quando tenta usar a
  conta. Trocar a senha pela API (que **não existe** — ver "Não decidido")
  seria o próximo degrau.

## Consequências

### O que mudou para quem usa a API

- `POST /auth/logout` existe, e o corpo é `{ refreshToken }` — igual ao de
  `/auth/refresh`.
- Um refresh token **não** pode ser usado duas vezes: o segundo uso é 401.
- **Toda sessão que existia no momento do deploy é deslogada.** O token
  antigo não tem `jti`, e um token sem `jti` não tem como ser revogado —
  então ele é **recusado**. A alternativa (aceitar) deixaria a revogação
  aberta justamente para os tokens que sobraram. Quem fizesse login depois
  do deploy não é afetado.

### O que NÃO mudou

- O access token continua stateless e continua lasting 15 minutos. Ele não
  é revogável — e não precisa ser: o logout corta o refresh, e o access
  expira em 15 minutos.
- O `JWT_SECRET` continua sendo global: trocá-lo continua derrubando todas
  as sessões de todos os usuários. O que mudou é que agora existe um
  caminho **fino** (revogar um token) ao lado do **grosso**.
- A troca de senha pela API **não existe** — e é o próximo degrau do roteiro
  (ver abaixo).

### O preço, declarado

- **O replay derruba a conta inteira.** Um `jti` revogado há mais de 30 s
  que reaparece revoga os tokens de **todos** os dispositivos da conta. O
  usuário que estava logado no desktop perde a sessão junto com o atacante.
  O preço é de propósito (é a resposta padrão do OAuth BCP para reuso), e a
  janela de 30 s é o que evita que oConcurrency comum o pague.
- **E, DENTRO da janela de 30 s, o replay NÃO expulsa o atacante.** A janela
  existe porque um `POST /auth/refresh` com o token que acabou de ser
  rotacionado é, na maioria das vezes, um **retry** — e tratá-lo como ataque
  derrubaria a sessão de quem está usando a API de verdade. O preço é o
  inverso do de cima: nos 30 s seguintes à rotação, um token roubado que é
  re-presentado recebe 401 mas **não** derruba a conta. Quem quiser o
  comportamento estrito espera 30 s — ou aceita o retry quebrando a sessão.
- **A rotação é UMA transação.** O consumo do `jti` antigo e o registro do
  novo acontecem juntos (ou não acontecem). Em duas transações, o intervalo
  entre elas deixaria o token velho consumido e o novo sem registro — e quem
  pegasse o intervalo ficaria **sem refresh token nenhum**, sem caminho de
  recuperação (o web não renova). Com uma transação, nunca existe um token
  emitido sem registro.
- **As colunas de tempo são `timestamptz`, e não `timestamp`.** MEDIDO
  2026-11-08 num Postgres 16 real: a poda (`expires_at < now()`) com a coluna
  `timestamp` (parede de relógio, sem fuso) removia tokens **que ainda valiam**
  num banco à frente do UTC (2 podados em `Asia/Tokyo`) e não podava nenhum
  num banco atrás (0 em `America/Sao_Paulo`). Com `timestamptz` a comparação
  é de instantes, e vale em qualquer fuso.
- **A tabela cresce.** Uma linha por login. A poda é por `expires_at`, e ela
  roda no `prepara-papeis.sh` (o passo de manutenção do banco no boot do
  container).
- **O web ainda não renova.** O token continua morrendo com a sessão do
  browser, e o fluxo de renovação do web é trabalho futuro.

### Não decidido (e por quê)

- **Trocar a senha pela API** (`PATCH /me/senha`). É o degrau seguinte do
  roteiro de sessão, e exige uma decisão de produto (a troca derruba as
  sessões da conta? exigindo a senha atual?). Não coube aqui.
- **Binding de sessão** (dispositivo, IP, agente). A detecção de replay
  cobre o caso comum; o binding é o que distingue "a pessoa trocou de
  aparelho" de "alguém roubou o token".
- **A rotação em background** (renovar proativamente, antes de expirar).
  Nenhuma das rotas de hoje faz isso.

## Alternativas rejeitadas

- **Sessão em banco (token opaco).** Dá revogação imediata, ao custo de uma
  leitura de banco por request. O ADR-0002 já a rejeitou; a rotação com
  registro dá o efeito de revogação sem o custo por request.
- **Lista de revogação em memória.** Não sobrevive a um restart, e não é
  compartilhada entre réplicas. O registro é em banco porque o problema é
  justamente o token sobreviver ao processo.
- **Revogar no `logout` pela busca do `sub` (todos os tokens da conta),
  sem rotação.** Revoga mais do que o necessário (o logout de um dispositivo
  derrubaria os outros) e não impede o reuso do token roubado.
- **Encurtar o TTL para 24h "até existir revogação".** Com a revogação
  existente, o prazo deixou de ser o único controle — e encurtá-lo puniria o
  usuário sem fechar o furo.
- **Coluna `family_id` na tabela.** A "família" (a linhagem de um login) é o
  modelo do OAuth BCP para revogação granular. Rejeitada aqui por ser uma
  coluna e um conceito a mais para um ganho que o replay — que já é um evento
  raro — não pede.

## Ver Também

- [ADR-0002](./0002-autenticacao-jwt-argon2.md) — a decisão original, e a
  seção "O que o JWT **NÃO** garante" que esta ADR substitui.
- [`../api/auth.md`](../api/auth.md) — o contrato HTTP de auth.
