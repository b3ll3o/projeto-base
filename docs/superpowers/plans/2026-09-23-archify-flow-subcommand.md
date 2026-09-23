# Archify `flow` subcommand + pre-push hook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `archify flow` CLI subcommand + git `pre-push` hook that auto-generates a Workflow diagram artifact (HTML + JSON) from a git range and version it in `docs/flows/` of the feature branch.

**Architecture:** Thin orchestrator CLI delegates to existing `validate` and `deliver` subcommands. Hook is plain Node, no deps. Schema emitted at v2 by default, v1 via `--schema=1`. Idempotent, full-regen, never blocks push.

**Tech Stack:** Node.js `^22.19.0 || >=24.0.0`, vanilla JavaScript (ESM), AJV for schema validation (already in archify), `node:child_process` for git invocation, `node:fs/promises` for I/O. No new runtime dependencies.

**Target repo:** [tt-a1i/archify](https://github.com/tt-a1i/archify) — execute this plan after forking the repo into the implementer's GitHub account.

**Spec:** `docs/superpowers/specs/2026-09-23-archify-flow-subcommand-design.md`

---

## File map

| Path (in archify repo) | Action | Responsibility |
|---|---|---|
| `bin/archify.mjs` | Modify | Add `flow` case to dispatcher (≤ 30 lines added). |
| `bin/flow.mjs` | Create | Subcommand entry — arg parsing, run mode, write receipts. |
| `bin/flow/parser-diff.mjs` | Create | `parseDiffRange(range)` + `parseDiffText(text)` — git diff text → typed array of file/hunk objects. Pure function. |
| `bin/flow/builder-spec.mjs` | Create | `buildSpec({files, commits, decisions, validations, range})` → workflow JSON v2. Pure function. |
| `bin/flow/runner.mjs` | Create | `runFlow(opts)` — orchestrates: parse → build → write spec → exec validate → exec deliver. Returns receipt. |
| `bin/flow/ids.mjs` | Create | `idFor({kind, key})` — deterministic, collision-free node IDs. |
| `bin/install-flow-hook.mjs` | Create | Installer: detects Husky / `.git/hooks` / no-git, writes shim. |
| `hooks/pre-push.flow.mjs` | Create | Pre-push hook logic — pure Node, no deps. |
| `test/flow/parser-diff.test.mjs` | Create | Unit: diff parser edge cases. |
| `test/flow/builder-spec.test.mjs` | Create | Unit: spec builder scenarios. |
| `test/flow/ids.test.mjs` | Create | Unit: ID generation determinism + collision. |
| `test/flow/runner.test.mjs` | Create | Unit (with mocked subprocess): orchestration correctness. |
| `test/flow/flow-cli.test.mjs` | Create | E2E: `archify flow` on mini fixture. |
| `test/flow/flow-snapshot.test.mjs` | Create | Snapshot: receipt freeze. |
| `test/flow/hook-pre-push.test.mjs` | Create | E2E: pre-push hook with simulated stdin. |
| `test/flow/install-flow-hook.test.mjs` | Create | E2E: installer on Husky / plain / no-git. |
| `test/flow/snapshots/flow-cli-receipt.json` | Create | Snapshot baseline. |
| `test/flow/fixtures/mini-repo/` | Create | Mini-git fixture (.git created by bootstrap). |
| `test/flow/fixtures/mini-repo/bootstrap.mjs` | Create | Creates a deterministic .git history. |
| `examples/feat-flow/workflow.json` | Create | Canonical example output. |
| `examples/feat-flow/workflow.html` | Create | Canonical example output. |
| `SKILL.md` | Modify | Add `flow` section + type-router row. |
| `CHANGELOG.md` | Modify | Unreleased entry. |
| `ROADMAP.md` | Modify | Move item to delivered. |
| `package.json` | Modify | Add `test:flow` script (optional). |

**Total:** 21 new files + 4 modifications. Final PR = 3 atomic commits per §10 of the spec.

---

## Task 1: Fork + clone + branch setup

**Files:** none (operational only)

- [ ] **Step 1: Fork archify**

Run on GitHub UI or with `gh`:

```bash
gh repo fork tt-a1i/archify --clone=false --remote=true
```

Expected: a fork at `<your-username>/archify`.

- [ ] **Step 2: Clone the fork**

```bash
cd ~/work
git clone git@github.com:<your-username>/archify.git
cd archify
```

Expected: working tree at `archify/` with `bin/`, `schemas/`, `examples/`, `SKILL.md` present.

- [ ] **Step 3: Add upstream remote**

```bash
git remote add upstream git@github.com:tt-a1i/archify.git
git remote -v
```

Expected output:

```
origin    git@github.com:<your-username>/archify.git (fetch)
origin    git@github.com:<your-username>/archify.git (push)
upstream  git@github.com:tt-a1i/archify.git (fetch)
upstream  git@github.com:tt-a1i/archify.git (push)
```

- [ ] **Step 4: Sync with upstream main**

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

Expected: clean working tree on `main` matching upstream.

- [ ] **Step 5: Create working branch**

```bash
git checkout -b feat/flow-subcommand
```

- [ ] **Step 6: Install dependencies and run baseline tests**

```bash
npm install
npm test
```

Expected: all existing tests pass; this is our green baseline.

- [ ] **Step 7: Commit branch setup (no code yet, but anchor)**

```bash
git commit --allow-empty -m "chore(flow): branch tracking for flow subcommand"
```

---

## Task 2: parser-diff.mjs — TDD RED (write failing tests)

**Files:**
- Create: `bin/flow/parser-diff.mjs`
- Create: `test/flow/parser-diff.test.mjs`

- [ ] **Step 1: Create the empty module file**

`bin/flow/parser-diff.mjs`:

```js
export function parseDiffText(text) {
  throw new Error('not implemented');
}

export function parseDiffRange(range) {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Create the test file with failing tests**

`test/flow/parser-diff.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDiffText} from '../../bin/flow/parser-diff.mjs';

test('parses a single file with one hunk (additions and deletions)', () => {
  const text = [
    'diff --git a/src/x.ts b/src/x.ts',
    'index 0000000..1111111 100644',
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -10,3 +12,5 @@',
    ' context line',
  ].join('\n');
  const result = parseDiffText(text);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'src/x.ts');
  assert.equal(result[0].hunks.length, 1);
  assert.equal(result[0].hunks[0].add, 5);
  assert.equal(result[0].hunks[0].del, 3);
  assert.deepEqual(result[0].hunks[0].lines, [12, 16]);
});

test('parses a binary file', () => {
  const text = [
    'diff --git a/img.png b/img.png',
    'index 0000000..1111111',
    'Binary files /dev/null and b/img.png differ',
  ].join('\n');
  const result = parseDiffText(text);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'img.png');
  assert.equal(result[0].binary, true);
});

test('parses a rename', () => {
  const text = [
    'diff --git a/old.ts b/new.ts',
    'similarity index 100%',
    'rename from old.ts',
    'rename to new.ts',
  ].join('\n');
  const result = parseDiffText(text);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'new.ts');
  assert.equal(result[0].renameFrom, 'old.ts');
});

test('parses multiple files in order', () => {
  const text = [
    'diff --git a/a.ts b/a.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    'diff --git a/b.ts b/b.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new',
  ].join('\n');
  const result = parseDiffText(text);
  assert.equal(result.length, 2);
  assert.equal(result[0].path, 'a.ts');
  assert.equal(result[1].path, 'b.ts');
});

test('handles add-only file', () => {
  const text = [
    'diff --git a/new.ts b/new.ts',
    'new file mode 100644',
    'index 0000000..1111111',
    '--- /dev/null',
    '+++ b/new.ts',
    '@@ -0,0 +1,3 @@',
    '+line one',
  ].join('\n');
  const result = parseDiffText(text);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'new.ts');
  assert.equal(result[0].hunks[0].add, 3);
  assert.equal(result[0].hunks[0].del, 0);
});

