---
name: plano-termos-de-dominio
version: 1.0
updated: 2026-10-22
demand_slug: termos-de-dominio
state_snapshot: .agents/runs/state-snapshot-20261022T051500Z.md
branch: feat/onboarding-empresa
base_main: f2041e2cb26b0d545c10671587a209040e19fc78
---

# Plano — um termo de domínio, um dono só

> Data: 2026-10-22 · Branch: `feat/onboarding-empresa` (base `main` @ `f2041e2`)
> Demanda: *"vi que essa alteração de nome alterou muitos arquivos, analise a aplicação e crie um plano para implementar enums em palavras que se repitam muito para evitar essa alteração em varios arquivos quando tiver que alterar algum nome, adicione a regra para evitar repetição ao maximo e faça uma revisão geral para ver se essa regra esta sendo aplicada"*
> State-snapshot: [`.agents/runs/state-snapshot-20261022T051500Z.md`](../../../.agents/runs/state-snapshot-20261022T051500Z.md)
> Regra: [`.agents/specs/conventions/dry.md`](../../../.agents/specs/conventions/dry.md)

## 0. State snapshot (camada 0 — `state-aware-planning`)

| Item | Estado medido |
|---|---|
| Branch | `feat/onboarding-empresa`, `main` @ `f2041e2` |
| Working tree | limpo no snapshot |
| Runtime | API e web no ar; `database: ok` |
| Schema | 13 migrations aplicadas; **sem drift** |
| Cobertura | API 87,87% · web 99,52% (linhas) — acima do piso de 80% |
| Preflight | verde |
| Gates que importam | `check-runbook-drift`, `check-flow-mermaid-sync` (a lista de exceções do gate novo entra num arquivo versionado) |

## 1. Gap analysis AS-IS → TO-BE

### O que JÁ EXISTE (não reconstruir)

| Capacidade | Onde |
|---|---|
| Catálogo de permissões | `apps/api/src/shared/auth/permissions-catalog.ts` — `PERMISSIONS`, `PermissionKey`, `isPermissionKey` |
| Catálogo de feature flags | `apps/api/src/shared/auth/feature-flag-catalog.ts` — `FEATURE_FLAGS`, `FeatureFlagKey` |
| Catálogo de perfis da empresa | `apps/api/src/modules/tenancy/domain/perfis-da-empresa.ts` — `perfisDaEmpresa()` |
| Tipos do `destino` | `packages/shared-types/src/user.ts` |
| Analisador de repetição | `tooling/scripts/analisa-repeticao.ts` (criado nesta demanda) |
| Convenção da regra | `.agents/specs/conventions/dry.md` (criada nesta demanda) |

### O QUE FALTA (escopo do pedido)

MEDIDO com `npx tsx tooling/scripts/analisa-repeticao.ts --min=4` (2026-10-22):

| # | Termo | Arquivos | Ocorrências | Dono hoje | Gap |
|---|---|---|---|---|---|
| G-001 | `member` | 17 | 59 | **não existe** | o papel do convidado está hardcoded |
| G-002 | `VALIDATION_ERROR` | 19 | 47 | **não existe** | o código do problem-details está hardcoded |
| G-003 | `convite` (`destino.tipo`) | 23 | 44 | **não existe** | o discriminante está hardcoded (o TIPO existe) |
| G-004 | `users.read` e irmãs | 29 | 155 | **existe, mas exporta o array** | quem precisa de um item escreve o literal |
| G-005 | `tenancy.invites` | 15 | 79 | **existe, mas exporta o array** | idem |
| G-006 | `acme`, `João`, `joao@example.com` | 19 / 14 / 14 | 149 / 97 / 104 | **não existe** (fixture) | o mesmo fixture em N arquivos |
| G-007 | — | — | — | — | **a regra não tem gate** |

### A leitura que muda o plano

⚠️ **O problema NÃO é "faltam enums".** Três dos seis termos **já têm dono**
— e o que falta é o **import**, não o enum. O dono das permissões exporta
`PERMISSIONS` (um array), e quem precisa de `users.read` escreve o literal
porque `PERMISSIONS[3]` é um índice que muda quando o catálogo cresce.

Por isso o plano tem duas metades, e a segunda custa MENOS que a primeira:
**exportar a constante nomeada ao lado do array** e trocar o literal pelo
import.

## 2. A REGRA (já escrita nesta demanda)

[`dry.md`](../../../.agents/specs/conventions/dry.md):
um termo de domínio tem UM dono (constante exportada), quem usa importa, e o
literal repetido é o sintoma. O que **não** é termo de domínio (framework,
rota HTTP, texto de UI, mensagem de log) está na lista — e a lista é o que
impede o gate de gritar com `'vitest'`.

## 3. As fases (TDD — Red→Green→Refactor)

