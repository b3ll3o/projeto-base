---
name: pendencias-pre-gate
slug: pendencias-pre-gate
version: 1.0
created: 2026-10-13
state_snapshot: ../../../.agents/runs/state-snapshot-20261014T003513Z.md
specialists: [docker-specialist, nextjs-specialist, test-writer, doc-writer]
reviewers: [stack-code-reviewer, security-auditor, doc-sync, test-writer]
status: em-execucao
---

# Pendências pré-gate da branch `feat/login-usuario-senha`

> Plano gerado sob a convenção [`state-aware-planning`](../../../.agents/specs/conventions/state-aware-planning.md)
> (camada 0). TDD Red→Green→Refactor em toda task de código; review ao fim de
> **cada** task; `pnpm ci:local` antes do push.

**Objetivo:** tirar da branch tudo que impede o merge — começando por uma
regressão que reprova o CI remoto — e fechar a lacuna de gate que deixou a
regressão passar.

## Decisão do snapshot: `block`, não `proceed`

O snapshot saiu com `gap_blocker: true` (G-001, G-002). O Passo 3 da skill
manda, nesse caso, despachar `agent-architect` e parar. **Desvio declarado:**
`agent-architect` cria e evolui agents; os gaps daqui são defeito de código
com conserto conhecido, não lacuna de especialidade. Despachá-lo seria
cerimônia. O que o `block` significa é o que importa: **esta branch não é
mergeável agora**, então a Task 1 e a Task 2 vêm primeiro e não podem ser
adiadas para "depois do PR".

## T1 — O compose não pode exigir segredo para subir o Postgres

`docker-compose.yml:48` — hoje `${JWT_SECRET:-}`; era o `${JWT_SECRET:?...}`
que o commit `f7041db` introduziu. O Compose interpola o arquivo **inteiro
antes de executar qualquer
comando**, então um `:?` em `services.api` quebra `config`, `ps`, `down` e
`up postgres` — inclusive para quem só quer o banco. Foi assim que o
`prisma migrate status` desta sessão precisou de
`JWT_SECRET=placeholder-para-medir-drift docker compose up -d postgres`.

O CI remoto roda `pnpm tooling:test` (`ci.yml:56`), e o
`compose-observability-profile.spec.ts` faz shell-out de `docker compose config`
→ **6 de 6 vermelhos**. `git show origin/main:docker-compose.yml | grep
JWT_SECRET` → nada: em main o spec passava. A regressão é desta branch.

**Mudança:** `JWT_SECRET: ${JWT_SECRET:-}` (default vazio — nenhum segredo
versionado) e o comentário reescrito explicando **por que** o fail-fast saiu de
lá: o Compose interpola o arquivo todo, então uma exigência por serviço custaria
os comandos que não têm nada a ver com aquele serviço.