test('handles delete-only file', () => {
  const text = [
    'diff --git a/old.ts b/old.ts',
    'deleted file mode 100644',
    'index 1111111..0000000',
    '--- a/old.ts',
    '+++ /dev/null',
    '@@ -1,3 +0,0 @@',
    '-gone',
  ].join('\n');
  const result = parseDiffText(text);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'old.ts');
  assert.equal(result[0].hunks[0].add, 0);
  assert.equal(result[0].hunks[0].del, 3);
});

test('returns empty array for empty input', () => {
  assert.deepEqual(parseDiffText(''), []);
});
```

- [ ] **Step 3: Run tests, confirm RED**

Run: `node --test test/flow/parser-diff.test.mjs`
Expected: 7 tests, all FAIL with "not implemented".

- [ ] **Step 4: Commit RED**

```bash
git add bin/flow/parser-diff.mjs test/flow/parser-diff.test.mjs
git commit -m "test(flow): failing specs for diff parser"
```

---

## Task 3: parser-diff.mjs — TDD GREEN (implement)

**Files:**
- Modify: `bin/flow/parser-diff.mjs`

- [ ] **Step 1: Implement the parser**

Replace `bin/flow/parser-diff.mjs` with:

```js
import {execFileSync} from 'node:child_process';

const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+?)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const BINARY_MARK = /^Binary files/;
const RENAME_FROM = /^rename from (.+)$/;
const RENAME_TO = /^rename to (.+)$/;

function classifyLineKind(line, inBinary) {
  if (inBinary) return null;
  if (line.startsWith('+') && !line.startsWith('+++')) return 'add';
  if (line.startsWith('-') && !line.startsWith('---')) return 'del';
  return null;
}

export function parseDiffText(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n');
  const files = [];
  let current = null;
  let inBinary = false;
  let hunkActive = false;

  for (const line of lines) {
    const headerMatch = FILE_HEADER.exec(line);
    if (headerMatch) {
      if (current) files.push(current);
      current = {
        path: headerMatch[2],
        fromPath: headerMatch[1],
        binary: false,
        renameFrom: null,
        hunks: [],
      };
      inBinary = false;
      hunkActive = false;
      continue;
    }
    if (current && line === RENAME_FROM.exec('')[0]) continue; // unreachable, but TS-friendly
    const renameFrom = RENAME_FROM.exec(line);
    if (current && renameFrom) { current.renameFrom = renameFrom[1]; continue; }
    const renameTo = RENAME_TO.exec(line);
    if (current && renameTo) { current.path = renameTo[1]; continue; }
    if (current && BINARY_MARK.test(line)) {
      current.binary = true;
      inBinary = true;
      continue;
    }
    const hunkMatch = HUNK_HEADER.exec(line);
    if (current && hunkMatch) {
      const startNew = parseInt(hunkMatch[3], 10);
      const lenNew = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;
      current.hunks.push({
        start: startNew,
        add: lenNew,
        del: parseInt(hunkMatch[2] || '1', 10),
        lines: [startNew, startNew + lenNew - 1],
      });
      hunkActive = true;
      continue;
    }
    if (hunkActive && !inBinary) {
      const kind = classifyLineKind(line, false);
      if (kind === 'add') {
        // already counted in lenNew
      } else if (kind === 'del') {
        // counted in lenOld
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" - ignore
      } else if (line === '') {
        hunkActive = false; // blank line ends hunk in compact mode
      }
    }
  }
  if (current) files.push(current);
  return files;
}

export function parseDiffRange(range) {
  const text = execFileSync('git', [
    'diff', '--unified=0', '--no-color', '--no-ext-diff', range,
  ], {encoding: 'utf8', maxBuffer: 50 * 1024 * 1024});
  return parseDiffText(text);
}
```

Note: the `parseDiffText` is intentionally simple — uses the unified-0 hunk header `@@ -old,lenOld +new,lenNew @@` directly to count additions and deletions without parsing each line.

- [ ] **Step 2: Run tests, confirm GREEN**

Run: `node --test test/flow/parser-diff.test.mjs`
Expected: 7 tests, all PASS.

If any test fails, adjust the parser logic (most likely causes: off-by-one in line range, miscounting `add`/`del` in the len-new/len-old fields). Do not adjust tests.

- [ ] **Step 3: Commit GREEN**

```bash
git add bin/flow/parser-diff.mjs
git commit -m "feat(flow): git diff parser"
```

---

## Task 4: ids.mjs — TDD

**Files:**
- Create: `bin/flow/ids.mjs`
- Create: `test/flow/ids.test.mjs`

- [ ] **Step 1: Write the failing tests**

`test/flow/ids.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {idFor} from '../../bin/flow/ids.mjs';

test('returns prefix + 6-char hash', () => {
  const id = idFor({kind: 'modify', key: 'src/foo.ts'});
  assert.match(id, /^m_[a-z0-9]{6}$/);
});

test('is deterministic for same input', () => {
  const a = idFor({kind: 'modify', key: 'src/foo.ts', suffix: '12-22'});
  const b = idFor({kind: 'modify', key: 'src/foo.ts', suffix: '12-22'});
  assert.equal(a, b);
});

test('different suffix yields different id', () => {
  const a = idFor({kind: 'modify', key: 'src/foo.ts', suffix: '12-22'});
  const b = idFor({kind: 'modify', key: 'src/foo.ts', suffix: '23-33'});
  assert.notEqual(a, b);
});

test('different kind yields different prefix', () => {
  const a = idFor({kind: 'modify', key: 'abc'});
  const b = idFor({kind: 'decide', key: 'abc'});
  assert.equal(a.slice(0, 2), 'm_');
  assert.equal(b.slice(0, 2), 'd_');
});

test('two commits with same subject produce different ids (sha disambiguates)', () => {
  const a = idFor({kind: 'decide', key: 'feat: add x', suffix: 'a1b2c3'});
  const b = idFor({kind: 'decide', key: 'feat: add x', suffix: 'd4e5f6'});
  assert.notEqual(a, b);
});
```

- [ ] **Step 2: Run tests, confirm RED**

Run: `node --test test/flow/ids.test.mjs`
Expected: 5 tests, all FAIL (idFor not implemented).

- [ ] **Step 3: Implement ids.mjs**

`bin/flow/ids.mjs`:

```js
import {createHash} from 'node:crypto';

const KIND_PREFIX = {modify: 'm_', decide: 'd_', validate: 'v_'};

export function idFor({kind, key, suffix = ''}) {
  const prefix = KIND_PREFIX[kind] || `${kind.slice(0, 1)}_`;
  const h = createHash('sha1');
  h.update(`${kind}|${key}|${suffix}`);
  return `${prefix}${h.digest('hex').slice(0, 6)}`;
}
```

- [ ] **Step 4: Run tests, confirm GREEN**

Run: `node --test test/flow/ids.test.mjs`
Expected: 5 tests, all PASS.

- [ ] **Step 5: Commit**

```bash
git add bin/flow/ids.mjs test/flow/ids.test.mjs
git commit -m "feat(flow): deterministic node ids"
```

---

## Task 5: builder-spec.mjs — TDD RED

**Files:**
- Create: `bin/flow/builder-spec.mjs`
- Create: `test/flow/builder-spec.test.mjs`

- [ ] **Step 1: Write the failing tests**

`test/flow/builder-spec.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSpec} from '../../bin/flow/builder-spec.mjs';

const baseInputs = () => ({
  range: 'origin/main...HEAD',
  baseSha: 'base1234',
  files: [{
    path: 'src/x.ts', binary: false, renameFrom: null,
    hunks: [{start: 12, add: 5, del: 3, lines: [12, 16]}],
  }],
  commits: [{sha: 'abcdef', subject: 'feat: x', body: ''}],
  decisions: [],
  validations: [],
  schemaVersion: 2,
});