| # | Task | RED | GREEN |
|---|---|---|---|
| T1 | `analisa-repeticao` + a convenção | — | **FEITO** nesta demanda |
| T2 | Os donos que **não existem**: `PAPEL_GERENTE`/`PAPEL_MEMBRO` (o papel), `CODIGO_VALIDACAO` (o código do problema), `DESTINO_CONVITE`/`DESTINO_EMPRESA` (o discriminante) | spec do dono (o valor é o que o produto diz) | `packages/shared-types/src/tenant.ts` + `apps/api/src/shared/infrastructure/http/codigos-de-problema.ts` |
| T3 | Os donos que **existem** e não exportam a constante: `USERS_READ` e irmãs, `FLAG_CONVITES` e irmãs | spec que afirma que a constante exportada é o MESMO valor do array | `permissions-catalog.ts`, `feature-flag-catalog.ts` |
| T4 | Trocar os literais dos **3+ arquivos** pelos imports | spec que mede a contagem de literais crus (o próprio analisador) | a migração dos 6 termos da §1 |
| T5 | O gate `check-repeticao` | spec do gate: um literal repetido é acusado, um da lista de exceções não é | **FEITO** nesta demanda — `.tooling/scripts/ci/check-repeticao.ts` + entrada no `PREFLIGHT_GATES` + o dente no registro |
| T5b | O gate `check-bloco-duplicado` (a OUTRA metade do DRY: a lógica) | spec do gate: o mesmo bloco em 2 arquivos é erro, o declarado é ressalva | **FEITO** nesta demanda — `.tooling/scripts/ci/check-bloco-duplicado.ts` |
| T6 | Os fixtures: `acme`, `João`, `joao@example.com` → constantes em `support/` | — | `apps/web/e2e/support/` |

### Notas de implementação (medidas que valem mais que a intuição)

- ⚠️ **T3 é a fase que mais destrava.** Exportar `USERS_READ = 'users.read'`
  ao lado do `PERMISSIONS` é uma linha; trocar as 155 ocorrências em 29
  arquivos é o trabalho — e é MECÂNICO, porque o dono passa a ser a única
  fonte do valor.
- ⚠️ **O gate não pode ser o primeiro passo.** Um gate que acusa `'vitest'`
  (124 arquivos) e `'@nestjs/common'` (61) é um gate que grita e não é
  ouvido. A lista de exceções tem de vir **com** o gate, no mesmo PR.
- ⚠️ **A declaração é um artefato versionado**:
  `.tooling/scripts/ci/dry-termos.json` — o termo, o dono, a constante que
  falta e o estado (`ok` / `declarado` com o motivo). Exclusão sem motivo é o
  que a `guard-classes.md` §3 proíbe.
- ⚠️ **O gate mede os termos DECLARADOS, e não "todos os literais repetidos".**
  MEDIDO: a árvore tem 129 literais em 3+ arquivos de produção, e quase todos
  são import path, classe de CSS ou nome de framework — enumerá-los seria
  insustentível. A **revisão** produz a declaração; o **gate** cobra só o que
  foi declarado.
- ⚠️ **O limiar é por ARQUIVOS, não por ocorrências.** `'users.read'` tem 155
  ocorrências em 29 arquivos; um literal de 40 ocorrências num arquivo só é
  um arquivo só.
- ⚠️ **O `role` é TEXT no banco.** Trocar o valor do papel (`'owner'` →
  `'gerente'`) foi feito no PR #116 **sem migration**, e o único código que
  compara o valor é o `tenancy.use-cases.ts`. O mesmo vale para o
  `destino.tipo` (`'convite'`/`'empresa'`), que vive no corpo do POST.

## 4. Os gates (T5 e T5b, FEITOS nesta demanda)

| aspecto | decisão |
|---|---|
| **mede** | os termos **declarados** em `dry-termos.json` que aparecem hardcoded em arquivo de produção |
| **onde** | `.tooling/scripts/ci/check-repeticao.ts`, registrado no `PREFLIGHT_GATES` — **FEITO** |
| **dente** | MEDIDO 2026-10-22: `npx vitest run --root .tooling/scripts/ci check-repeticao` → **2 de 6** com o hardcode neutralizado. O spec planta um termo `ok` hardcoded num repo de mentira e o gate acusa |
| **anti-vacuuidade** | declaração vazia → **vermelho**; nenhum arquivo medido → **vermelho** |
| **a outra metade** | `check-bloco-duplicado` — bloco de **16+ linhas** repetido em 2+ arquivos de produção. MEDIDO: **ZERO** blocos repetidos na produção (com 12 linhas de janela há 3, e são o markup JSX do formulário) |
| **saída** | o relatório nomeia o literal, os arquivos e o **dono candidato** (`analisa-repeticao` já produz os três) |

## 5. Riscos

| Risco | Mitigação |
|---|---|
| O gate virar barulho e ninguém o ouvir | lista de exceções **no mesmo PR** do gate, com motivo por entrada; o limiar de 3 arquivos; e o primeiro relatório (T4) revisado à mão |
| A migração dos literais quebrar algo | ela é MECÂNICA e o gate verde é a prova; o `pnpm ci:local` roda antes de cada push |
| A constante virada mais um espelho do catálogo | o dono exporta a constante **e** o array, e um spec afirma que os dois são o mesmo valor — o espelho sem dono é o que a regra proíbe |
| A regra virar prosa sem efeito | é o que a fase T5 fecha; e o `check-teeth-registry` reconcilia o gate novo com o registro de dentes |

## 6. O que a revisão geral (2026-10-22) já mediu

A aplicação da regra sobre a árvore inteira está na
[convenção §5](../../../.agents/specs/conventions/dry.md):
**6 termos de domínio** repetidos em 17–29 arquivos, dos quais **3 já têm
dono** (e não o usam) e **3 não têm dono nenhum**. O resto da lista (289
literais em 4+ arquivos) é ruído de framework, rota e fixture — e é
exatamente o que a lista de exceções do gate vai declarar, com motivo.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
