# Pendências do PR #66 — 2026-10-08

> **Branch:** `fix/pendencias-ci-completa` · **PR:** #66
> **Origem:** correções da suíte e2e de frontend (Playwright) depois da correção
> do VO de domínio no commit `a19d1fe`.
> Um item só entra aqui **medido**: o comando, a data e o número.

## TL;DR

| # | Pendência | Veredito | Destino |
|---|---|---|---|
| L1 | Corpo RFC 7807 do 5xx carrega erro interno do Prisma em `detail` | `viva` | issue a abrir (ver abaixo) |
| L2 | `docker stop`/`start` do Postgres trocava a porta do host | **fechada neste PR** | commit `fix(api)` |

---

## L1 — o `detail` de um 5xx real devolve a mensagem interna do Prisma

**Classe:** vazamento de informação · **Severidade:** média · **Status:** `viva`

### O que foi medido

Um 5xx **real** — API no ar, Postgres parado — devolve a `message` crua do
Prisma no campo `detail` da RFC 7807. Corpo capturado da execução de e2e que
falhou nesta branch (`/tmp/e2e-f5b.log`, 2026-10-08), com os trechos relevantes:

```json
{
  "type": "https://errors.projeto.com/INTERNAL",
  "status": 500,
  "detail": "\nInvalid `this.prisma.user.findMany()` invocation in\n/home/leo/Documentos/projetos/base/apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.ts:239:41\n\n  236 // Cursor opaco = id da última row da página anterior; pegamos `take=limit+1`\n  237 // para detectar se há próxima página sem count(*) custoso.\n  238 const cursor = input.cursor ? { id: input.cursor } : undefined;\n→ 239 const rows = await this.prisma.user.findMany(\nCan't reach database server at `localhost:33180`\n\nPlease make sure your database server is running at `localhost:33180`.",
  "code": "INTERNAL",
  "traceId": "req-ex"
}
```

O que sai, em uma única resposta: **caminho absoluto da fonte**, **número da
linha**, **trecho de código com seta**, e **`host:porta` do banco**.

### Onde está

`apps/api/src/shared/infrastructure/http/global-exception.filter.ts:122`, no
ramo que trata "exceção de domínio/application, ou `Error` puro":

```ts
detail: exception instanceof Error ? exception.message : String(exception),
```

O commit `a19d1fe` desta branch fechou o caso **do VO de domínio** (que jogava
uma `UserValidationException` com a mensagem interna no `detail`). **O ramo
genérico continua igual** — e é por ele que passa qualquer erro que não seja
`HttpException`, que é exatamente o caso do Prisma.

### Quem enxerga

O cliente do web **não** usa `detail`: `apps/web/app/users/novo/actions.ts`
lê `code`, `errors[]` e `traceId` (`grep -rn "detail" apps/web/app
apps/web/lib apps/web/components --include=*.ts --include=*.tsx | grep -v
spec` → **0**). A tela mostra a mensagem genérica com o código de rastreamento.

Ou seja: **a tela está correta; a API não está.** O vazamento alcança quem fala
HTTP com a API direto — o CI incluído, porque o corpo acima foi parar no log da
execução.

### Conserto proposto (não aplicado aqui)

No ramo genérico, trocar a `message` por um texto fixo e deixar o `traceId`
como gancho de investigação:

```ts
detail: 'Erro interno. Use o traceId para rastrear a causa nos logs do servidor.',
```

O que torna isso barato é que **o `traceId` já existe e já é o que a tela
mostra** — a investigação continua possível por quem tem acesso aos logs, e
deixa de ser pública para quem não tem. Um RED para o conserto é direto:
acertar o `detail` da resposta 5xx e ver o assert falhar.

### Por que ficou registrado em vez de corrigido

Mudaria o corpo de toda resposta 5xx da API, o que toca contrato HTTP além do
escopo desta branch (que é a suíte e2e). Requer um spec do filtro e uma revisão
de contrato — o `openapi-contract-specialist` é quem deveria conduzir isso.
Issue ainda **não** criada: abrir issue no GitHub é publicação externa e depende
de autorização explícita.

---

## L2 — `docker stop`/`start` trocava a porta do Postgres (FECHADA neste PR)

**Classe:** ambiente de teste · **Status:** corrigida em `setupTestDatabase`

O `PostgreSqlContainer` publica o banco com `HostPort: "0"` — porta aleatória
sorteada a cada `docker start`. Um `stop` seguido de `start` **sorteia outra**,
e a `DATABASE_URL` da API, assada no boot, fica apontando para o vazio.

Medido com o mesmo `PostgreSqlContainer`:

| Porta | `docker port` antes do stop | depois do start | TCP do host voltou em |
|---|---|---|---|
| solta (padrão) | `33185` | **`33186`** | nunca (60.808 ms de espera) |
| fixa (`portaFixa`) | `0.0.0.0:N` | `0.0.0.0:N` | **5 ms** |

Sintoma na suíte: o F5 estourava o prazo no `finally`, o `finally` não rodava, o
banco ficava parado, e **três specs do F6** caíam em `limparBase()` com
`Can't reach database server` — um banco derrubado por um teste que já tinha
acabado.

Conserto: `SetupTestDatabaseOptions.portaFixa`, opcional (o padrão dos testes de
integração da API não muda), usado pelo `globalSetup` do Playwright.

**O lado instrutivo:** o sintoma (`banco não volta`) apontava para o Postgres e
para o Prisma. Os dois estavam bem — `pg_isready` dentro do container respondia
`READY` durante os 30 s de espera, e um `PrismaClient` isolado reconectava em
**427 ms** depois de um stop/start equivalente. O que não voltava era o TCP do
host, porque a porta tinha mudado. Medir a camada que **falha** (o TCP do host),
e não a que se supunha, é o que turned a 60 s de espera em 5 ms.