test('builds spec with start, modify, decide, end', () => {
  const spec = buildSpec(baseInputs());
  const lanes = spec.nodes.map(n => n.lane).filter(Boolean);
  assert.ok(lanes.includes('Modify'));
  assert.ok(lanes.includes('Decide'));
  const ids = spec.nodes.map(n => n.id);
  assert.ok(ids.includes('start'));
  assert.ok(ids.includes('end'));
});

test('collapses commits to summary node when > 10', () => {
  const commits = Array.from({length: 11}, (_, i) => ({
    sha: `sha${i}`, subject: `commit ${i}`, body: '',
  }));
  const spec = buildSpec({...baseInputs(), commits});
  const decideNodes = spec.nodes.filter(n => n.lane === 'Decide');
  assert.equal(decideNodes.length, 1);
  assert.match(decideNodes[0].label, /^11 commits/);
  assert.ok(decideNodes[0].description.includes('sha0'));
  assert.ok(decideNodes[0].description.includes('sha10'));
});

test('appends explicit decisions after commit nodes', () => {
  const decisions = [{title: 'Rationale: chose lazy', body: 'because...'}];
  const spec = buildSpec({...baseInputs(), decisions});
  const decideNodes = spec.nodes.filter(n => n.lane === 'Decide');
  assert.ok(decideNodes.some(n => n.label.includes('chose lazy')));
});

test('skips empty Modify lane when no files', () => {
  const spec = buildSpec({...baseInputs(), files: []});
  const ids = spec.nodes.filter(n => n.lane === 'Modify').map(n => n.id);
  assert.equal(ids.length, 0);
  // still has start and end
  assert.ok(spec.nodes.some(n => n.id === 'start'));
  assert.ok(spec.nodes.some(n => n.id === 'end'));
});

test('emits schema_version 2 by default', () => {
  const spec = buildSpec(baseInputs());
  assert.equal(spec.schema_version, 2);
  assert.equal(spec.diagram_type, 'workflow');
  assert.ok(Array.isArray(spec.semanticChecks.allowedRoots));
  assert.ok(spec.semanticChecks.allowedRoots.includes('start'));
});

test('emits schema_version 1 when --schema=1', () => {
  const spec = buildSpec({...baseInputs(), schemaVersion: 1});
  assert.equal(spec.schema_version, 1);
  // semanticChecks is v2-only
  assert.equal(spec.semanticChecks, undefined);
});

test('binary file gets a single Binary label', () => {
  const files = [{path: 'img.png', binary: true, renameFrom: null, hunks: []}];
  const spec = buildSpec({...baseInputs(), files});
  const node = spec.nodes.find(n => n.label.startsWith('img.png'));
  assert.ok(node);
  assert.match(node.label, /Binary changes/);
});

test('validates axes are wired start → modify → decide → validate → end', () => {
  const validations = [{name: 'lint', status: 'passed', summary: 'ok'}];
  const spec = buildSpec({...baseInputs(), validations});
  assert.ok(spec.edges.some(e => e.from === 'start'));
  assert.ok(spec.edges.some(e => e.to === 'end'));
  assert.deepEqual(spec.mainPath[0], 'start');
  assert.equal(spec.mainPath[spec.mainPath.length - 1], 'end');
});

test('honors since-message filter (only matching commits appear)', () => {
  const commits = [
    {sha: 'aaaa', subject: 'feat: include', body: ''},
    {sha: 'bbbb', subject: 'chore: skip',   body: ''},
  ];
  const spec = buildSpec({
    ...baseInputs(), commits, sinceMessage: 'feat:*',
  });
  const decideNodes = spec.nodes.filter(n => n.lane === 'Decide');
  assert.equal(decideNodes.length, 1);
  assert.match(decideNodes[0].label, /feat: include/);
});
```

- [ ] **Step 2: Create the placeholder module**

`bin/flow/builder-spec.mjs`:

```js
export function buildSpec(_inputs) {
  throw new Error('not implemented');
}
```

- [ ] **Step 3: Run tests, confirm RED**

Run: `node --test test/flow/builder-spec.test.mjs`
Expected: 9 tests, all FAIL.

- [ ] **Step 4: Commit RED**

```bash
git add bin/flow/builder-spec.mjs test/flow/builder-spec.test.mjs
git commit -m "test(flow): failing specs for workflow spec builder"
```

---

## Task 6: builder-spec.mjs — TDD GREEN

**Files:**
- Modify: `bin/flow/builder-spec.mjs`

- [ ] **Step 1: Implement buildSpec**

Replace `bin/flow/builder-spec.mjs`:

```js
import {idFor} from './ids.mjs';

