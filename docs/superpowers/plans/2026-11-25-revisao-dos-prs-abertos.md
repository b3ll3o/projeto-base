---
name: plano-revisao-dos-prs-abertos
description: "A 2ª rodada de revisão dos PRs abertos — 4 PRs (#192 a #195), 3 revisores em paralelo (Prisma, HTTP e segurança) e 1 achado P0 medido ao vivo: a função `SECURITY DEFINER` que lê a chave de assinatura dava ao papel de RUNTIME a leitura direta do segredo, e com ele a escalada inteira (a vítima ganhou `owner` numa empresa alheia). O plano fecha esse furo e mais 7 achados — o `P2002` do `users_history` traduzido como 'email já em uso', o duplo em memória que não era atômico, e 5 IRs de fluxo que nomeavam um método removido."
version: 1.0.0
updated: 2026-11-25
status: em-execucao
---

# Plano — a 2ª revisão dos PRs abertos (#193, #194, #195)

> **Demand:** *"analise todos os prs abertos, crie um worktree diferente para
> cada pr, faça um plano para corrigir todos os achados e melhorias dos prs,
> revise o plano e corrija os erros, execute o plano atualizando os prs,
> revise tudo e corrija os erros, commit e push nos prs"*.
>
> **Composition:** camada 1 = **3 revisores em paralelo** (Prisma, HTTP/contrato,
> segurança) — um por PR, com a lens do stack; camada 2 = plano, revisão
> adversarial e correção; camada 3 = execução e revisão de tudo.

## 0. O que mudou entre a 1ª revisão e esta

A 1ª revisão (publicada nos PRs) aprovou os 4 PRs. Esta é a **2ª rodada**: ela
olha o que a 1ª deixou passar, com o código **já mergeado** no `main` como
contraprova.

O que mudou de verdade:

| | 1ª rodada | 2ª rodada |
|---|---|---|
| PRs | 4 (189, 190, 191, 192) | 4 (192, 193, 194, 195) |
| Revisão | a do próprio PR, feita na abertura | 3 revisores **em paralelo**, um por PR, com lens do stack |
| Achado mais grave | nenhum P0 | **1 P0 medido ao vivo** |

E o `main` andou: `v1.32.0` → `v1.36.0` (os PRs #189 a #192 entraram). Isso
muda o que os PRs restantes precisam carregar — o §8 do
[`plano-issues-abertas-178-187.md`](./2026-11-25-issues-abertas-178-187.md)
registra a reconcileiação.

## 1. Os worktrees

Um worktree por PR, todos com `node_modules` por symlink (o `pnpm` do monorepo
não instala duas vezes) e nenhum toque no repositório principal:

| PR | Worktree | Branch |
|---|---|---|
| #192 | `/tmp/wt-pr1` | `fix/imagem-prod-sem-egress-e-sem-devdeps` |
| #193 | `/tmp/wt-fix-193` | `fix/193-credencial` (a partir de `origin/fix/a-credencial-de-dono-nao-chega-a-api`) |
| #194 | `/tmp/wt-fix-194` | `fix/194-atomicidade` (a partir de `origin/fix/a-mutacao-e-a-auditoria-na-mesma-transacao`) |
| #195 | `/tmp/wt-fix-195` | `fix/195-plano` (a partir de `origin/docs/plano-das-issues-178-187`) |

⚠️ **Os worktrees `/tmp/wt-pr*` estavam ocupados por outra sessão** que
mergeou #189 a #192 no mesmo repositório. Os worktrees `fix/*` foram criados
depois disso, sobre as branches JÁ atualizadas com o merge do `main` — porque
empilhar em cima de uma branch antiga teria trazido de volta o conflito de
rodapé dos 6 arquivos versionados.

## 2. O achado P0 (medido ao vivo, no #193)

### 2.1 O que a 1ª versão do PR fazia

O PR #193 tira a credencial de DONO do processo da api — que é o ponto da issue
#180. A leitura da chave de assinatura (que a aplicação precisa para assinar a
membership) deixa de ser feita com a conexão de dono e passa a ser feita por uma
função `SECURITY DEFINER` no banco, com `GRANT EXECUTE` ao papel de RUNTIME.

### 2.2 O que MEDIDO

Contra o Postgres real do testcontainers, como `app_runtime`:

```
SEGREDO LIDO, byteLength = 32
CORPO = 36:01a21341-…:b644b3a8-…:owner0:
ASSINATURA = 1fff410d9f8f98d0…
MEMBROS DA VITIMA = [{"role":"owner"}]
```

A escalada inteira, em SQL, como `app_runtime`:

1. `SELECT ler_chave_de_assinatura('membership')` → **devolve o segredo (32 bytes)**;
2. `corpo_de_membership(...)` (tem `EXECUTE` liberado ao runtime) → o corpo;
3. `hmac(convert_to(corpo, 'UTF8'), segredo, 'sha256')` (pgcrypto) → a assinatura;
4. `criar_membership(vitima, empresa_alheia, 'owner', NULL, <assinatura>)` → **gravado**.

