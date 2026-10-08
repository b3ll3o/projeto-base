---
name: release-versioning-audit
version: 1.0
updated: 2026-10-08
description: "Processo determinístico de auditoria de versionamento semântico — extrai versões dos 3 docs canônicos, detecta drift, classifica commits (Conventional Commits), valida workflow release-template, verifica CHANGELOG. Carregado por `release-versioning-specialist` quando a task é de auditoria (não bump)."
---

# Skill: release-versioning-audit

> **Quem invoca:** `release-versioning-specialist` (papel, princípios, anti-padrões ficam no agent; este arquivo é só o **processo**).
>
> **Quando invocar:** pré-tag, PR que edita footer de versão, validação retroativa de consistência, drift entre tag git e docs.

## Inputs (do controller)

```yaml
task:
  description: "<auditoria drift | validação pré-tag | classificação commits>"

context:
  canonical_docs:
    - "docs/MONOREPO.md"
    - "docs/STACK.md"
    - ".agents/specs/conventions/estrutura-e-versionamento.md"
  workflow: ".github/workflows/release-template.yml"
  since: "<prev-tag-or-sha>"  # opcional; sem = últimos 30 commits
  bump_target: "patch|minor|major|none"  # opcional; classifica automático
```

## Passo 1 — Extrair versão declarada em cada doc canônico

```bash
for f in docs/MONOREPO.md docs/STACK.md .agents/specs/conventions/estrutura-e-versionamento.md; do
  echo "=== $f ==="
  # Regex aceita "Versão do documento:", "Versão da stack:", "Versão do template:"
  grep -oE "\*\*Vers[aã]o[^:]*:\*\*\s+v?[0-9]+\.[0-9]+\.[0-9]+" "$f" | tail -3
done
```

## Passo 2 — Listar tags e diff vs última tag

```bash
git fetch --tags
git tag --sort=-v:refname | head -10

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
echo "Última tag: $LAST_TAG"

# Commits desde a última tag
git log "${LAST_TAG}..HEAD" --oneline | head -30
```

## Passo 3 — Classificar commits (Conventional Commits)

```bash
# 3.1 BREAKING CHANGEs (vai para major)
git log "${LAST_TAG}..HEAD" --pretty=format:"%s" \
  | grep -E "^BREAKING|!: " | head -10

# 3.2 Feats (vai para minor)
git log "${LAST_TAG}..HEAD" --pretty=format:"%s" \
  | grep -E "^feat" | wc -l

# 3.3 Fixes (vai para patch)
git log "${LAST_TAG}..HEAD" --pretty=format:"%s" \
  | grep -E "^fix" | wc -l

# 3.4 Chore/docs/refactor/test/perf/ci/build (não muda versão)
git log "${LAST_TAG}..HEAD" --pretty=format:"%s" \
  | grep -E "^(chore|docs|refactor|test|perf|ci|build)" | wc -l
```

## Passo 4 — Validar workflow release-template

```bash
# 4.1 O workflow lê regex específico do MONOREPO.md
grep -oE "Vers..o do documento.*[0-9]+\.[0-9]+\\.[0-9]+" docs/MONOREPO.md | head -3

# 4.2 Workflow usa tail -1 (último match) — então múltiplas menções em MONOREPO podem dar match errado
grep -cE "\*\*Vers[aã]o" docs/MONOREPO.md
# Esperado: 1 (footer único). Se >1, finding DRIFT.

# 4.3 Workflow tem concurrency? (evita race em pushes)
grep -E "concurrency:" .github/workflows/release-template.yml
# Esperado: concurrency: group: release-template, cancel-in-progress: false
```

## Passo 5 — Verificar CHANGELOG