function globToRegex(glob) {
  // minimal glob: '*' → '.*'
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function commitMatches(commit, sinceMessage) {
  if (!sinceMessage) return true;
  return globToRegex(sinceMessage).test(commit.subject);
}

function buildModifyNode(file) {
  const id = idFor({kind: 'modify', key: file.path, suffix: file.hunks.map(h => h.lines.join('-')).join(',')});
  if (file.binary) {
    return {id, lane: 'Modify', type: 'default', label: `${file.path} (Binary changes)`};
  }
  const adds = file.hunks.reduce((s, h) => s + h.add, 0);
  const dels = file.hunks.reduce((s, h) => s + h.del, 0);
  const ranges = file.hunks.map(h => `lines ${h.lines[0]}-${h.lines[1]}`).join(', ');
  return {
    id,
    lane: 'Modify',
    type: 'default',
    label: `${file.path} (+${adds} -${dels})`,
    description: ranges ? `hunks at ${ranges}` : '',
  };
}

function buildDecideNodeFromCommit(c) {
  return {
    id: idFor({kind: 'decide', key: c.subject, suffix: c.sha}),
    lane: 'Decide',
    type: 'default',
    label: `${c.sha.slice(0, 7)} ${c.subject}`,
    description: c.body || '',
  };
}

function buildCollapsedDecideNode(commits) {
  const shas = commits.map(c => c.sha).join(' ');
  return {
    id: idFor({kind: 'decide', key: 'collapsed', suffix: shas}),
    lane: 'Decide',
    type: 'default',
    label: `${commits.length} commits`,
    description: `${commits[0].subject} … ${commits[commits.length - 1].subject} (${commits.map(c => c.sha.slice(0, 7)).join(' ')})`,
  };
}

function buildDecideNodeFromDecision(d) {
  return {
    id: idFor({kind: 'decide', key: d.title, suffix: 'explicit'}),
    lane: 'Decide',
    type: 'default',
    label: d.title,
    description: d.body,
  };
}

function buildValidateNode(v) {
  return {
    id: idFor({kind: 'validate', key: v.name, suffix: v.status}),
    lane: 'Validate',
    type: 'default',
    label: `${v.name}: ${v.status}`,
    description: v.summary || '',
  };
}

function buildInternalValidateNode(result) {
  return {
    id: idFor({kind: 'validate', key: 'archify-validate', suffix: result.status}),
    lane: 'Validate',
    type: 'default',
    label: `archify validate ${result.status}`,
    description: result.summary,
  };
}

function chainEdges(nodes) {
  const edges = [];
  let prev = 'start';
  for (const n of nodes) {
    if (n.id === 'start' || n.id === 'end') continue;
    edges.push({from: prev, to: n.id});
    prev = n.id;
  }
  edges.push({from: prev, to: 'end'});
  return edges;
}

export function buildSpec(inputs) {
  const {
    range, baseSha, files, commits, decisions = [],
    validations = [], schemaVersion = 2, sinceMessage,
  } = inputs;

  const filteredCommits = commits.filter(c => commitMatches(c, sinceMessage));

  const modifyNodes = files
    .filter(f => !f.binary || files.length === 1)
    .map(buildModifyNode)
    .concat(files.filter(f => f.binary && files.length !== 1).map(f => buildModifyNode(f)));
  // the above ensures binary files always emit a node but won't double-count when 1 file only

  let decideNodes;
  if (filteredCommits.length > 10) {
    decideNodes = [buildCollapsedDecideNode(filteredCommits)];
  } else {
    decideNodes = filteredCommits.map(buildDecideNodeFromCommit);
  }
  const explicitDecideNodes = decisions.map(buildDecideNodeFromDecision);
  decideNodes = decideNodes.concat(explicitDecideNodes);

  const validateNodes = validations.map(buildValidateNode);

  const ordered = [
    ...modifyNodes,
    ...decideNodes,
    ...validateNodes,
  ];

  const nodes = [{id: 'start', type: 'start'}, ...ordered, {id: 'end', type: 'terminal'}];

  const edges = chainEdges(ordered);
  const mainPath = ['start', ...ordered.map(n => n.id), 'end'];

  const meta = {
    title: `Flow for ${range}`,
    animation: 'trace',
  };

  const spec = {
    schema_version: schemaVersion,
    diagram_type: 'workflow',
    meta,
    lanes: ['Modify', 'Decide', 'Validate'],
    nodes,
    edges,
    mainPath,
  };

  if (schemaVersion >= 2) {
    spec.semanticChecks = {
      allowedRoots: ['start'],
      allowedTerminals: ['end'],
    };
    spec._flow_source = {range, baseSha, generated_at: 'will-be-stamped-by-runner'};
  }

  return spec;
}
```

- [ ] **Step 2: Run tests, confirm GREEN**

Run: `node --test test/flow/builder-spec.test.mjs`
Expected: 9 tests, all PASS. If any fail, fix the implementation (NOT the tests — they encode the spec).

- [ ] **Step 3: Commit GREEN**

```bash
git add bin/flow/builder-spec.mjs
git commit -m "feat(flow): workflow spec builder (schema v1 + v2)"
```

---

## Task 7: runner.mjs — orchestration (TDD with mocked subprocess)

**Files:**
- Create: `bin/flow/runner.mjs`
- Create: `test/flow/runner.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/flow/runner.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {runFlow} from '../../bin/flow/runner.mjs';

test('runFlow writes workflow.json + workflow.html and returns receipt', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'archify-flow-'));
  const outDir = path.join(tmpRoot, 'docs/flows');

  // we use a tiny fixture range - here we mock parseDiffRange by stubbing through env?
  // simpler: rely on actual mini-repo inside test/flow/fixtures/mini-repo (Task 8 creates it)
  const range = `${process.cwd()}/test/flow/fixtures/mini-repo/main...feat`;
  const receipt = await runFlow({range, out: outDir, quality: 'standard',
    schemaVersion: 2, decisionMode: 'auto', archifyBin: `node ${process.cwd()}/bin/archify.mjs`});

  assert.ok(receipt.jsonPath.endsWith('workflow.json'));
  assert.ok(receipt.htmlPath.endsWith('workflow.html'));
  const json = JSON.parse(await fs.readFile(receipt.jsonPath, 'utf8'));
  assert.equal(json.diagram_type, 'workflow');
  assert.ok(json.nodes.length >= 3); // start + at least one modify + end

  await fs.rm(tmpRoot, {recursive: true, force: true});
});
```

(Real mini-repo fixture is built by Task 8; this task assumes it exists. If it's not yet present, skip the test in CI by wrapping it in `if (await repoReady())` — see Task 8 for the helper.)

- [ ] **Step 2: Stub runner.mjs**

`bin/flow/runner.mjs`:

```js
export async function runFlow(_opts) {
  throw new Error('not implemented');
}
```

- [ ] **Step 3: Run test, confirm RED**

Run: `node --test test/flow/runner.test.mjs`
Expected: 1 test, FAIL.

- [ ] **Step 4: Implement runner.mjs**

`bin/flow/runner.mjs`:

```js
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseDiffRange} from './parser-diff.mjs';
import {buildSpec} from './builder-spec.mjs';

function parseCommits(range) {
  const text = execFileSync('git', [
    'log', range, '--pretty=%h%n%s%n%b%n--END--',
  ], {encoding: 'utf8'});
  if (!text.trim()) return [];
  return text.split('--END--\n').filter(Boolean).map(block => {
    const [sha, subject, ...rest] = block.split('\n');
    return {sha, subject, body: rest.join('\n').trim()};
  });
}

function loadMdDecisions(file) {
  // Each "## Title" starts a decision node; body is until next "## " or EOF.
  const text = require('node:fs').readFileSync(file, 'utf8');
  const decisions = [];
  const re = /^## (.+)$/gm;
  const matches = [...text.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const title = matches[i][1];
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    decisions.push({title, body: text.slice(start, end).trim()});
  }
  return decisions;
}

async function loadValidations(file) {
  if (!file) return [];
  const text = await fs.readFile(file, 'utf8');
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : [data];
}

export async function runFlow(opts) {
  const {
    range, out, quality = 'standard', schemaVersion = 2,
    decisions: decisionsFile, validations: validationsFile,
    archifyBin, sinceMessage,
  } = opts;

  const stamp = new Date().toISOString();
  const files = parseDiffRange(range);
  const [baseSha] = range.split(/\.\.\.| \.\. /);
  const commits = parseCommits(range);
  const decisions = decisionsFile ? loadMdDecisions(decisionsFile) : [];
  const validations = validationsFile ? await loadValidations(validationsFile) : [];

  const spec = buildSpec({
    range, baseSha, files, commits, decisions, validations,
    schemaVersion, sinceMessage,
  });
  // stamp generated_at deterministically AFTER build so the JSON is stable for hash:
  if (spec._flow_source) spec._flow_source.generated_at = stamp;

  await fs.mkdir(out, {recursive: true});
  const jsonPath = path.join(out, 'workflow.json');
  await fs.writeFile(jsonPath, JSON.stringify(spec, null, 2), 'utf8');

  // Reuse existing archify CLI for validate + deliver
  const cwd = process.cwd();
  let validateReceipt;
  try {
    const v = execFileSync('node', [
      ...archifyBin.split(' ').slice(1), // strip leading "node"
      'validate', 'workflow', jsonPath,
      `--quality=${quality}`, '--json',
    ], {encoding: 'utf8', cwd});
    validateReceipt = JSON.parse(v);
  } catch (e) {
    validateReceipt = {status: 'failed', summary: e.message};
  }

  const htmlPath = path.join(out, 'workflow.html');
  execFileSync('node', [
    ...archifyBin.split(' ').slice(1),
    'deliver', 'workflow', jsonPath, htmlPath,
    `--quality=${quality}`, '--json',
  ], {encoding: 'utf8', cwd});

  return {jsonPath, htmlPath, validateReceipt, range, stamp, schemaVersion};
}
```

Note: in archify's actual codebase, `archifyBin` is `node /path/to/archify/bin/archify.mjs`. The `slice(1)` strips the literal `node` token. Adapt if archify's dispatch differs.

- [ ] **Step 5: Run test, confirm GREEN (only if mini-repo exists)**

Run: `node --test test/flow/runner.test.mjs`
Expected: 1 test, PASS (after Task 8 builds the mini-repo).

If Task 8 hasn't run yet, expect FAIL on "repo not found". Run Task 8 next.

- [ ] **Step 6: Commit**

```bash
git add bin/flow/runner.mjs test/flow/runner.test.mjs
git commit -m "feat(flow): orchestration runner"
```

---

## Task 8: Build mini-repo fixture

**Files:**
- Create: `test/flow/fixtures/mini-repo/bootstrap.mjs`

- [ ] **Step 1: Write the bootstrap script**

`test/flow/fixtures/mini-repo/bootstrap.mjs`:

```js
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

