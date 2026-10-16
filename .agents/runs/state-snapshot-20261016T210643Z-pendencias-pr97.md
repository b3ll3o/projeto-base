---
nome: state-snapshot-pendencias-pr97
timestamp: 20261016T210643Z
branch: feat/rbac-profile-authorization
head: 1ccb853
origem: demanda "analise esses tópicos e implemente" (4 pendências do PR #97)
---

# state-snapshot — pendências do PR #97

Camada 0 do pre-planner (`state-aware-planning`). Alimenta o
`specialist-router` (camada 1). **Todo item abaixo vem de comando executado
agora**; o que não pôde ser medido está marcado como tal, e não preenchido.

## §1 Estado medido

| Item | Comando | Valor |
|---|---|---|
| Working tree | `git status --short \| wc -l` | **0** |
| Branch | `git branch --show-current` | `feat/rbac-profile-authorization` |
| HEAD | `git rev-parse --short HEAD` | `1ccb853` |
| `origin/main` | `git rev-parse --short origin/main` | `9390307` |
| Tag do template | `git tag --list 'v*' --sort=-v:refname \| head -1` | `v1.11.0` |
| Preflight | `pnpm ci:preflight` | **0 erro(s)**, 2 checks skipped |
| Tooling | `pnpm tooling:test` | 29 arquivos / **407 testes** |
| PR #97 CI | `gh pr checks 97` | **8 checks verdes** |

⚠️ **Não medido:** `prisma migrate status` — Postgres local não está no ar
(`Please make sure your database server is running at localhost:5432`). O e2e
sobe um container efêmero, então o drift de migration não é observável fora
dele. Registrado como ausente, não como "sem drift".

## §2 Gap analysis AS-IS → TO-BE

Quatro pendências nomeadas pelo mantenedor. Cada uma foi **lida no código**,
não aceita da descrição.

### P1 — B1 sem verificação por mutação

**AS-IS:** a correção do B1 (subconjunto obrigatório para *qualquer* alvo em
`atribuirProfileAoUser`) só tem o par RECUSA+LIBERDADE como evidência. A
mutação que provaria sensibilidade — reintroduzir `&& userId === ator.userId`
— foi barrada pelo classificador de segurança.

**TO-BE:** verificar a sensibilidade **mutando o dado, não a trava**. Inverter a
fixture da spec RECUSA para um profile que *é* subconjunto: se o teste continuar
verde, a asserção é vacuosa (não está presa ao caminho de código). É a
mesma técnica de `positive-test-must-assert-the-skip-state`, e não
enfraquece nada em momento algum.

### P2 — B3: `revogar` aplica `recusaAutoConcessao` (lockout)

**AS-IS (medido, `profiles.use-cases.ts:341`):** `revogar` chama
`recusaAutoConcessao`, que recusa quando `atorUser.profileId() === profileIdAlvo`
— "um ator sem isAdmin não altera as permissões do próprio profile".

O comentário da própria casa no método vizinho (`recusaConcessaoQueNaoTem`,
linha ~271) diz o oposto: *"**`revogar` não passa por aqui** — remover
privilégio nunca é escalada, e exigir posse da chave bloquearia a limpeza de uma
permissão que o ator não tinha."*

Ou seja: **o código contradiz o critério documentado ao lado dele.** O efeito é
lockout — se um admin concedeu por engano uma permissão a um não-admin, esse
usuário não consegue revogá-la do próprio profile.

**TO-BE:** `revogar` mantém o fail-closed (ator que não resolve no banco é
recusado) e **perde** a restrição de auto-alteração. Fatoração: extrair
`exigeAtorConhecido`, que `recusaAutoConcessao` também chama.

### P3 — B5: `detail` do 403 carrega a política de segurança

**AS-IS (medido, `global-exception.filter.ts`):** `mapExceptionToHttp` devolve
só `{status, code, title}` — e `title` é o campo higienizado. Mas o filter
monta `detail: exception.message`. Logo o motivo cru vaza pelo campo que
**nenhuma spec asserta**: `domain-exception-to-http.spec.ts:322` afirma sobre
`title` e sobre `not.toMatch(/isAdmin|profile|ator/i)` — ou seja, a spec é verde
exatamente porque lê o campo certo e ignora o errado.

**Precedente da casa já resolve isto** (`token.exceptions.ts`): a
`InvalidTokenException` carrega o motivo interno num campo `motivo` para o log
e chama `super()` **sem** a mensagem interna, com o comentário explícito
*"evita que stack-traces virem payload"*.

**TO-BE:** dar a `ProfilePrivilegeEscalationException` a mesma forma. Raio de
zero: o filter não muda, e nenhum outro teste é tocado.

### P4 — B6: `deletar` protege `isSystem` mas não `isAdmin`

**AS-IS (medido, `profiles.use-cases.ts:168`):** `deletar` verifica `isSystem()`
e `countByProfile() > 0`. Não verifica `isAdmin()`. A
`ProfileAdminProtectedException` existe e é usada só no `atualizar` (linha 153),
para remover a *flag*.

**Exploitabilidade:** hoje um profile admin **com** usuários já é barrado pelo
contador (409 `PROFILE_HAS_USERS`), e um profile admin **sem** usuários não tem
quem referenciar (a FK `User.profileId` é `onDelete: Restrict`). Então não há
caminho de escalada — é lacuna de *defesa em profundidade*, não vulnerabilidade.
Dito isso, a invariável depende hoje de raciocínio sobre FK que está a dois
arquivos dali.

**TO-BE:** tornar a invariável explícita e local, sem depender da FK.

### P5 — 5 telas admin sem spec Playwright

**AS-IS (medido):** o inventário de `.agents/specs/conventions/e2e-playwright.md`
declara F1–F8 e `apps/web/e2e/` tem 8 specs — paridade verde. As rotas
`/me/profile`, `/admin/profiles`, `/admin/profiles/new`, `/admin/profiles/[slug]`
e `/admin/users` **não existem no inventário**, logo o gate não tem o que
cobrir. A forma quebrada está ausente do dado, não ausente do código.

**TO-BE:** linha no inventário + spec por fluxo, atravessando browser → Next →
API → Postgres, com sessão **autenticada** (o `/admin/*` não existe para anônimo).

## §3 Roteamento (camada 1)

| Pendência | Especialidade | Risco |
|---|---|---|
| P1 | `test-writer` (verificação) | nenhum (só reverte) |
| P2 | `nestjs-specialist` (application layer) | médio — altera regra de autorização |
| P3 | `security-auditor` (fronteira HTTP) | baixo — forma da exceção |
| P4 | `nestjs-specialist` | baixo |
| P5 | `test-writer` + `ux-design-specialist` (a11y dos seletores) | alto — 5 fluxos, ~1 build de Next |

## §4 Sequência

P2 → P3 → P4 (mesmo arquivo, uma unidade lógica de correção) → P1 (verificação,
independe das anteriores porque mede a spec e reverte) → P5 (independente,
sobra o maior custo).

Review independente ao fim de cada bloco, conforme `review-and-fix-after-each-task`;
reviewer ≠ implementer.