O resultado: **a vítima ganhou `role: owner` numa empresa que não era dela.**

### 2.3 Por que isso é grave

O `criar_membership` é `SECURITY DEFINER` (grava com o poder do dono), e é por
isso que a **assinatura** existe: ela é o que separa "chamei" de "a aplicação me
pediu". Sem assinatura, MEDIDO na 1ª versão da migration `20261020000004`,
chamar a função com o `user_id` alheio escalava (o `SELECT name FROM users` ia de
`[alice]` para `[alice, bruno]`).

E a RLS **não** é a barreira dessa escrita: MEDIDO, a sessão `app_runtime` que
**escolhe** o GUC (`set_config('app.tenant_id', <empresa_alheia>, true)`) não
enxerga nada da empresa alheia (`SELECT name FROM users` → `[]`) — mas a escrita
pelo `criar_membership` é `SECURITY DEFINER` e passa por cima da RLS.

A assinatura é, portanto, a **única** barreira contra a escalada — e o PR
dava ao falsificador o material para produzi-la.

### 2.4 Por que o teste existente não pegava

O `prisma-rls.integration.spec.ts` tem o caso `🔴 app_runtime não lê a chave de
assinatura`. Ele mede a leitura da **TABELA** — e a função nova é **outra porta**
para o mesmo segredo. Um teste que mede só a porta que já está fechada mede a
porta, não a proteção.

### 2.5 O conserto

A migration `20261127000000_leitura_da_chave_fora_do_runtime` **revoga** o
`EXECUTE` do runtime na função de leitura, e a aplicação passa a ler pelo papel
de **SISTEMA** (`clienteDeSistema()`, que resolve a `SYSTEM_DATABASE_URL` do
ambiente) — sem construtor e sem `PrismaService`, o mesmo padrão do
`PrismaLoginLockoutRepository`.