async function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {encoding: 'utf8', cwd: root, ...opts});
}

export async function ensureFixture() {
  const exists = await fs.stat(path.join(root, '.git')).then(() => true).catch(() => false);
  if (exists) return;

  await sh('git', ['init', '-b', 'main']);
  await sh('git', ['config', 'user.email', 'archify-test@example.com']);
  await sh('git', ['config', 'user.name', 'archify-test']);
  await fs.writeFile(path.join(root, '.gitignore'), 'node_modules\n');
  await fs.writeFile(path.join(root, 'README.md'), '# Fixture\n');
  await sh('git', ['add', '.']);
  await sh('git', ['commit', '-m', 'initial: fixture seed']);

  // create a feature branch with changes
  await sh('git', ['checkout', '-b', 'feat']);
  await fs.writeFile(path.join(root, 'src/users.ts'),
    'export function users() { return []; }\n');
  await fs.mkdir(path.join(root, 'docs'), {recursive: true});
  await fs.writeFile(path.join(root, 'docs/changelog.md'),
    '# Changelog\n\n- initial\n');
  await sh('git', ['add', '.']);
  await sh('git', ['commit', '-m', 'feat(users): stub users endpoint']);
  // add a second commit
  await fs.writeFile(path.join(root, 'src/users.ts'),
    'export function users() { return [{id: 1}]; }\nexport function get(id) { return {id}; }\n');
  await fs.writeFile(path.join(root, 'docs/changelog.md'),
    '# Changelog\n\n- initial\n- add get(id)\n');
  await sh('git', ['add', '.']);
  await sh('git', ['commit', '-m', 'feat(users): add get(id) helper']);
  await sh('git', ['checkout', 'main']);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureFixture().catch(e => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Run the bootstrap**

Run: `node test/flow/fixtures/mini-repo/bootstrap.mjs`
Expected: creates `.git` inside `test/flow/fixtures/mini-repo/` and exits 0.

- [ ] **Step 3: Verify the fixture**

Run:
```bash
cd test/flow/fixtures/mini-repo
git log --all --oneline
git diff main...feat --stat
```
Expected: ~3 commits, diff shows `src/users.ts` and `docs/changelog.md` changed.

- [ ] **Step 4: Update Task 7 test helper to add `repoReady()` guard**

In `test/flow/runner.test.mjs`, wrap the test body with:

```js
import {ensureFixture} from './fixtures/mini-repo/bootstrap.mjs';

test('runFlow writes workflow.json + workflow.html and returns receipt', async () => {
  await ensureFixture();
  // ... rest of test
});
```

- [ ] **Step 5: Re-run runner test**

Run: `node --test test/flow/runner.test.mjs`
Expected: 1 test, PASS.

- [ ] **Step 6: Add `.gitignore` to the fixture (so .git itself isn't committed)**

Add `test/flow/fixtures/mini-repo/.gitignore`:

```
.git/
```

(And ensure the root archify `.gitignore` does not collide. Quick check: `cat .gitignore`.)

- [ ] **Step 7: Commit fixture**

```bash
git add test/flow/fixtures/mini-repo/
git commit -m "test(flow): deterministic mini-repo fixture"
```

---

## Task 9: Wire `flow` into archify CLI dispatcher

**Files:**
- Modify: `bin/archify.mjs`

- [ ] **Step 1: Read current dispatcher**

Run:
```bash
sed -n '1,40p' bin/archify.mjs
```
Identify where other subcommands are dispatched (around the `switch` on `command`). Pattern is likely:

```js
const command = process.argv[2];
switch (command) {
  case 'render': ...
  case 'deliver': ...
  ...
}
```

- [ ] **Step 2: Add `flow` case**

In `bin/archify.mjs`, after the existing cases, add:

```js
    case 'flow': {
      const {runCLI} = await import('./flow.mjs');
      await runCLI(process.argv.slice(3));
      break;
    }
```

Insert in the same alphabetical / structural position the maintainers use. Adjust import syntax to match archify's existing dynamic-import style.

- [ ] **Step 3: Create `bin/flow.mjs` (CLI entry)**

`bin/flow.mjs`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import {runFlow} from './flow/runner.mjs';

export async function runCLI(args) {
  const opts = parseArgs(args);
  if (opts.help) {
    printHelp();
    return;
  }
  const repoRoot = process.cwd();
  const out = path.resolve(repoRoot, opts.out || 'docs/flows');
  if (!out.startsWith(repoRoot + path.sep) && out !== repoRoot) {
    console.error(`--out must be inside the repository: ${out}`);
    process.exit(6);
  }

  // Pre-flight: range must contain at least 1 changed file, otherwise exit 2.
  const {execFileSync} = await import('node:child_process');
  const diffProbe = execFileSync('git', [
    'diff', '--unified=0', '--no-color', '--no-ext-diff',
    opts['git-range'],
  ], {encoding: 'utf8'});
  if (!diffProbe.trim()) {
    console.error(`archify flow: no changes detected in ${opts['git-range']}`);
    process.exit(2);
  }

  let receipt;
  try {
    receipt = await runFlow({
      range: opts['git-range'],
      out,
      quality: opts.quality || 'standard',
      schemaVersion: opts.schema === '1' ? 1 : 2,
      decisions: opts.decisions,
      validations: opts.validations,
      sinceMessage: opts['since-message'],
      archifyBin: `node ${path.resolve(repoRoot, 'bin/archify.mjs')}`,
    });
  } catch (e) {
    if (e.code === 'SCHEMA_VIOLATION') process.exit(3);
    if (e.code === 'VALIDATE_FAILED') {
      if (opts.strict) process.exit(5);
      // non-strict: deliver HTML anyway with warning badge (already in receipt)
      receipt = e.receipt;
    } else {
      throw e;
    }
  }
  if (opts.strict && receipt?.validateReceipt?.status !== 'passed') {
    console.error(`--strict: archify validate did not pass (${receipt.validateReceipt.status})`);
    process.exit(5);
  }
  if (opts.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`✓ ${receipt.jsonPath}`);
    console.log(`✓ ${receipt.htmlPath}`);
  }
}

function parseArgs(args) {
  const opts = {_: []};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        opts[key] = next;
        i++;
      } else {
        opts[key] = true;
      }
    } else {
      opts._.push(a);
    }
  }
  opts.help = !!opts.help;
  return opts;
}

function printHelp() {
  console.log(`Usage:
  archify flow --git-range <range> [--out <dir>] [options]

Options:
  --git-range <range>       Range to diff (e.g. origin/main...HEAD). Required.
  --out <dir>               Output directory (default: docs/flows/).
  --since-message <glob>    Only include commits whose subject matches the glob.
  --decisions <md-file>     Markdown file with ## decisions appended to Decide lane.
  --validations <json-file> JSON array of {name,status,summary} nodes appended to Validate lane.
  --quality <level>         standard | showcase (default: standard).
  --schema <1|2>            Schema version (default: 2).
  --strict                  Exit 5 if archify validate fails or any warning.
  --json                    Emit machine-readable receipt.
  --help                    Print this help.

Exit codes:
  0 success, 2 no diff, 3 schema violation, 4 validate fail, 5 --strict trip, 6 --out outside repo.`);
}
```

- [ ] **Step 4: Manual smoke test**

Run (from archify repo root, on the mini fixture):

```bash
node bin/archify.mjs flow \
  --git-range=./test/flow/fixtures/mini-repo/main...feat \
  --out=/tmp/test-flow-out