```bash
# 5.1 Existe?
ls CHANGELOG.md 2>/dev/null || echo "(sem CHANGELOG.md)"

# 5.2 Se Changesets:
ls .changeset/ 2>/dev/null

# 5.3 Consistência: última entry do CHANGELOG == última tag?
if [ -f CHANGELOG.md ]; then
  CHANGELOG_LAST=$(grep -oE "##\s+v?[0-9]+\.[0-9]+\.[0-9]+" CHANGELOG.md | head -1)
  echo "CHANGELOG last: $CHANGELOG_LAST"
  echo "Tag last:       $LAST_TAG"
fi
```

## Passo 6 — Validar pre-release constraint

```bash
# Antes de tag, docs devem estar consistentes:
# - Footer de versão único (não duplicado)
# - Versão em MONOREPO == STACK == estrutura-e-versionamento
# - Última tag corresponde à versão declarada
LAST_DOC_VERSION=$(grep -oE "[0-9]+\.[0-9]+\.[0-9]+" docs/MONOREPO.md | tail -1)
LAST_TAG_VERSION=$(echo "$LAST_TAG" | sed 's/^v//')
echo "docs: $LAST_DOC_VERSION  tag: $LAST_TAG_VERSION"

if [ "$LAST_DOC_VERSION" != "$LAST_TAG_VERSION" ]; then
  echo "✗ DRIFT: docs declaram $LAST_DOC_VERSION, tag é $LAST_TAG_VERSION"
fi
```

## Passo 7 — Persistir findings

```yaml
- id: relver-DRIFT-001
  title: "Versões divergentes entre docs/MONOREPO.md e docs/STACK.md"
  severity: P1
  location:
    - "docs/MONOREPO.md:linha-N"
    - "docs/STACK.md:linha-M"
  cause: |
    MONOREPO declara 1.9.0; STACK declara 1.9.1.
  impact: |
    Release workflow lê só MONOREPO — usa 1.9.0. STACK desatualizado induz
    leitor a erro. Conventional commits entre merges perdem rastreabilidade.
  evidence: |
    grep mostra:
      MONOREPO.md: **Versão do documento:** 1.9.0
      STACK.md:    **Versão da stack:** 1.9.1
  fix: |
    Bump STACK para 1.9.0 (mesma baseline); revisão retroativa de changelog
    se 1.9.1 é genuíno (então bump MONOREPO também e gerar tag nova).
  breaking_change: false
  recommended_bump: "minor"   # inferido de Conventional Commits
  commit_summary:
    breaking: 0
    feat: 3
    fix: 5
    chore: 12
```

## Passo 8 — Devolver ao `finding-orchestrator`

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| `git describe --tags --abbrev=0` retorna vazio | Repo sem tags | `git tag --list` para confirmar; reportar como estado inicial |
| `grep` retorna múltiplas versões em MONOREPO | Footer de versão duplicado no mesmo doc | Fix: manter 1 footer canônico no fim do doc |
| `LAST_TAG` aponta para commit que não está em main | Tag em branch órfã | Investigar; geralmente é erro humano. Reportar como DRIFT |
| Workflow release-template não tem `concurrency` | Race condition em pushes simultâneos | Fix: adicionar `concurrency: group: release-template, cancel-in-progress: false` |
| `pnpm changeset status` falha | Changesets não configurado | Esperado se projeto usa outro método (Conventional Releases manual, etc) |
| Bump major sem changelog detalhado | Conventional commit `feat!:` sem entry | Bloquear tag; reportar como finding P0 |

## Saída

- `findings.yaml` com `version_drift`, `tag_consistency`, `commit_classification`
- `recommended_bump` (major|minor|patch|none) — inferido de Conventional Commits
- Lista de 3 versões canônicas (MONOREPO, STACK, estrutura-e-versionamento) — devem ser iguais
- Status do workflow (concurrency, regex match, validação)

## Referências

- Agent: `.agents/agents/release-versioning-specialist.md`
- Semver: <https://semver.org/lang/pt-BR/>
- Conventional Commits: <https://www.conventionalcommits.org/pt-br/>
- Changesets: <https://github.com/changesets/changesets>