E **por que isso não é uma escalada nova**: MEDIDO, a sessão `app_system` JÁ
insere membership direto (com o escopo de sistema, `role: owner`, sem
assinatura). O papel de sistema é a credencial ELEVADA da aplicação — a que o
bucket de sistema exige por CONCEITO (#118) — e ela já está no ambiente dela. A
escalada que a assinatura impede é a do papel de RUNTIME, que é o que serve as
requisições, e é o que uma injeção de SQL alcança.

### 2.6 A saída que NÃO resolve

"Assinar no banco" (uma função `assinar_membership(...)` que o runtime chamaria
para obter o HMAC) é a **mesma escalada com outro nome**: ela devolveria o HMAC
de QUALQUER corpo que o runtime pedisse, e o corpo é
`(user_id, tenant_id, role, profile_id)` — escolhido por quem pede. O runtime
pediria a assinatura de `(vitima, empresa_alheia, 'owner')` e chamaria o
`criar_membership` com ela.

A assinatura só tem valor como assinatura de um corpo que a **aplicação** pediu.
E o material que só a aplicação tem é a chave — que é exatamente o que o runtime
não pode ler.

## 3. Os outros achados (no #194)

### 3.1 P1 — o `P2002` do `users_history` era traduzido como "email já em uso"

MEDIDO: a linha conflitante do histórico plantada → o erro capturado é
`EmailAlreadyInUseException "Email já em uso: dani@example.com"`, tocado em
`traduzirFalhaDeUnicidade:298` → **HTTP 409 dizendo que o e-mail está ocupado
quando ele está livre**. O erro é não-acionável.

O conserto discrimina pelo **LOCAL da escrita**: a escrita do histórico tem o
`P2002` dela própria, traduzido para `AuditTrailConflictException` (409
`AUDIT_TRAIL_CONFLICT`).

⚠️ E o `meta.target` do P2002 **não** serve para discriminar: o unique do
`users_history` é um **ÍNDICE** (`CREATE UNIQUE INDEX`), não uma constraint, e o
Prisma devolve `target: null` nesse caso (MEDIDO). A discriminação é pelo local
da escrita.

### 3.2 P1 — o duplo em memória não era atômico

MEDIDO: o duplo gravava a auditoria **depois** de mutar `byId`/`emailIndex`, e a
falha da auditoria deixava o usuário gravado ("sobreviveu a falha da auditoria?
true") — enquanto o adaptador de Prisma desfaz a mutação.

O duplo mentia sobre a garantia que o PR cria: uma spec que afirmasse "a falha da
auditoria desfaz a mutação" ficaria **vermelha contra o duplo** e **verde na
produção** — o inverso do defeito.

O conserto é a ordem **VALIDAR → AUDITAR → MUTAR**, atômica nos dois sentidos
sem precisar de rollback: a auditoria falha → os índices não foram mexidos; a
mutação falha → a auditoria não foi gravada, porque TODA falha possível da
mutação (versão, e-mail em uso) é detectada na validação, antes da auditoria.

### 3.3 P2 — o spec de integração não discriminava

`rejects.toThrow()` sem argumento aceita QUALQUER erro — e o `P2002` do
histórico subia traduzido como `EmailAlreadyInUseException` antes do conserto: o
caso **passava com o defeito vivo**. Agora ele nomeia a exceção, o `findMany`
ganhou `orderBy` (sem ele o Postgres pode devolver as linhas em qualquer ordem, e
o `toEqual([1, 2])` passaria a depender do plano de execução), e há um caso novo
para a outra metade da promessa: no soft-delete, a falha da auditoria desfaz o
**apagamento** e o `users_archive` fica vazio.

### 3.4 P2 — os IRs de fluxo mentiam

`docs/flows/http-api/**` declarava o participante `audit` gravando **depois** da
escrita do repo, e o `http-api-domain-events-to-audit` nomeava o método
`emitAuditForEvents` — que este PR **remove** (o que sobrou é
`registrosDeAuditoria`, que drena os eventos e devolve os REGISTROS). Doc que
mente é defeito (§1.2).

Os 5 IRs de sequence foram reescritos e regenerados (`pnpm tsx
tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`); o `.html` ao
lado segue versionado como histórico e não é regenerável.

### 3.5 P3 — os dois `cast` da operação

O `AuditOperation` do `shared/audit` é uma **união de literais**
(`'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE'`), e o port do usuário declara o
MESMO conjunto — o `cast` afirmava o contrário ("enum de string, nominal no
TypeScript") e estreitava o tipo em silêncio: uma operação nova no
`shared/audit` passaria sem erro e sumiria do lado do usuário. MEDIDO: removendo
os dois `cast`, o `tsc --noEmit` da api sai limpo (exit 0, sem saída).

## 4. O que NÃO foi corrigido (e por quê)

| Achado | Decisão | Por quê |
|---|---|---|
| `auditoria` opcional no port do usuário (o esquecimento é um no-op silencioso) | **NÃO mexido** | Mudar o contrato do port re-quebra ~63 call sites de spec sem fechar um defeito observável — o risco real (o esquecimento) já está fechado pelo §3.2 (a auditoria é gravada dentro da escrita nos DOIS adaptadores). E o PR já foi aprovado com o parâmetro opcional. |
| O `port` do usuário aceitar `auditoria` opcional | **NÃO mexido** | Idem. |
| A exceção declarada do caminho COM destino (onboarding) | **Declarada com dono** | O risco (o usuário e a empresa ficam commitados e a trilha falha depois) é real e não tem conserto barato — a transação de tenancy tem a SUA fronteira. O que faltava era o DONO: agora há um TODO com a issue. |

## 5. Como cada PR é validado

| Camada | Comando | O que prova |
|---|---|---|
| RED proof | a mutação do conserto + o teste | o teste cai sem o conserto — **MEDIDO** nos 3 casos: o `P2002` (2 casos de integração), a atomicidade do duplo (2 casos unitários) e o `REVOKE` (2 casos de integração do RLS) |
| Suíte | `npx vitest run --project unit` + `--project integration` | a suíte inteira verde (unit 1225, integração 255 no #193; 332 e 86 no #194) |
| Typecheck | `npx tsc --noEmit -p apps/api/tsconfig.json` | exit 0 |
| Lint | `npx eslint --max-warnings=0` | exit 0 |
| Gates | `check-version-footers`, `check-doc-size`, `check-doc-claims`, `check-flow-mermaid-sync`, `check-migrations-sem-model` | `{"ok":true,"errors":[]}` |
| Revisão | comentário `<!-- pr-review -->` no PR | a convenção `pr-review.md` |

## 6. A ordem de merge

**#193 (1.37.0) → #194 (1.38.0) → #195 (1.39.0).**

⚠️ E o motivo não é só o do rodapé: os PRs #189 a #192 já consumiram o
`1.33.0` a `1.36.0`, e o `docs/MONOREPO.md` estava no **teto de 300 linhas** do
`check-doc-size` — cada PR acrescenta uma linha de histórico e o preflight
reprovava em 301. O conserto (o histórico anterior à `1.20.0` saiu para o
apêndice `docs/MONOREPO-historico.md`) já está nos 4 branches.

## 7. O que NÃO foi verificado

| Item | Por quê | Onde é medido |
|---|---|---|
| A imagem prod do #192 com a leitura da chave pelo papel de SISTEMA | exige o build completo da imagem e um postgres com os papéis | o CI do #193 roda a integração com o `app_system` real — o `prisma-rls.integration.spec.ts` é o guardião |
| O `prisma migrate dev` com a migration nova | exige criar e destruir banco | o `check-migrations-sem-model` cobre o graft, e a integração aplica a migration do zero a cada rodada |
| A falha do `unsin` no ENTRYPOINT da imagem (o `unset` antes do `exec`) | medido no PR #192, e o #193 não muda o ENTRYPOINT | o harness de teste faz o mesmo (`process.env.DIRECT_DATABASE_URL = ''`) |