cat /tmp/test-flow-out/workflow.json | head -20
ls /tmp/test-flow-out
rm -rf /tmp/test-flow-out
```

Expected: prints file paths, lists 2 files (`workflow.json`, `workflow.html`), JSON is valid.

- [ ] **Step 5: Commit**

```bash
git add bin/archify.mjs bin/flow.mjs
git commit -m "feat(flow): wire flow subcommand into archify CLI"
```

---

## Task 10: End-to-end CLI test (with real subprocess)

**Files:**
- Create: `test/flow/flow-cli.test.mjs`

- [ ] **Step 1: Write the test**

`test/flow/flow-cli.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ensureFixture} from './fixtures/mini-repo/bootstrap.mjs';

test('archify flow --git-range writes workflow.json + workflow.html', async () => {
  await ensureFixture();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archify-flow-cli-'));
  const fixture = `${process.cwd()}/test/flow/fixtures/mini-repo`;
  execFileSync('node', [
    `${process.cwd()}/bin/archify.mjs`, 'flow',
    `--git-range=${fixture}/main...feat`,
    `--out=${tmp}`,
    '--quality=standard',
  ], {encoding: 'utf8'});

  const files = await fs.readdir(tmp);
  assert.ok(files.includes('workflow.json'));
  assert.ok(files.includes('workflow.html'));
  await fs.rm(tmp, {recursive: true, force: true});
});

test('exit code 2 on empty diff', async () => {
  await ensureFixture();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archify-flow-empty-'));
  const fixture = `${process.cwd()}/test/flow/fixtures/mini-repo`;
  let exitCode = 0;
  try {
    execFileSync('node', [
      `${process.cwd()}/bin/archify.mjs`, 'flow',
      `--git-range=${fixture}/main...main`,
      `--out=${tmp}`,
    ], {encoding: 'utf8'});
  } catch (e) {
    exitCode = e.status;
  }
  assert.equal(exitCode, 2);
  await fs.rm(tmp, {recursive: true, force: true});
});
```

- [ ] **Step 2: Run test**

Run: `node --test test/flow/flow-cli.test.mjs`
Expected: 2 tests, both PASS.

- [ ] **Step 3: Commit**

```bash
git add test/flow/flow-cli.test.mjs
git commit -m "test(flow): end-to-end CLI coverage"
```

---

## Task 11: Cross-version tests (v1 + v2)

**Files:**
- Create: `test/flow/schema-versions.test.mjs`

- [ ] **Step 1: Write the test**

`test/flow/schema-versions.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ensureFixture} from './fixtures/mini-repo/bootstrap.mjs';

async function runSchema(flag) {
  await ensureFixture();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `archify-${flag}-`));
  const fixture = `${process.cwd()}/test/flow/fixtures/mini-repo`;
  execFileSync('node', [
    `${process.cwd()}/bin/archify.mjs`, 'flow',
    `--git-range=${fixture}/main...feat`,
    `--out=${tmp}`,
    `--schema=${flag}`,
  ], {encoding: 'utf8'});
  const json = JSON.parse(await fs.readFile(path.join(tmp, 'workflow.json'), 'utf8'));
  await fs.rm(tmp, {recursive: true, force: true});
  return json;
}

test('default emits schema_version 2 with semanticChecks', async () => {
  const json = await runSchema('2');
  assert.equal(json.schema_version, 2);
  assert.ok(json.semanticChecks);
});

test('--schema=1 emits schema_version 1 without semanticChecks', async () => {
  const json = await runSchema('1');
  assert.equal(json.schema_version, 1);
  assert.equal(json.semanticChecks, undefined);
});
```

- [ ] **Step 2: Run test**

Run: `node --test test/flow/schema-versions.test.mjs`
Expected: 2 tests, both PASS.

- [ ] **Step 3: Commit**

```bash
git add test/flow/schema-versions.test.mjs
git commit -m "test(flow): schema v1 + v2 cross-version compatibility"
```

---

## Task 12: Snapshot test for the receipt

**Files:**
- Create: `test/flow/snapshots/flow-cli-receipt.json`
- Create: `test/flow/snapshot.test.mjs`

- [ ] **Step 1: Capture the initial snapshot**

Run once to capture (then re-run to verify stability):

```bash
node bin/archify.mjs flow \
  --git-range=./test/flow/fixtures/mini-repo/main...feat \
  --out=/tmp/snap-out --json > test/flow/snapshots/flow-cli-receipt.json
```

Inspect: `cat test/flow/snapshots/flow-cli-receipt.json`. Should be valid JSON with `jsonPath`, `htmlPath`, `validateReceipt`, `range`, `stamp`, `schemaVersion`. The `stamp` will differ between runs — re-capture after stabilizing it.

- [ ] **Step 2: Make snapshot stable — strip non-deterministic fields**

After capturing, edit `test/flow/snapshots/flow-cli-receipt.json` to replace:
- `stamp` → `"<DETERMINISTIC>"`
- `validateReceipt.*` paths/IDs → `"<DETERMINISTIC>"`

OR: change the snapshot test to mask these fields before comparison (preferred). Use the masking approach in step 3.

- [ ] **Step 3: Write the test that masks and compares**

`test/flow/snapshot.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ensureFixture} from './fixtures/mini-repo/bootstrap.mjs';

function mask(rec) {
  return {
    ...rec,
    stamp: '<STAMP>',
    jsonPath: '<JSONPATH>',
    htmlPath: '<HTMLPATH>',
  };
}

test('flow receipt matches snapshot (masked for non-determinism)', async () => {
  await ensureFixture();
  const tmp = '/tmp/snap-out-' + Date.now();
  await fs.mkdir(tmp, {recursive: true});
  execFileSync('node', [
    `${process.cwd()}/bin/archify.mjs`, 'flow',
    `--git-range=${process.cwd()}/test/flow/fixtures/mini-repo/main...feat`,
    `--out=${tmp}`,
    '--json',
  ], {encoding: 'utf8'});

  const actual = JSON.parse(await fs.readFile(path.join(tmp, 'workflow.json'), 'utf8'));
  const m = mask(actual);
  await fs.rm(tmp, {recursive: true, force: true});
  const expected = JSON.parse(await fs.readFile(
    `${process.cwd()}/test/flow/snapshots/flow-cli-receipt.json`, 'utf8'));
  assert.deepEqual(m, expected);
});
```

- [ ] **Step 4: Run test — first run is RED (no snapshot)**

Run: `node --test test/flow/snapshot.test.mjs`
Expected: FAIL (no snapshot file). Copy the actual masked output to the snapshot file:

```bash
node -e '
import("/tmp/snap-out-X/...").catch(...);
'  # quick hack: just copy the workflow.json once the test crashes
```

Simpler approach: run the CLI once, copy the output, hand-edit the snapshot file. The test then validates stability on subsequent runs.

- [ ] **Step 5: Re-run test**

Run: `node --test test/flow/snapshot.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add test/flow/snapshot.test.mjs test/flow/snapshots/
git commit -m "test(flow): receipt snapshot baseline"
```

---

## Task 13: pre-push hook logic + tests

**Files:**
- Create: `hooks/pre-push.flow.mjs`
- Create: `test/flow/hook-pre-push.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/flow/hook-pre-push.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {runHook} from '../../hooks/pre-push.flow.mjs';

async function withCwd(dir, fn) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return await fn(); } finally { process.chdir(prev); }
}

async function buildCliCallLog(logFile) {
  await fs.writeFile(logFile, '');
  return (cmdline) => {
    fs.appendFile(logFile, cmdline + '\n');
  };
}

test('hook no-ops on push to main', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archify-hook-'));
  await withCwd(tmp, async () => {
    const r = await runHook({
      remote: 'origin',
      remoteRef: 'refs/heads/main',
      execCli: async () => { throw new Error('should not be called'); },
    });
    assert.equal(r.exitCode, 0);
    assert.equal(r.action, 'noop');
  });
  await fs.rm(tmp, {recursive: true, force: true});
});

