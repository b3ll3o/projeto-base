# Archify `flow` subcommand + pre-push hook — Design spec

- **Date:** 2026-09-23
- **Status:** Proposed (not yet implemented)
- **Target repo:** [`tt-a1i/archify`](https://github.com/tt-a1i/archify) (contribution via PR)
- **Scope:** New CLI subcommand `archify flow` + companion git pre-push hook + docs + tests

## 1. Problem & motivation

Archify generates five diagram types (architecture, workflow, sequence, dataflow, lifecycle) as standalone HTML artifacts. Today it is invoked manually (`node bin/archify.mjs deliver <type> <spec> <out>`) or scripted (e.g. on repository events, PR review, refactor commitments).

There is no first-class workflow that converts **"a set of code changes happened"** into a **"workflow diagram of those changes"** automatically, versioned alongside the code. Reviewers see diff text but not a visual map of what was touched, in what order, gated by what decisions.

This spec adds a workflow-generation mode that fires whenever a developer pushes a feature branch, so each PR arrives on GitHub already carrying a `docs/flows/workflow.html` artifact committed to the same branch.

## 2. Decisions (consolidated)

| Question | Decision |
|---|---|
| What kind of diagram? | `workflow` (process / runbook) |
| What triggers generation? | **Local** git pre-push hook on feature branches |
| What is the boundary condition? | Hook fires on every push except pushes to `main` / `master` |
| Where does the artifact live? | Versioned in `docs/flows/` of the same repo |
| Granularity? | Full-regen on each run (overwrites previous) |
| What does the workflow capture? | Modified files (path + line ranges), commit subjects as decision nodes, optionally explicit decisions + validation reports as extra nodes |
| Does the LLM agent matter? | **No.** No agent skill, no magic phrase. Pure CLI + git hook. |
| Auto-trigger loop risk? | Eliminated by construction (hook skips on push to main). `[skip ci]` is defense in depth. |

## 3. Architecture overview

```text
Developer (local)                Repo (local)                    Remote
─────────────                    ────────────                    ──────
   $ git add . && git commit
   $ git push
        │
        │  triggers
        ▼
   .husky/pre-push ──► archify flow
        │                --git-range=origin/main...HEAD
        │                --out docs/flows/
        │                   │
        │                   ▼
        │              build-spec (parse diff + log + optional inputs)
        │                   │
        │                   ▼
        │              archify validate workflow spec.json
        │                   │
        │                   ▼
        │              archify deliver  workflow spec.json workflow.html
        │                   │
        │              docs/flows/workflow.json  ◄────────────┐
        │              docs/flows/workflow.html  ◄────────────┤ both versioned
        ▼                                                 │
   git commit -m "chore(flow): regenera [skip ci]"          │
   git push  ──►  branch on remote has workflow artifacts ─┘
                                                  ▼
                                            PR on GitHub carries
                                            both commits (feat + flow)
```

## 4. CLI subcommand: `archify flow`

### 4.1 Invocation

```bash
node archify/bin/archify.mjs flow \
  --git-range <range>                # required. e.g. origin/main...HEAD
  [--out <dir>]                      # default: docs/flows/
  [--since-message <glob>]           # filter commits by subject glob
  [--decisions <md-file>]            # explicit decision narrative
  [--validations <json-file>]        # extra nodes for lint/test/build
  [--quality standard|showcase]      # default: standard
  [--json]                           # emit machine-readable receipt
  [--strict]                         # exit non-zero on any warning
```

### 4.2 Internal pipeline (reuses existing subcommands)

```text
git diff --unified=0 --no-color <range>
git log  <range> --pretty="%h %s%n%b"
[--decisions <md>]          → parsed decision items
[--validations <json>]      → validation nodes
        │
        ▼
build-spec.mjs     ──►   spec.json   (Workflow schema v1, conforms to schemas/workflow.schema.json)
        │
        ▼
archify validate workflow spec.json --quality standard --json
        │
        ▼
archify deliver  workflow spec.json <out>/workflow.html --quality standard --json
        │
        ▼
<out>/workflow.json
<out>/workflow.html
```

No new code path duplicates the existing `validate` / `deliver` semantics; the flow subcommand is a thin orchestrator that reuses the same renderer, validator, and schema machinery.

### 4.3 Workflow JSON shape (conforms to `schemas/workflow.schema.json`)

> **Note (corrected from earlier draft):** the schema has `additionalProperties: false` at every level. There is no `description` field on nodes, no `type: "default"|"start"|"terminal"`, no `semanticChecks.allowedRoots/allowedTerminals`, and no top-level `_flow_source`. This shape was validated against `examples/release-delivery.workflow.json`.

```jsonc
{
  "schema_version": 1,
  "diagram_type": "workflow",
  "meta": {
    "title": "Flow for feat/users-api",
    "animation": "trace"
    // additionalProperties: false — only title/subtitle/locale/output/animation/
    // visual_preset/quality_profile/views/legend/viewBox are allowed
  },
  "lanes": [
    { "id": "modify",   "label": "Modify"   },
    { "id": "decide",   "label": "Decide"   },
    { "id": "validate", "label": "Validate" }
  ],
  "nodes": [
    {
      "id": "m_abc123",
      "lane": "modify",
      "col": 0,
      "type": "frontend",
      "label": "src/users/create.ts (+12 -3)",
      "sublabel": "hunks at lines 10-22, 44-58"
    },
    {
      "id": "d_def456",
      "lane": "decide",
      "col": 1,
      "type": "security",
      "label": "a1b2c3d feat(api): add users endpoint",
      "sublabel": "commit message body"
    },
    {
      "id": "v_ghi789",
      "lane": "validate",
      "col": 2,
      "type": "backend",
      "label": "archify validate passed",
      "sublabel": "exit 0, 12 checks"
    }
  ],
  "edges": [
    { "from": "m_abc123", "to": "d_def456" },
    { "from": "d_def456", "to": "v_ghi789" }
  ],
  "mainPath": ["m_abc123", "d_def456", "v_ghi789"]
}
```

**Schema constraints the builder MUST respect:**

| Field | Constraint | Source |
|---|---|---|
| `lanes[*].id` | unique, non-empty id | `additionalProperties: false` |
| `nodes[*].lane` | MUST equal one of `lanes[*].id` | required `lane` |
| `nodes[*].col` | integer in `[0, 5]` (max 6 columns) | `maximum: 5` |
| `nodes[*].type` | enum: `frontend` \| `backend` \| `database` \| `cloud` \| `security` \| `messagebus` \| `external` | `$ref: componentType` |
| `nodes[*].label` | non-empty string | `minLength: 1` |
| `meta` | `additionalProperties: false` — no extra keys | strict |
| root | `additionalProperties: false` — no `_flow_source`, no `semanticChecks` | strict |

**Type-by-lane visual map (decision, locked here):**

| Lane | `type` value | Rationale |
|---|---|---|
| `modify` | `frontend` | developer source changes |
| `decide` | `security` | commit = gated decision |
| `validate` | `backend` | automated quality checks |

**Column strategy:** `col` is integer `[0, 5]`. The builder assigns `col = Math.min(position_in_lane, 5)` so multiple nodes can share a column when a lane has more than 6 items (overflow is visually stacked, not cropped). The first node of each non-empty lane goes to `col = 0`.

**Provenance sidecar (replaces the old `_flow_source`):** because the schema is strict, builder provenance (`range`, `baseSha`, `generated_at`) is written to a separate file `<out>/_flow_source.json` next to `workflow.json`. This file is never validated by `archify validate` and exists purely for traceability. It is regenerated on every flow run (full-regen contract).

**Legacy `--schema=1` / `--schema=2` flag:** REMOVED. The schema enum already accepts both 1 and 2; we always emit `schema_version: 1` matching the existing examples. No dual-mode logic in the builder.

**Node-id collisions** are prevented by hashing `path:lineRange` (Modify) and `commit-sha` (Decide) — deterministic, idempotent, no merge math.

## 5. Pre-push hook

### 5.1 Files committed to archify

| File | Purpose |
|---|---|
| `archify/hooks/pre-push.flow.mjs` | The actual hook logic. Pure Node, no third-party deps. |
| `archify/bin/install-flow-hook.mjs` | Detects Husky / plain `.git/hooks` / fork-PR setups, installs the hook, prints what it did. |

### 5.2 Hook behavior (algorithm)

```js
// pseudocode
const raw = await readStdin();   // "origin refs/heads/feat-x <localSha> <remoteSha>"
const [, , remoteRef] = raw.split(' ');

if (remoteRef === 'refs/heads/main'  || remoteRef === 'refs/heads/master') {
  exit(0);                        // release merges: do nothing
}

const remote = process.env.HUSKY_GIT_PARAMS || 'origin';
const range  = `${remote}/main...HEAD`;
const out    = path.join(repoRoot, 'docs/flows');

try {
  execSync(
    `node ${repoRoot}/archify/bin/archify.mjs flow ` +
    `--git-range=${shellEscape(range)} --out ${shellEscape(out)} ` +
    `--quality standard`, { stdio: 'inherit' }
  );
  execSync('git add docs/flows/',           { cwd: repoRoot });
  execSync(
    'git commit -m "chore(flow): regenera workflow [skip ci]"',
    { cwd: repoRoot }
  );
} catch (e) {
  console.error('[archify-flow] hook failed:', e.message);
  writeLog(`${repoRoot}/.archify/flow.log`, e);
  exit(0);     // never block a push
}
exit(0);
```

### 5.3 Guarantees

- **Idempotent on retries.** Same range → identical JSON output → no spurious new commits.
- **No-op on push to main.** The release merge never regenerates because the work was already done on the feature push.
- **Never blocks.** Any unhandled error from the CLI bubbles to stderr + `.archify/flow.log` but the hook exits 0.
- **`[skip ci]` defense in depth.** Even if a future CI workflow is added, the auto-generated commit message keeps it from re-firing.

### 5.4 Installation

```bash
# autodetect
npx archify init-flow-hook
# equivalent to:
node archify/bin/install-flow-hook.mjs --detect
```

**`install-flow-hook.mjs` flags:**

- `--detect` (default): autodetects the local git setup — Husky (`package.json` has `"husky"` field + `node_modules/husky`), plain `.git/hooks/pre-push`, or no git root (bails with a clear error). Picks the right install target.
- `--force`: overwrite an existing `pre-push` hook (without this, the installer exits 1 if a hook already exists, asking the user to confirm).
- `--target <path>`: override the autodetected target path (escape hatch for monorepos with custom git layouts).

The installer writes a thin shim (Husky or `.git/hooks/pre-push`) that `require`s `archify/hooks/pre-push.flow.mjs`. It is opt-in: nothing is installed by default and uninstallation is `rm` of the hook file.

## 6. Diff → node mapping

| Source | Lane id | `type` | Field source |
|---|---|---|---|
| `git diff --unified=0 <range>` | `modify` | `frontend` | One node per file. `label = "<path> (+a -b)"`. `sublabel` enumerates hunk line ranges. Binary files → single node `Binary changes: <path>`. |
| `git log <range> --pretty=%h %s%n%b` | `decide` | `security` | One node per commit (subject as label). When more than 10 commits are in the range, they collapse to a single summary node: `label = "<N> commits"`, `sublabel = "<first subject> … <last subject> (<list of shas>)"`. `--since-message <glob>` (if passed) **includes only** commits whose subject matches the glob (positive filter, applied during parse). |
| `--decisions <md>` (optional) | `decide` | `security` | Each `## Heading` becomes a node; body becomes `sublabel`. Appends after commit nodes (so commit-derived decisions appear first). |
| `archify validate workflow <spec>` result | `validate` | `backend` | Single node `passed` / `failed: <reason>`. |
| `--validations <json>` (optional) | `validate` | `backend` | Each entry (lint / test / build) becomes a separate node. Format: `{name, status, summary, exitCode?}`. |

**Column assignment:** within each lane, nodes get `col = Math.min(position_in_lane, 5)` so a lane with N>6 nodes still fits (overflow stacked). The first node of each non-empty lane starts at `col = 0`.

**Edge wiring:** the builder emits nodes in lane order: `modify` → `decide` → `validate`. Within a lane, nodes are sequenced by their parse order. **Empty lanes are skipped** — when a lane has zero nodes, the chain jumps to the next non-empty lane (so a feature with no explicit decisions still produces `Modify[…] → Validate[…] →` directly). `mainPath` is the linear sequence of all node ids in that order; `edges` connect consecutive ids. `mainPath` length MUST be `≥ 2` per schema. If only one node exists across all lanes (degenerate), the builder emits a self-loop edge `{from, to}` pointing to the same node so `mainPath` still has 2 entries (`[node, node]`).

**`start`/`end` anchors are NOT nodes** — the previous draft added synthetic `start`/`end` nodes with non-conformant `type` values. Removed. The semantic entry/exit is implied by `mainPath` order.

## 7. Error handling

| Failure | Exit code | Hook behavior | User-facing message |
|---|---|---|---|
| Empty diff (range already merged) | 2 | push proceeds, log entry | `archify flow: no changes detected in <range>` |
| Build spec → schema violation | 3 | push proceeds | `workflow schema validation failed: <path>:<reason>` |
| `archify validate workflow` fails on generated spec | 4 | push proceeds, HTML still delivered with warning badge | `validation failed: <failed checks>; HTML written anyway` |
| `--strict` + any warning | 5 | push proceeds, but CLI exits non-zero for downstream CI | list of warnings |
| Node / git / archify binary missing | 1 | push proceeds | `[archify-flow] hook failed: <error>; see .archify/flow.log` |
| Push to `refs/heads/main` / `refs/heads/master` | 0 | no-op | (silent) |
| `--out` resolves outside repo | 6 | push proceeds | `--out must be inside the repository: <path>` |

**Principle:** the hook is **advisory, not enforcing**. It regenerates an artifact; the developer decides whether to keep it. CI integration (future) opts into `--strict`.

## 8. Testing strategy

New test directory: `archify/test/flow/`.

| Type | File | Covers |
|---|---|---|
| Unit | `parser-diff.test.mjs` | `git diff --unified=0` → typed array: binário, rename, multi-hunk, delete-only, add-only, submodules. Target 100% branch coverage. |
| Unit | `builder-spec.test.mjs` | diff + log + validations → spec JSON conforms to `workflow.schema.json` v1. Cases: empty range (1 self-loop), > 10 commits (collapse), with/without extra inputs, lane-id validation, col bound `[0,5]`, type enum. **Asserts against real schema via AJV (not hand-written shape check).** |
| Unit | `id-collision.test.mjs` | Dois commits com mesmo subject → ids diferentes; dois arquivos com mesmo path após rename → ids diferentes. |
| Integration | `validate-deliver.test.mjs` | Roda `archify validate workflow` e `archify deliver` reais no spec gerado; asserta `checks` esperados. |
| E2E | `flow-cli.test.mjs` | Mini fixture repo (mini `.git` criado no boot do teste); roda `archify flow --git-range=base...feat`; asserta `workflow.json` + `workflow.html` existem, validação passa, HTML renderiza. |
| E2E | `hook-pre-push.test.mjs` | Simula stdin Husky (`refs/heads/feat-x`), executa hook, asserta: invoca CLI corretamente, cria commit `[skip ci]`, push `refs/heads/main` é no-op. |
| Snapshot | `__snapshots__/flow-cli-receipt.json` | Freeze do receipt (checks + paths); regressões viram diff de PR review. |
| Cross-version | `flow-v1.test.mjs`, `flow-v2.test.mjs` | Schema 1 e 2 ambos validados e entregues; cobertura de compatibilidade. |

**Fixture management:** `archify/test/fixtures/flow-fixture/` é um mini repo versionado. Script `bin/test-bootstrap.mjs` (já existe) cria o `.git` se ausente.

**Coverage targets:**

- `parser-diff.mjs`: 100% (boundary crítico, parsing de git diff não pode retornar lixo)
- `builder-spec.mjs`: ≥ 90% lines / ≥ 85% branches
- Demais: ≥ 80% lines

**CI integration:** os testes rodam em `npm test` e no workflow atual de CI do archify (assumindo que já tem). Sem novo CI job necessário.

## 9. Documentation deliverables

| File | Change |
|---|---|
| `archify/SKILL.md` | New H2 section "Flow generation (automatic on push)" linking to the new subcommand and hook installation. Update the type-router table with a row for `flow` subcommand. |
| `archify/SKILL.flow.md` (optional sub-skill) | Standalone skill for users who want to invoke `archify flow` interactively without the hook. |
| `archify/CHANGELOG.md` | New entry under the unreleased / next-minor version. |
| `archify/ROADMAP.md` | Move the "flow on diff" item from backlog to delivered. |
| `archify/examples/feat-flow/` (new) | Sample output: a `workflow.json` + `workflow.html` pair from a known-good fixture, used in docs and as a snapshot reference. |
| `docs/superpowers/specs/2026-09-23-archify-flow-subcommand-design.md` | This document. |
| `docs/superpowers/plans/2026-09-23-archify-flow-subcommand.md` | Implementation plan (produced by writing-plans skill after this spec is approved). |

Authoring language: Portuguese (pt-BR) for prose, English for code/identifiers, matching the project convention.

## 10. Rollout phases (single PR, three atomic commits)

| Commit | Scope | Test gating |
|---|---|---|
| 1. CLI subcommand | `archify/bin/flow/*`, `archify/test/flow/parser*`, `archify/test/flow/builder*`, `archify/test/flow/validate-deliver*`, `archify/test/flow/id-collision*`, fixtures | Unit + integration tests pass locally + in CI |
| 2. Pre-push hook | `archify/hooks/pre-push.flow.mjs`, `archify/bin/install-flow-hook.mjs`, `archify/test/flow/flow-cli*`, `archify/test/flow/hook-pre-push*` | E2E + hook E2E tests pass locally + in CI |
| 3. Docs | `archify/SKILL.md`, `archify/SKILL.flow.md`, `archify/CHANGELOG.md`, `archify/ROADMAP.md`, `archify/examples/feat-flow/` | doc-sync check (if any) |

**External gate:** maintainer review on `tt-a1i/archify`. Validation before merge = run the new subcommand in a real PR to the archify repo itself.

## 11. Out of scope (YAGNI)

- GitHub Action wrapper — local hook is sufficient for the MVP.
- Incremental/diff-merge updates — full-regen is the contract; rebuilds are cheap.
- Capturing transcript / tool-call metadata from an LLM agent — no agent in this design.
- Per-PR file naming (`docs/flows/<branch>.html`) — single `workflow.html` suffices for MVP.
- Auto-rendering on existing PRs without a local push — covered in a potential future phase.
- Capturing `meta.repository` evidence like Architecture does — Workflow schema does not support it; revisit if archify makes it additive.
- Cross-agent skill for triggering — explicitly deferred; LLM is not in the loop.

## 12. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Maintainer rejects contribution | medium | PR never merges | Engagement in Discussions before PR; offer as opt-in subcommand |
| `workflow.schema.json v2` tightens in future archify release | low | spec emission breaks | Pin `archify-cli` version in hook template; pin spec to v2; cross-version test |
| Hook runs in dirs without Husky | high (plain `.git/hooks`) | None | `install-flow-hook.mjs` covers three install paths explicitly |
| Developer pushes binary changes not parsed by `git diff --unified=0` | medium | one node says `Binary changes` (still informative) | Documented behavior |
| Hook commits after the dev's push is staged → hook conflicts with push workflow | low | hook exits 0 with warning | Hook writes to log, doesn't block; developer resolves manually |
| `--out docs/flows/` becomes stale as schema evolves | low | old `workflow.html` still valid (HTML is self-contained) | full-regen on next push handles |
| `[skip ci]` recognized differently by other CI providers | low | other CI still re-runs unnecessarily | `[skip ci]` is GitHub-style; document expected behavior per provider |

## 13. Acceptance criteria

The feature is accepted when, after merging into `tt-a1i/archify`:

1. `node archify/bin/archify.mjs flow --help` is present and describes the flags in §4.1.
2. Running `archify flow --git-range=<range> --out docs/flows/` on any repo with diffs produces a valid `<out>/workflow.json` and `<out>/workflow.html` that passes `archify validate workflow` with `--quality showcase`.
3. Hook installed via `npx archify init-flow-hook` fires on feature-branch pushes and no-ops on main pushes.
4. All new tests pass locally (`npm test`) and in CI.
5. `archify/SKILL.md` documents the new subcommand + hook.
6. `archify/examples/feat-flow/` is browsable as the canonical example.

---

Once this spec is approved, the writing-plans skill will produce the implementation plan (`docs/superpowers/plans/2026-09-23-archify-flow-subcommand.md`).