**O invariante que isso põe em risco:** o `:?` era a segunda camada do "sem
segredo, sem token". A primeira é
[`JwtTokenService.lerChaveObrigatoria`](../../../apps/api/src/modules/auth/infrastructure/security/jwt-token.service.ts#L201),
que recusa o boot com `JWT_SECRET` vazio ou em branco. Antes de mexer, conferir
se existe spec desse caminho; se não existir, **criar** — porque a partir de agora
é a única camada, e ela é de segurança.

**Verificação (com o contrafactual, senão não prova nada):**

```bash
env -u JWT_SECRET docker compose config >/dev/null; echo "config=$?"   # 0
env -u JWT_SECRET docker compose ps     >/dev/null; echo "ps=$?"      # 0
env -u JWT_SECRET docker compose config | grep -c 'JWT_SECRET: ""'   # 1
JWT_SECRET=probe docker compose config | grep -c 'JWT_SECRET: probe' # 1  ← controle
pnpm --filter @repo/review-router-tooling test                       # 6/6
```

O `JWT_SECRET=probe` é o que separa "voltou a funcionar" de "a variável parou
de ser lida".

## T2 — O gate local tem que rodar o que o CI roda

**Não falta spec: falta escopo.** `ci:local` (`package.json:22`) filtra
`@projeto/api` e `@projeto/web`, que exclui `tooling/scripts` — onde moram os
264 testes do tooling. Foi por isso que o `EXIT=0` que medi não cobria G-001.

E o gate que existe para pegar exatamente esse tipo de erro pergunta a outra
pergunta: `check-package-json-drift.ts` valida que cada task de `turbo run` está
implementada por algum pacote **alcançável pelos `--filter`**
([`alvoDosFiltros`](../../../.tooling/scripts/ci/check-package-json-drift.ts#L226)).
Para `ci:local` tudo está implementado e tudo está no escopo → verde. Ele nunca
pergunta se o escopo cobre o workspace (G-009).

**Mudança:**

1. `ci:local` passa a executar `pnpm tooling:test` além das tasks turbo dos
   apps — são escopos diferentes por desenho (o CI já os roda separados,
   `ci.yml:55-56`), e enfiar o tooling no mesmo `--filter` não funciona porque
   `ci:local` pede `test:unit`/`test:integration`/`test:e2e`, que o tooling não
   implementa.
2. Gate novo `check-ci-local-scope.ts`: para cada task turbo de um script raiz
   com `--filter`, afirmar que **todo** pacote do workspace que implementa a task
   está no alcance. Fecha a classe de G-009, não só o G-002.

**Prova de que fecha** (a contraparte do "gate que nunca disparou"):
reverter o T1, `pnpm ci:local` → **vermelho**, e o gate nomeando o pacote fora
do escopo. Custa um edit de compose e uma execução longa; se o tempo de
`ci:local` (e2e com build) tornar isso impraticável, medir com o trecho
`turbo run test:unit test:coverage` + `pnpm tooling:test` e registrar no plano
qual foi o comando — medir menos e chamar de meio só repete o defeito.

## T3 — `pnpm test` não pode prometer "tudo"

MEDIDO: `pnpm test` → 4 tasks; roda o tooling de verdade (264 testes), roda o
stub `echo 'apps/api test stub...' && exit 0` da api, e **ignora `apps/web`**
(que não tem script `test`). `docs/MONOREPO.md:176` publicava isso como "Roda
testes de tudo" — a âncora era `:167` no dia do MEDIDO, e §6 ganhou texto desde
então e deslocou a linha.

**Mudança:** root `"test": "turbo run test:unit && pnpm tooling:test"`, e
apagar o stub de `apps/api:10` — depois de T2 ele não tem mais chamador, e um
script que só existe para ser encontrado por um `turbo run` que ninguém usa é
isca. Conferir antes que nada mais invoque `turbo run test`
(`grep -rn "turbo run test" --exclude-dir=node_modules`). `docs/MONOREPO.md:176`
passa a descrever o que o comando faz.

## T4 — `docs/STACK.md` descreve 6 pacotes que não existem

MEDIDO com `grep -rn --include=package.json --exclude-dir=node_modules
--exclude-dir=.next-e2e`: **ausentes** `class-validator`, `class-transformer`,
`next-auth`, `@auth/core`, `lucide-react`, `bullmq`, `ioredis`, `redis`.

| Linha | Diz | Verdade |
|---|---|---|
| Validação | class-validator + class-transformer | **Zod** (`ZodValidationPipe`) |
| Filas | BullMQ + Redis | não existe |
| Cache | Redis (ioredis) | não existe |
| Componentes | shadcn/ui, base em Radix | 0 `@radix-ui`, 0 `components/ui/`: escritos à mão |
| Auth client | NextAuth.js (Auth.js v5) | `lib/sessao.ts` + cookie httpOnly |
| Testes | Jest + Supertest + **Testcontainers** | `vitest@2.1.9` + `supertest@7` + `@testcontainers/postgresql@^10.13.0` |

⚠️ **Testcontainers é claim verdadeiro — não "corrigir".** A primeira redação
deste plano via `grep "testcontainers"` e declarou o pacote ausente; ele existe
como `@testcontainers/postgresql` (`apps/api/package.json:23`), importado pelo
e2e do web via `apps/api/test/testcontainers-helper.ts`
(`apps/web/e2e/global-setup.ts:42`). Só o **Jest** da linha está errado.

**Não parar no `STACK.md`.** A mesma família de claim falso aparece em
`.agents/memory/nestjs-specialist.md:27` e
`.agents/agents/nestjs-specialist.md:172,203` — e memória com claim falso é o
agente reassertando a mentira no próximo despacho. Corrigir a instância e
deixar as outras é o erro que a memória `correction-of-one-instance-closes-the-class`
já nomeia.

> ✅ **Corrigido no mesmo dia.** As três linhas foram reescritas contra o disco
> (a memória mede cada afirmação com o `grep` ao lado; o agent trocou
> `class-validator`→Zod, `Jest`→Vitest e `supertest`→`app.inject`). As âncoras
> neste parágrafo foram remedidas depois disso: `:23` era a linha do claim e
> virou `:27` quando o bloco ganhou o cabeçalho "Decisão (medida em …)". A `:172`
> era uma recomendação de exemplo que mandava *"Adicionar Testcontainers"* — mas
> `grep -rln setupTestDatabase apps/api/test/e2e` mostra **todo** spec e2e já
> subindo o Postgres real, então a recomendação descrevia um buraco inexistente.
> Virou política ("leve o e2e novo para o container compartilhado"), que é
> verdade em qualquer momento do repo.

Verificação: para cada pacote nomeado nas duas tabelas, `grep` no
`package.json` e confere — ou vira gate.

## T5 — `login-form.spec.tsx:200`: âncora de espera vacuosa

`await waitFor(() => expect(getByLabelText('E-mail')).toHaveValue('maria@…'))`
resolve na hora: o e-mail foi digitado na linha **anterior** ao clique, então a
condição já vale quando o `waitFor` começa. O teste passa medindo o DOM
pré-envio — a mesma classe que `68b16aa` consertou em três lugares deste repo.

Pior: o nome do teste diz *"não é segredo, é identidade"*, e ele **nunca
afirma a parte do segredo**. A resposta da action traz `senha: ''`; nada impede
o formulário de repopular a senha no DOM depois do erro, e o teste ficaria verde.

**Mudança:** ancorar no `[role="alert"]` — que não existe antes de a action
resolver — e só então afirmar e-mail preservado **e senha vazia**. A segunda
afirmação é a que tem o bite de segurança.

**Prova dos dois lados:** (a) today, remover o `click` mantém o teste verde
→ vacuidade; (b) com a correção, popular `valores.senha` no componente deixa o
teste vermelho → o bite é real.

## T6 — Migration pendente no banco de dev

`prisma migrate status` → "not yet been applied". Aplicar com
`prisma migrate deploy` e re-medir.

Lida a SQL, **não há risco de deploy**: a coluna entra `TEXT` nullable, um
`UPDATE` faz backfill com hash argon2id de segredo aleatório, e só então
`SET NOT NULL` — a ordem correta para base populada (`ADD COLUMN NOT NULL` sem
DEFAULT rejeitaria o DDL). Efeito colateral deliberado, documentado no arquivo:
conta pré-existente fica sem senha conhecida e precisa se cadastrar de novo.

## T7 — Reportar, não corrigir neste PR

| Gap | Por que não entra |
|---|---|
| G-007 — `DDD_BLOCKED_IMPORTS` não casa `node:` | `node:crypto` em `user-id.vo.ts` é escolha deliberada (UUID v7). Bloquear `node:` acenderia o gate numa decisão de arquitetura. Registrar para a convenção. |
| G-004 — `state-aware-planning.md` §3 Passo 1.7 pede `pnpm -r test --coverage` | O pnpm rejeita a flag (`ERROR Unknown option: 'coverage'`); sem ela seria o stub. Mudar a convenção é PR de convenção, não de bugfix. |
| G-006 | Baixado de major para minor: o risco era deploy, e não existe. |
| G-008 — MD047 em `e2e-playwright.md` | Drift herdado do `main`. Entra de brinde no passe de docs da T4. |

## Ordem e portões

```text
T1 (compose)  ──┐
                ├─► T2 (escopo do gate) ──► ci:local ──► preflight ──► commit
T3 (pnpm test) ─┤
T4 (STACK.md) ──┤
T5 (spec) ──────┤
T6 (migration) ─┘
```

T1 antes de T2 porque T2 só se prova com a T1 revertida. T4 e T5 são
independentes e podem seguir em paralelo com T3/T6.

**Portão por task:** `pnpm ci:preflight` + a suíte do pacote tocado + review por
agent **diferente** de quem implementou. **Portão final:** `pnpm ci:local` +
`pnpm tooling:test` (agora dentro do `ci:local`) + `pnpm --filter @projeto/web
test:e2e`.

## Status medido em 2026-10-13

Cada linha abaixo foi relida do disco, não da memória da execução.

| Task | Estado | Como se mediu |
|---|---|---|
| T1 | **feita** | `docker-compose.yml:48` = `JWT_SECRET: ${JWT_SECRET:-}`, com o porquê do fail-fast removido em comentário; `config`/`ps` sem a variável saem 0 |
| T2 | **feita** | gate novo [`check-ci-local-scope.ts`](../../../.tooling/scripts/ci/check-ci-local-scope.ts) + 10 specs; `ci:local` ganhou `--filter=@projeto/shared-types` e `&& pnpm tooling:test` |
| T3 | **feita** | `package.json:15` = `turbo run test:unit && pnpm tooling:test`; o stub de `apps/api` foi **removido** (não há mais script `test` no pacote) |
| T4 | **feita** | tabela de `docs/STACK.md` reescrita contra o disco; as mesmas correções em `.agents/agents/nestjs-specialist.md` e sua memória |
| T5 | **feita** | `login-form.spec.tsx:122` ancora em `expect(action).toHaveBeenCalledTimes(1)`, e os `role="alert"` são buscados com `within(form)` |
| T6 | **pendente de autorização** | `prisma migrate deploy` barrado pelo classificador de permissão; a SQL está lida e o risco avaliado acima |
| G-004 | **reportado, não corrigido** | `pnpm -r test --coverage` continua em 3 lugares (`SKILL.md:66`, `:133`, `state-aware-planning.md:109`) |
| MD047 | **feita** | `e2e-playwright.md` ganhou o `\n` final |

### Desvio declarado em G-007

O plano dizia "reportar, não corrigir", e a T7 explicava por quê: `node:crypto`
em `user-id.vo.ts` é escolha deliberada, então barrar o prefixo `node:` acenderia
o gate numa decisão de arquitetura. **O argumento estava certo sobre o risco e
errado sobre a solução.** Acender o gate não era o problema — era o gate estar
**cego a `node:` inteiro**, o que deixa passar `node:fs` num `domain/` com a
mesmanaturalidade com que barra `@nestjs/common`.

Corrigido com lista de permissões **por módulo**, não por extensão de arquivo:

- `DDD_BLOCKED_IMPORTS` (`tooling/scripts/stack-code-reviewer.ts`) e `FORBIDDEN`
  (`packages/eslint-config/rules/no-domain-imports-from-infra.js`) ganharam
  `/^node:/` e a mesma allow-list `node:crypto` + `node:util`.
- A allow-list é justificativa por arquivo real, e o número que a dimensiona
  (**2 de 12** builtins em uso) está no comentário junto do código.
- Por que por módulo e não `*.spec.ts`: `stack-code-reviewer.spec.ts:59` usa
  `domain/user.spec.ts` com `@nestjs/common` e **espera** blocker. Isentar por
  extensão abriria brecha num `.spec.ts` real.

Os 2 gates precisam continuar idênticos: um mais permissivo anula o mais
estrito, e o ESLint roda antes do reviewer.

## Achados verificados e pendência herdada

A tabela de achados re-medidos, o achado do `ci:local` que pulava
`@projeto/shared-types#typecheck`, os dois achados que **não sobreviveram** à
re-medição, e o registro do workflow de auditoria interrompido estão no
companion [`2026-10-13-pendencias-pre-gate-achados.md`](./2026-10-13-pendencias-pre-gate-achados.md).

⚠️ Duas linhas dessa tabela envelheceram no mesmo dia em que foram escritas: o
IDOR e a ausência de rate limiting estavam marcados como "fora deste PR", e o
usuário decidiu o contrário. As duas linhas corrigidas apontam para
[`2026-10-13-idor-rate-limit.md`](./2026-10-13-idor-rate-limit.md).

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
**Versão do documento:** 1.1
**Status:** Em execução