test('hook invokes CLI for feature branch', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archify-hook-'));
  await withCwd(tmp, async () => {
    let called = false;
    const r = await runHook({
      remote: 'origin',
      remoteRef: 'refs/heads/feat',
      execCli: async (cmd) => {
        called = true;
        assert.match(cmd, /archify flow/);
        assert.match(cmd, /--git-range=origin\/main\.\.\.HEAD/);
        return {status: 0};
      },
      execGit: async (cmd) => { /* swallow */ },
    });
    assert.equal(r.exitCode, 0);
    assert.equal(r.action, 'flow-and-commit');
    assert.equal(called, true);
  });
  await fs.rm(tmp, {recursive: true, force: true});
});

test('hook exits 0 (never blocks) on CLI failure', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archify-hook-'));
  await withCwd(tmp, async () => {
    const r = await runHook({
      remote: 'origin',
      remoteRef: 'refs/heads/feat',
      execCli: async () => { throw new Error('archify not installed'); },
      execGit: async () => {},
      log: () => {},
    });
    assert.equal(r.exitCode, 0);
    assert.equal(r.action, 'flow-skipped');
  });
  await fs.rm(tmp, {recursive: true, force: true});
});
```

- [ ] **Step 2: Stub `hooks/pre-push.flow.mjs`**

```js
export async function runHook(_opts) {
  throw new Error('not implemented');
}
```

- [ ] **Step 3: Run tests, confirm RED**

Run: `node --test test/flow/hook-pre-push.test.mjs`
Expected: 3 tests, all FAIL.

- [ ] **Step 4: Implement the hook**

`hooks/pre-push.flow.mjs`:

```js
import path from 'node:path';
import fs from 'node:fs/promises';

const SKIP_REFS = new Set(['refs/heads/main', 'refs/heads/master']);

export async function runHook(opts = {}) {
  const {
    remote = 'origin',
    remoteRef,
    repoRoot = process.cwd(),
    archifyBin = `node ${path.join(repoRoot, 'bin/archify.mjs')}`,
    execCli = defaultExecCli,
    execGit = defaultExecGit,
    log = (m) => process.stderr.write(`[archify-flow] ${m}\n`),
  } = opts;

  if (SKIP_REFS.has(remoteRef)) {
    return {exitCode: 0, action: 'noop'};
  }

  const range = `${remote}/main...HEAD`;
  try {
    await execCli(`${archifyBin} flow --git-range=${range} --out=${path.join(repoRoot, 'docs/flows')} --quality=standard`);
    await execGit('add docs/flows/');
    await execGit('commit -m "chore(flow): regenera workflow [skip ci]"');
    return {exitCode: 0, action: 'flow-and-commit'};
  } catch (e) {
    log(`hook failed: ${e.message}`);
    await fs.appendFile(
      path.join(repoRoot, '.archify', 'flow.log'),
      `${new Date().toISOString()} ${e.message}\n`,
    ).catch(() => {});
    return {exitCode: 0, action: 'flow-skipped'};
  }
}

function defaultExecCli(cmdline) {
  const {execFileSync} = require('node:child_process');
  const args = cmdline.match(/(?:[^\s"]+|"[^"]*")+/g)
    .map(s => s.replace(/^"(.*)"$/, '$1'));
  execFileSync(args.shift(), args, {encoding: 'utf8', stdio: 'inherit'});
}

function defaultExecGit(cmdline) {
  const {execFileSync} = require('node:child_process');
  const args = ['-c', `core.hooksPath=/dev/null`, ...cmdline.match(/(?:[^\s"]+|"[^"]*")+/g)];
  execFileSync('git', args, {encoding: 'utf8', stdio: 'inherit'});
}

// Husky entry: read stdin, parse first line "remoteName remoteRef localSha remoteSha"
if (process.argv[2] === '--cli') {
  (async () => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) buf += chunk;
    const [remote, remoteRef] = buf.trim().split(' ');
    const r = await runHook({remote, remoteRef});
    process.exit(r.exitCode);
  })();
}
```

- [ ] **Step 5: Run tests, confirm GREEN**

Run: `node --test test/flow/hook-pre-push.test.mjs`
Expected: 3 tests, all PASS.

- [ ] **Step 6: Commit**

```bash
git add hooks/pre-push.flow.mjs test/flow/hook-pre-push.test.mjs
git commit -m "feat(flow): pre-push hook logic"
```

---

## Task 14: install-flow-hook.mjs (installer)

**Files:**
- Create: `bin/install-flow-hook.mjs`
- Create: `test/flow/install-flow-hook.test.mjs`

- [ ] **Step 1: Write failing tests**

`test/flow/install-flow-hook.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {detectTarget, writeShim} from '../../bin/install-flow-hook.mjs';

test('detectTarget returns husky when .husky/_/ exists', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archify-install-'));
  await fs.mkdir(path.join(tmp, '.husky/_'), {recursive: true});
  const r = await detectTarget(tmp);
  assert.equal(r.kind, 'husky');
  assert.equal(r.path, path.join(tmp, '.husky/pre-push'));
  await fs.rm(tmp, {recursive: true, force: true});
});

test('detectTarget returns plain when .git exists and no husky', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archify-install-'));
  await fs.mkdir(path.join(tmp, '.git'), {recursive: true});
  const r = await detectTarget(tmp);
  assert.equal(r.kind, 'plain');
  assert.equal(r.path, path.join(tmp, '.git/hooks/pre-push'));
  await fs.rm(tmp, {recursive: true, force: true});
});

test('detectTarget throws when no .git', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archify-install-'));
  await assert.rejects(() => detectTarget(tmp));
  await fs.rm(tmp, {recursive: true, force: true});
});

test('writeShim refuses to overwrite without --force', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archify-install-'));
  const target = path.join(tmp, 'pre-push');
  await fs.writeFile(target, 'existing content');
  await assert.rejects(() => writeShim(target, 'new', {force: false}));
  await writeShim(target, 'new', {force: true});
  const got = await fs.readFile(target, 'utf8');
  assert.equal(got, 'new');
  await fs.rm(tmp, {recursive: true, force: true});
});

test('writeShim writes Husky-style shim', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archify-install-'));
  const target = path.join(tmp, 'pre-push');
  await writeShim(target, 'echo archify', {force: false});
  const got = await fs.readFile(target, 'utf8');
  assert.equal(got, 'echo archify');
  await fs.rm(tmp, {recursive: true, force: true});
});
```

- [ ] **Step 2: Stub `bin/install-flow-hook.mjs`**

```js
export async function detectTarget(_root) { throw new Error('not implemented'); }
export async function writeShim(_path, _body, _opts) { throw new Error('not implemented'); }
```

- [ ] **Step 3: Run tests, confirm RED**

Run: `node --test test/flow/install-flow-hook.test.mjs`
Expected: 5 tests FAIL.

- [ ] **Step 4: Implement installer**

`bin/install-flow-hook.mjs`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';

const HUSKY_HOOK_DIR = '.husky';

export async function detectTarget(root) {
  const huskyDir = path.join(root, HUSKY_HOOK_DIR);
  const huskyInner = path.join(root, '.husky/_');
  const gitHooks = path.join(root, '.git/hooks');

  if (await exists(huskyInner) || await exists(huskyDir)) {
    return {kind: 'husky', path: path.join(root, '.husky/pre-push'), root};
  }
  if (await exists(gitHooks)) {
    return {kind: 'plain', path: path.join(root, '.git/hooks/pre-push'), root};
  }
  throw new Error(`no .git or .husky found under ${root}; cannot install flow hook`);
}

export async function writeShim(targetPath, body, {force = false} = {}) {
  if (!force && await exists(targetPath)) {
    throw new Error(`hook already exists at ${targetPath}; pass --force to overwrite`);
  }
  await fs.mkdir(path.dirname(targetPath), {recursive: true});
  await fs.writeFile(targetPath, body, {encoding: 'utf8', mode: 0o755});
}

async function exists(p) {
  try { await fs.stat(p); return true; } catch { return false; }
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    const targetIdx = args.indexOf('--target');
    const targetOverride = targetIdx > -1 ? args[targetIdx + 1] : null;
    const repoRoot = process.cwd();
    try {
      const detected = await detectTarget(repoRoot);
      const target = targetOverride
        ? {kind: 'override', path: path.resolve(repoRoot, targetOverride), root: repoRoot}
        : detected;
      const shim = `#!/usr/bin/env node
// archify flow hook shim
import('${path.join(repoRoot, 'hooks/pre-push.flow.mjs').replace(/'/g, "\\'")}')
  .then(m => m.runHook({}))
  .catch(e => { console.error(e); process.exit(0); });
`;
      await writeShim(target.path, shim, {force});
      console.log(`✓ installed archify flow hook at ${target.path} (${target.kind})`);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  })();
}
```

- [ ] **Step 5: Run tests, confirm GREEN**

Run: `node --test test/flow/install-flow-hook.test.mjs`
Expected: 5 tests, all PASS.

- [ ] **Step 6: Commit**

```bash
git add bin/install-flow-hook.mjs test/flow/install-flow-hook.test.mjs
git commit -m "feat(flow): install-flow-hook (husky/plain detect + shim)"
```

---

## Task 15: Documentation

**Files:**
- Modify: `SKILL.md`
- Modify: `CHANGELOG.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update SKILL.md**

After the existing "Type router" table, append a new section:

```markdown
## Flow generation (automatic on push)

Generates a Workflow diagram of every code change just before pushing a feature branch. The artifact (`docs/flows/workflow.json` + `docs/flows/workflow.html`) is committed to the same branch and travels with the PR.

Enable on a fresh clone:

\```bash
npx archify init-flow-hook
\```

Then `git push` on any feature branch will:
- Skip on pushes to `main`/`master` (no-op).
- Otherwise: regenerate the workflow from the diff vs `origin/main`, commit with `[skip ci]`, and let the push proceed.

Manual invocation (without the hook):

\```bash
node bin/archify.mjs flow --git-range=origin/main...HEAD --out=docs/flows/
\```

See [docs/flow-spec.md] for the full argument list and exit codes.
```

(Adjust the fenced language/escape based on archify's existing SKILL.md style — some repos wrap blocks differently.)

In the type-router table, add:

```markdown
| `flow` | Generate a workflow diagram of the current diff (`archify flow`) |
```

- [ ] **Step 2: Update CHANGELOG.md**

At top of unreleased section:

```markdown
### Added
- `archify flow` subcommand: generates a workflow diagram of a git range as a versioned artifact (`docs/flows/workflow.{json,html}`).
- Pre-push hook installer (`npx archify init-flow-hook` or `node bin/install-flow-hook.mjs`) for auto-regeneration on feature-branch pushes.
```

- [ ] **Step 3: Update ROADMAP.md**

Move the "flow on diff" item from backlog to delivered (delete or mark `[DONE]`).

- [ ] **Step 4: Validate doc-sync**

If archify has a `doc-sync` CI check (`npm run doc-sync` or similar), run it:

```bash
npm run doc-sync
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add SKILL.md CHANGELOG.md ROADMAP.md
git commit -m "docs: document archify flow subcommand and hook"
```

---

## Task 16: Canonical example output

**Files:**
- Create: `examples/feat-flow/workflow.json`
- Create: `examples/feat-flow/workflow.html`
- Create: `examples/feat-flow/README.md`

- [ ] **Step 1: Generate the example**

Run:

```bash
node bin/archify.mjs flow \
  --git-range=./test/flow/fixtures/mini-repo/main...feat \
  --out=./examples/feat-flow/ \
  --quality=standard
```

- [ ] **Step 2: Add example README**

`examples/feat-flow/README.md`:

```markdown
# Example: Feature branch flow

This is a canonical example of the output produced by:

\```
archify flow --git-range=origin/main...HEAD --out=docs/flows/
\```

The inputs are a fictional user-management feature with two commits and two file changes. The artifact shows the workflow as three lanes (`Modify`, `Decide`, `Validate`) with `start` and `end` anchoring the path.

Open `workflow.html` in a browser for the interactive experience, or inspect `workflow.json` for the typed source.
```

- [ ] **Step 3: Verify the HTML renders**

Quick visual sanity check (open in browser if available). Confirm the diagram shows three lanes and an end-to-end path.

- [ ] **Step 4: Commit**

```bash
git add examples/feat-flow/
git commit -m "docs(examples): add canonical feat-flow example"
```

---

## Task 17: Final test sweep + PR

**Files:** none (operational only)

- [ ] **Step 1: Run full test suite**

```bash
npm test
node --test test/flow/
```

Expected: all archify existing tests pass, plus all new flow tests pass.

- [ ] **Step 2: Final commit on branch (if any tweaks landed)**

```bash
git status
# if clean, skip; if dirty:
git add -A
git commit -m "chore(flow): final cleanup before PR"
```

- [ ] **Step 3: Push branch**

```bash
git push origin feat/flow-subcommand
```

Expected: branch visible on the fork on GitHub.

- [ ] **Step 4: Create PR upstream**

```bash
gh pr create \
  --repo tt-a1i/archify \
  --base main \
  --head <your-username>:feat/flow-subcommand \
  --title "feat: archify flow — auto-generate workflow diagram on push" \
  --body-file .git/PULL_REQUEST_TEMPLATE.md 2>/dev/null || \
gh pr create \
  --repo tt-a1i/archify \
  --base main \
  --head <your-username>:feat/flow-subcommand \
  --title "feat: archify flow — auto-generate workflow diagram on push" \
  --body "See docs/superpowers/specs/.../2026-09-23-archify-flow-subcommand-design.md for the full design."
```

If archify uses a PR template, supply it via `--body-file`.

- [ ] **Step 5: Wait for CI + maintainer review**

Run:

```bash
gh pr checks --repo tt-a1i/archify
```

Expected: 4–6 green checks (lint, typecheck, unit tests, e2e, schema linter, doc-sync).

- [ ] **Step 6: Address review comments**

Iterate by creating additional commits on the same branch. Use **separate commits** for reviewable changes (no `--amend` per existing memory rule).

```bash
# Address a review comment:
git add file1 file2
git commit -m "fix(flow): address review: <one-line summary>"
git push
```

- [ ] **Step 7: Squash / merge per maintainer preference**

If maintainer requests squash:

```bash
gh pr merge --squash --delete-branch
```

If maintainer prefers rebase or merge-commit, follow their guidance. Default to **squash** unless told otherwise.

---

## Acceptance checklist (final)

- [ ] All 17 tasks committed atomically (or as 3 atomic rollups per spec §10).
- [ ] `npm test` green; all `node --test test/flow/*.test.mjs` green.
- [ ] `node bin/archify.mjs flow --help` shows the documented flags.
- [ ] Manual smoke test on a real repo produces `docs/flows/workflow.{json,html}`.
- [ ] Hook installed via `node bin/install-flow-hook.mjs` fires on `git push` and no-ops for `main`.
- [ ] PR is MERGEABLE upstream (all CI checks green).
- [ ] Spec + plan filed under the user's local `docs/superpowers/`.

---

## Out of scope (re-stated for clarity at execution time)

- LLM agent skill integration (explicitly deferred; this plan is CLI + git only).
- GitHub Action wrapper (no CI involvement — the local hook is the trigger).
- Per-PR branch-named artifacts (single `workflow.html` in MVP).
- Capturing agent transcripts (no agent in the loop).
- Auto-porting validation result into the spec (the `archify validate` run produces a node but is not embedded back into the spec during the same run).

If the implementation reveals any of these should be in-scope, **stop and discuss** rather than expanding the plan mid-execution.
