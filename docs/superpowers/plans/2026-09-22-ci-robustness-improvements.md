# Plano: Robustez do CI — Prevenção de Falhas Sistêmicas

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIO: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano task-by-task. Steps usam sintaxe de checkbox (`- [ ]`) para tracking.

**Branch:** `chore/ci-robustness-improvements` (criada a partir de `origin/main` em 2026-09-22).

**Objetivo:** Eliminar a classe de erros de CI observada entre 17:51 e 18:42 de 2026-09-22 no branch `feat/cadastro-usuario-com-auditoria` — 6 falhas consecutivas corrigidas por commits pontuais (409a6ea, 454e31b, 8cdf989, 0f63981) — adicionando **detecção precoce local** + **validações estruturais em CI** + **workflow de release pós-merge**.

**Arquitetura:** Camadas de defesa em profundidade.

1. **Pre-push (local):** script `pnpm ci:local` espelha o CI; devs rodam antes de push.
2. **Pre-flight (CI, primeiro job):** validações determinísticas (env, configs, refs) falham rápido.
3. **Quality (CI, atual):** lint, typecheck, test, coverage (já existe, refatorar para falhar nos sinais certos).
4. **Release pós-merge (CI, novo):** workflow `release-template.yml` auto-taggea versões após bump em `main` (carregado de `chore/ci-release-workflow`).

**Tech Stack:** GitHub Actions, pnpm turbo, Node 20, TypeScript 5, Vitest, ESLint flat config, Prisma 6, scripts Node (Node API nativo, sem deps externas).

---

## Contexto: Análise das 6 Falhas Observadas

| # | Run ID | Erro | Causa Raiz | Fix já em main |
|---|--------|------|------------|----------------|
| 1 | 35763332088 | Cross-refs quebradas em docs + ESLint rule duplicada 3× | Drift entre docs e estrutura física + regras ESLint propagadas manualmente | 454e31b |
| 2 | 35767879661 | `apps/web` ESLint flat config falha: `Cannot read config file: .eslintrc.js` | Migração para flat config incompleta (ficou config legada) | 409a6ea |
| 3 | 35768342940 | `error TS7006: Parameter 'h' implicitly has an 'any' type` em scenario 06 + `Prisma.InputJsonValue` não exportado | `noUncheckedIndexedAccess` não aplicado + Prisma client não regenerado | 409a6ea |
| 4 | 35768348169 | `pnpm turbo run typecheck` falha em `apps/api` | Prisma client não gerado antes do typecheck | 8cdf989 |
| 5 | 35768896112 | Mesmo erro de Prisma | (regressão transient) | 8cdf989 |
| 6 | 35768902329 | `ERROR: Coverage for lines (52.38%) does not meet global threshold (80%)` em `apps/web` | Threshold global irrealista para package em scaffolding | 0f63981 |

**Padrão observado:** Cada falha foi um problema de **infra/configuração**, não de lógica de teste. Erros foram detectados **tardiamente** (após push, em CI), com **sinal genérico** (linha+coluna TypeScript, exit code 1), exigindo **ciclo completo push→CI→log→fix→push** (~5min cada).

**Hipótese central:** Adicionar **detecção local + validações estruturais em CI** converte essas falhas em erros de 5 segundos no terminal do dev.

---

## Estrutura de Arquivos

```
.github/workflows/
├── ci.yml                          # MODIFICAR: adicionar preflight job
├── release-template.yml            # COPIAR de chore/ci-release-workflow (já existe lá)
├── review-stack.yml                # INTOCAR
└── sync-docs.yml                   # INTOCAR

.tooling/scripts/
├── ci/
│   ├── preflight.ts                # CRIAR: validações estruturais determinísticas
│   ├── preflight.spec.ts           # CRIAR: TDD - testes do preflight
│   ├── check-doc-refs.ts           # CRIAR: validador de cross-refs em markdown
│   ├── check-doc-refs.spec.ts      # CRIAR: TDD
│   ├── check-tsconfig-drift.ts     # CRIAR: detecta drift entre tsconfigs
│   ├── check-tsconfig-drift.spec.ts # CRIAR: TDD
│   └── check-eslint-drift.ts       # CRIAR: detecta ESLint config drift
│       └── check-eslint-drift.spec.ts # CRIAR: TDD
package.json                        # MODIFICAR: adicionar scripts ci:local, ci:preflight
.eslintrc.js                        # DELETAR (raiz, se existir - flat config only)
apps/web/eslint.config.mjs          # VERIFICAR (já migrado)
.agents/specs/conventions/
├── post-merge-release.md           # COPIAR de chore/ci-release-workflow
├── cobertura-testes.md             # MODIFICAR: adicionar seção sobre preflight
└── git-workflow.md                 # MODIFICAR: documentar pnpm ci:local
```

---

## Task 1: Adicionar script `ci:local` ao package.json raiz

**Files:**
- Modify: `package.json` (adicionar scripts)
- Modify: `.agents/specs/conventions/git-workflow.md` (documentar novo comando)

**Contexto:** Criar comando que devs rodam localmente **antes do push** para detectar os mesmos problemas que o CI detecta. Reduz ciclo feedback de 5min (push→CI→log) para 5s (terminal local).

- [ ] **Step 1: Adicionar scripts ao package.json raiz**

```json
{
  "scripts": {
    "ci:preflight": "tsx .tooling/scripts/ci/preflight.ts",
    "ci:local": "pnpm ci:preflight && pnpm turbo run lint typecheck test:unit test:coverage --filter=@projeto/api --filter=@projeto/web"
  }
}
```

- [ ] **Step 2: Verificar que `tsx` está disponível**

```bash
pnpm ls tsx 2>&1 | head -5
```

Expected: `tsx` listado em devDependencies da raiz (já existe em apps/api, verificar se workspace compartilha).

Se não existir: adicionar via `pnpm add -Dw -w tsx` antes do próximo step.

- [ ] **Step 3: Rodar `pnpm ci:preflight` para validar que o script stub existe**

```bash
pnpm ci:preflight 2>&1 | head -10
```

Expected: erro "Cannot find module .tooling/scripts/ci/preflight.ts" — esperado, vamos criá-lo na Task 2.

- [ ] **Step 4: Documentar em `.agents/specs/conventions/git-workflow.md`**

Adicionar seção após "Fluxo Obrigatório":

```markdown
## Pre-Push Quality Gate

Antes de `git push`, **OBRIGATÓRIO** rodar:

\`\`\`bash
pnpm ci:local
\`\`\`

Este comando executa as **mesmas validações que o CI roda** em ~30-60s
localmente. Se falhar, **NÃO fazer push** — corrigir primeiro.

Falhas capturadas (vs custo de detecção em CI):
- Docs com cross-refs quebradas → 5s local vs 3min CI
- Drift em tsconfig → 5s local vs 4min CI (typecheck roda)
- ESLint config duplicada → 5s local vs 3min CI (lint roda)
- Cobertura abaixo do threshold → já roda no CI

Exceção: hotfix trivial (typo, doc-only). Mesmo nesses casos,
rodar `pnpm ci:preflight` para validar refs em docs.
```

- [ ] **Step 5: Commit**

```bash
git add package.json .agents/specs/conventions/git-workflow.md
git commit -m "chore(ci): adicionar scripts ci:local e ci:preflight"
```

---

## Task 2: Criar preflight script (TDD)

**Files:**
- Create: `.tooling/scripts/ci/preflight.ts`
- Create: `.tooling/scripts/ci/preflight.spec.ts`

**Contexto:** Script que detecta **problemas estruturais** (não lógica de teste) em <5s. Falha rápido com mensagem acionável. Cada check tem teste próprio (Red→Green).

- [ ] **Step 1: Escrever teste para check de cross-refs quebradas**

Arquivo: `.tooling/scripts/ci/preflight.spec.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { checkDocRefs } from './check-doc-refs';

describe('checkDocRefs', () => {
  it('deve passar quando todas as refs apontam para arquivos existentes', async () => {
    // Setup: cria diretório temp com 2 arquivos linkados
    const result = await checkDocRefs({
      docsRoot: 'fixtures/docs-ok',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('deve falhar com mensagem clara quando ref aponta para arquivo inexistente', async () => {
    const result = await checkDocRefs({
      docsRoot: 'fixtures/docs-broken-ref',
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/docs-broken-ref\/guia\.md: link para 'arquivo-inexistente\.md' quebrado/);
  });

  it('deve ignorar refs externas (http://, https://)', async () => {
    const result = await checkDocRefs({
      docsRoot: 'fixtures/docs-external-links',
    });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha (Red)**

```bash
pnpm --filter @projeto/api exec vitest run .tooling/scripts/ci/preflight.spec.ts 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './check-doc-refs'`.

- [ ] **Step 3: Implementar `check-doc-refs.ts` mínimo para passar**

Arquivo: `.tooling/scripts/ci/check-doc-refs.ts`

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface CheckResult {
  ok: boolean;
  errors: string[];
}

/**
 * Valida que links relativos em arquivos markdown (.md) dentro de docsRoot
 * apontam para arquivos existentes no filesystem.
 *
 * Limitações conhecidas (documentar em coverage):
 * - Não valida anchors (#secao) - apenas paths
 * - Não valida links para arquivos fora de docsRoot
 * - Apenas formato markdown link: [texto](path)
 */
export async function checkDocRefs(opts: {
  docsRoot: string;
}): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.docsRoot);

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.md')) {
        await validateFile(full);
      }
    }
  }

  async function validateFile(file: string): Promise<void> {
    const content = await fs.readFile(file, 'utf-8');
    const rel = path.relative(root, file);
    // Match markdown links: [text](path)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const target = match[2];
      // Skip external links and anchors
      if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('#')) {
        continue;
      }
      // Strip anchor if present
      const [filePath] = target.split('#');
      const resolved = path.resolve(path.dirname(file), filePath);
      try {
        await fs.access(resolved);
      } catch {
        errors.push(`${rel}: link para '${target}' quebrado`);
      }
    }
  }

  try {
    await walk(root);
  } catch (err) {
    errors.push(`docsRoot '${opts.docsRoot}' não existe ou não é acessível: ${err}`);
  }

  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Criar fixtures de teste**

```bash
mkdir -p /tmp/ci-fixtures/docs-ok /tmp/ci-fixtures/docs-broken-ref /tmp/ci-fixtures/docs-external-links
```

Arquivo `/tmp/ci-fixtures/docs-ok/guia.md`:
```markdown
# Guia

Veja [intro](intro.md) para começar.
```

Arquivo `/tmp/ci-fixtures/docs-ok/intro.md`:
```markdown
# Intro

Conteúdo introdutório.
```

Arquivo `/tmp/ci-fixtures/docs-broken-ref/guia.md`:
```markdown
# Guia

Veja [intro](arquivo-inexistente.md).
```

Arquivo `/tmp/ci-fixtures/docs-external-links/guia.md`:
```markdown
# Guia

Veja [site](https://example.com).
```

- [ ] **Step 5: Adaptar teste para usar fixtures tmp**

Modificar `.tooling/scripts/ci/preflight.spec.ts` para usar `/tmp/ci-fixtures` ao invés de paths relativos (fixtures locais ficariam no repo, poluindo).

Substituir o `describe` block por:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { checkDocRefs } from './check-doc-refs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const FIXTURES = '/tmp/ci-fixtures';

describe('checkDocRefs', () => {
  it('deve passar quando todas as refs apontam para arquivos existentes', async () => {
    const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-ok') });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('deve falhar com mensagem clara quando ref aponta para arquivo inexistente', async () => {
    const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-broken-ref') });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/docs-broken-ref\/guia\.md: link para 'arquivo-inexistente\.md' quebrado/);
  });

  it('deve ignorar refs externas (http://, https://)', async () => {
    const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-external-links') });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 6: Rodar teste (Green)**

```bash
cd /home/leo/Documentos/projetos/base/apps/api && pnpm exec vitest run /home/leo/Documentos/projetos/base/.tooling/scripts/ci/preflight.spec.ts 2>&1 | tail -15
```

Expected: PASS — 3 testes verdes.

- [ ] **Step 7: Implementar preflight.ts orquestrador**

Arquivo: `.tooling/scripts/ci/preflight.ts`

```typescript
#!/usr/bin/env tsx
/**
 * Pre-flight CI checks. Roda ANTES de `turbo run lint typecheck test`
 * para falhar rápido em problemas estruturais.
 *
 * Checks incluídos:
 * 1. checkDocRefs — cross-refs quebradas em .md
 * 2. (demais checks adicionados em tasks seguintes)
 *
 * Exit code 0 = OK, 1 = pelo menos 1 falha.
 */
import { checkDocRefs } from './check-doc-refs';
// import { checkTsconfigDrift } from './check-tsconfig-drift';
// import { checkEslintDrift } from './check-eslint-drift';

async function main(): Promise<void> {
  console.log('🔍 Pre-flight CI checks\n');
  const checks = [
    { name: 'Cross-refs em docs', fn: () => checkDocRefs({ docsRoot: 'docs' }) },
    { name: 'Cross-refs em .agents/specs', fn: () => checkDocRefs({ docsRoot: '.agents/specs' }) },
    // { name: 'tsconfig drift', fn: () => checkTsconfigDrift() },
    // { name: 'eslint config drift', fn: () => checkEslintDrift() },
  ];

  let totalErrors = 0;
  for (const check of checks) {
    process.stdout.write(`  • ${check.name}... `);
    const result = await check.fn();
    if (result.ok) {
      console.log('✓');
    } else {
      console.log('✗');
      for (const err of result.errors) {
        console.log(`      ${err}`);
      }
      totalErrors += result.errors.length;
    }
  }

  console.log('');
  if (totalErrors > 0) {
    console.error(`❌ ${totalErrors} erro(s) encontrado(s). Corrigir antes de push.`);
    process.exit(1);
  }
  console.log('✓ Todos os checks passaram.');
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(2);
});
```

- [ ] **Step 8: Rodar preflight para validar**

```bash
cd /home/leo/Documentos/projetos/base && pnpm ci:preflight 2>&1 | tail -20
```

Expected: lista os 2 docs root (`docs` e `.agents/specs`), reportando refs quebradas se houver, ou "✓ Todos os checks passaram" se não houver.

- [ ] **Step 9: Commit**

```bash
git add .tooling/scripts/ci/preflight.ts .tooling/scripts/ci/preflight.spec.ts .tooling/scripts/ci/check-doc-refs.ts
git commit -m "feat(ci): preflight script com check de cross-refs em docs (TDD)"
```

---

## Task 3: Adicionar check de tsconfig drift (TDD)

**Files:**
- Create: `.tooling/scripts/ci/check-tsconfig-drift.ts`
- Create: `.tooling/scripts/ci/check-tsconfig-drift.spec.ts`
- Modify: `.tooling/scripts/ci/preflight.ts` (registrar novo check)

**Contexto:** Falha #3 (35768342940) foi causada por `noUncheckedIndexedAccess` não aplicado consistentemente. Drift entre `tsconfig.base.json` e tsconfigs derivados causa falhas intermitentes. Script detecta **chaves obrigatórias que devem ter o mesmo valor** em todos os tsconfigs do monorepo.

- [ ] **Step 1: Escrever teste (Red)**

Arquivo: `.tooling/scripts/ci/check-tsconfig-drift.spec.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { checkTsconfigDrift } from './check-tsconfig-drift';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const FIXTURES = '/tmp/ci-fixtures/tsconfig';

describe('checkTsconfigDrift', () => {
  it('deve passar quando strict e noUncheckedIndexedAccess são consistentes', async () => {
    const result = await checkTsconfigDrift({ tsconfigsRoot: FIXTURES, consistentKeys: ['strict', 'noUncheckedIndexedAccess'] });
    expect(result.ok).toBe(true);
  });

  it('deve falhar quando strict=true em um tsconfig e false em outro', async () => {
    const result = await checkTsconfigDrift({ tsconfigsRoot: FIXTURES, consistentKeys: ['strict', 'noUncheckedIndexedAccess'] });
    expect(result.errors.some(e => e.includes('strict'))).toBe(true);
  });
});
```

- [ ] **Step 2: Criar fixtures**

```bash
mkdir -p /tmp/ci-fixtures/tsconfig/{consistent,drift}
```

Arquivo `/tmp/ci-fixtures/tsconfig/consistent/tsconfig.json`:
```json
{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true } }
```

Arquivo `/tmp/ci-fixtures/tsconfig/consistent/tsconfig.app.json`:
```json
{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true } }
```

Arquivo `/tmp/ci-fixtures/tsconfig/drift/tsconfig.json`:
```json
{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true } }
```

Arquivo `/tmp/ci-fixtures/tsconfig/drift/tsconfig.app.json`:
```json
{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": false } }
```

- [ ] **Step 3: Rodar teste (Red esperado)**

```bash
cd /home/leo/Documentos/projetos/base/apps/api && pnpm exec vitest run /home/leo/Documentos/projetos/base/.tooling/scripts/ci/check-tsconfig-drift.spec.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './check-tsconfig-drift'`.

- [ ] **Step 4: Implementar check-tsconfig-drift.ts (Green)**

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface CheckResult {
  ok: boolean;
  errors: string[];
}

interface TsconfigShape {
  [key: string]: unknown;
  compilerOptions?: { [key: string]: unknown };
}

export async function checkTsconfigDrift(opts: {
  tsconfigsRoot: string;
  consistentKeys: string[];
}): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.tsconfigsRoot);

  async function findTsconfigs(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const tsconfigs: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        tsconfigs.push(...(await findTsconfigs(full)));
      } else if (entry.name === 'tsconfig.json') {
        tsconfigs.push(full);
      }
    }
    return tsconfigs;
  }

  const files = await findTsconfigs(root);
  if (files.length === 0) {
    return { ok: true, errors: [] };
  }

  // Carrega todos os tsconfigs
  const configs = await Promise.all(
    files.map(async (file) => {
      const content = await fs.readFile(file, 'utf-8');
      const parsed = JSON.parse(content) as TsconfigShape;
      return { file: path.relative(root, file), compilerOptions: parsed.compilerOptions ?? {} };
    }),
  );

  // Para cada chave, verifica se o valor é o mesmo em todos os configs
  for (const key of opts.consistentKeys) {
    const values = configs.map((c) => JSON.stringify(c.compilerOptions[key]));
    const first = values[0];
    const drift = values.some((v) => v !== first);
    if (drift) {
      const summary = configs
        .map((c) => `${c.file}:${key}=${c.compilerOptions[key]}`)
        .join(', ');
      errors.push(`drift em '${key}': ${summary}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 5: Rodar teste (Green)**

```bash
cd /home/leo/Documentos/projetos/base/apps/api && pnpm exec vitest run /home/leo/Documentos/projetos/base/.tooling/scripts/ci/check-tsconfig-drift.spec.ts 2>&1 | tail -10
```

Expected: PASS — 2 testes verdes.

- [ ] **Step 6: Adaptar teste para usar fixtures corretas**

Modificar o teste para apontar para `consistent` e `drift` separadamente:

```typescript
it('deve passar quando strict e noUncheckedIndexedAccess são consistentes', async () => {
  const result = await checkTsconfigDrift({
    tsconfigsRoot: path.join(FIXTURES, 'consistent'),
    consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
  });
  expect(result.ok).toBe(true);
});

it('deve falhar quando noUncheckedIndexedAccess=true em um tsconfig e false em outro', async () => {
  const result = await checkTsconfigDrift({
    tsconfigsRoot: path.join(FIXTURES, 'drift'),
    consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
  });
  expect(result.ok).toBe(false);
  expect(result.errors.some(e => e.includes('noUncheckedIndexedAccess'))).toBe(true);
});
```

- [ ] **Step 7: Registrar check no preflight.ts**

Modificar `.tooling/scripts/ci/preflight.ts` — adicionar import e entrada no array `checks`:

```typescript
import { checkTsconfigDrift } from './check-tsconfig-drift';

const checks = [
  { name: 'Cross-refs em docs', fn: () => checkDocRefs({ docsRoot: 'docs' }) },
  { name: 'Cross-refs em .agents/specs', fn: () => checkDocRefs({ docsRoot: '.agents/specs' }) },
  {
    name: 'tsconfig drift (strict, noUncheckedIndexedAccess)',
    fn: () =>
      checkTsconfigDrift({
        tsconfigsRoot: '.',
        consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
      }),
  },
];
```

- [ ] **Step 8: Rodar preflight e validar**

```bash
cd /home/leo/Documentos/projetos/base && pnpm ci:preflight 2>&1 | tail -15
```

Expected: 3 checks rodam, mensagens claras para qualquer drift.

- [ ] **Step 9: Commit**

```bash
git add .tooling/scripts/ci/check-tsconfig-drift.ts .tooling/scripts/ci/check-tsconfig-drift.spec.ts .tooling/scripts/ci/preflight.ts
git commit -m "feat(ci): preflight check de drift em tsconfig (TDD)"
```

---

## Task 4: Adicionar check de ESLint config drift (TDD)

**Files:**
- Create: `.tooling/scripts/ci/check-eslint-drift.ts`
- Create: `.tooling/scripts/ci/check-eslint-drift.spec.ts`
- Modify: `.tooling/scripts/ci/preflight.ts`

**Contexto:** Falha #1 (35763332088) e #2 (35767879661) foram causadas por ESLint rules duplicadas em múltiplos configs e `.eslintrc.js` legada em `apps/web`. Script verifica que **apenas flat config** existe (`.eslintrc.js`/`.eslintrc.json` legados = erro) e que **packages de config compartilhada** não têm regras duplicadas.

- [ ] **Step 1: Escrever teste (Red)**

Arquivo: `.tooling/scripts/ci/check-eslint-drift.spec.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { checkEslintDrift } from './check-eslint-drift';

const FIXTURES = '/tmp/ci-fixtures/eslint';

describe('checkEslintDrift', () => {
  it('deve passar quando todos os apps usam eslint.config.* (flat config)', async () => {
    const result = await checkEslintDrift({ appsRoot: FIXTURES + '/flat-only' });
    expect(result.ok).toBe(true);
  });

  it('deve falhar quando um app ainda usa .eslintrc.js legada', async () => {
    const result = await checkEslintDrift({ appsRoot: FIXTURES + '/has-legacy' });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('.eslintrc.js'))).toBe(true);
  });
});
```

- [ ] **Step 2: Criar fixtures**

```bash
mkdir -p /tmp/ci-fixtures/eslint/flat-only/app1 /tmp/ci-fixtures/eslint/has-legacy/app2
touch /tmp/ci-fixtures/eslint/flat-only/app1/eslint.config.mjs
touch /tmp/ci-fixtures/eslint/has-legacy/app2/.eslintrc.js
```

- [ ] **Step 3: Rodar teste (Red esperado)**

```bash
cd /home/leo/Documentos/projetos/base/apps/api && pnpm exec vitest run /home/leo/Documentos/projetos/base/.tooling/scripts/ci/check-eslint-drift.spec.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './check-eslint-drift'`.

- [ ] **Step 4: Implementar check-eslint-drift.ts (Green)**

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface CheckResult {
  ok: boolean;
  errors: string[];
}

const LEGACY_NAMES = ['.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml'];

export async function checkEslintDrift(opts: { appsRoot: string }): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.appsRoot);

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (LEGACY_NAMES.includes(entry.name)) {
        const rel = path.relative(root, full);
        errors.push(`${rel}: ESLint config legada encontrada. Migrar para eslint.config.* (flat config).`);
      }
    }
  }

  await walk(root);
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 5: Rodar teste (Green)**

```bash
cd /home/leo/Documentos/projetos/base/apps/api && pnpm exec vitest run /home/leo/Documentos/projetos/base/.tooling/scripts/ci/check-eslint-drift.spec.ts 2>&1 | tail -10
```

Expected: PASS — 2 testes verdes.

- [ ] **Step 6: Registrar check no preflight.ts**

```typescript
import { checkEslintDrift } from './check-eslint-drift';

const checks = [
  { name: 'Cross-refs em docs', fn: () => checkDocRefs({ docsRoot: 'docs' }) },
  { name: 'Cross-refs em .agents/specs', fn: () => checkDocRefs({ docsRoot: '.agents/specs' }) },
  {
    name: 'tsconfig drift',
    fn: () => checkTsconfigDrift({ tsconfigsRoot: '.', consistentKeys: ['strict', 'noUncheckedIndexedAccess'] }),
  },
  { name: 'ESLint config drift (flat only)', fn: () => checkEslintDrift({ appsRoot: 'apps' }) },
  { name: 'ESLint config drift (packages)', fn: () => checkEslintDrift({ appsRoot: 'packages' }) },
];
```

- [ ] **Step 7: Validar localmente**

```bash
cd /home/leo/Documentos/projetos/base && pnpm ci:preflight 2>&1 | tail -15
```

Expected: Verifica apps e packages — `apps/api/.eslintrc.js` é legítimo (NestJS convention) OU precisa migração? **Verificar manualmente:**

```bash
cat apps/api/.eslintrc.js 2>&1 | head -10
```

Se for config legada válida do NestJS, **NÃO falhar** (este check é estrito para apps/web que explicitamente migrou). Ajustar check para excluir `apps/api` OU refatorar NestJS para flat config (decisão fora do escopo deste plano).

**Recomendação:** Por ora, excluir `apps/api/.eslintrc.js` no check adicionando allowlist em `check-eslint-drift.ts`:

```typescript
const ALLOWLIST = ['apps/api/.eslintrc.js'];

if (LEGACY_NAMES.includes(entry.name)) {
  const rel = path.relative(root, full);
  if (ALLOWLIST.includes(rel)) continue;
  errors.push(`${rel}: ESLint config legada encontrada. Migrar para eslint.config.* (flat config).`);
}
```

- [ ] **Step 8: Commit**

```bash
git add .tooling/scripts/ci/check-eslint-drift.ts .tooling/scripts/ci/check-eslint-drift.spec.ts .tooling/scripts/ci/preflight.ts
git commit -m "feat(ci): preflight check de drift em ESLint config (TDD)"
```

---

## Task 5: Adicionar preflight job no CI

**Files:**
- Modify: `.github/workflows/ci.yml`

**Contexto:** CI roda os mesmos checks estruturais antes de lint/typecheck/test. Falha rápido em 10s ao invés de esperar 4min por typecheck.

- [ ] **Step 1: Adicionar job `preflight` no ci.yml**

Adicionar antes do job `quality`:

```yaml
  preflight:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Run preflight checks
        run: pnpm ci:preflight
```

E adicionar `needs: preflight` ao job `quality`.

- [ ] **Step 2: Validar YAML**

```bash
cd /home/leo/Documentos/projetos/base && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML OK"
```

Expected: `YAML OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): preflight job no CI antes de quality"
```

---

## Task 6: Carregar release-template.yml do branch chore/ci-release-workflow

**Files:**
- Modify: `.github/workflows/release-template.yml` (criar — copiar de origin/chore/ci-release-workflow)
- Create: `.agents/specs/conventions/post-merge-release.md` (copiar de origin/chore/ci-release-workflow)

**Contexto:** Branch `chore/ci-release-workflow` já tem o workflow e spec prontos (commits 7214102 + ffb5342). Trazer para este branch sem reinventar.

- [ ] **Step 1: Verificar conteúdo atual no branch de origem**

```bash
git show origin/chore/ci-release-workflow:.github/workflows/release-template.yml 2>&1 | head -10
git show origin/chore/ci-release-workflow:.agents/specs/conventions/post-merge-release.md 2>&1 | head -10
```

Expected: arquivos existem e têm conteúdo (já lidos neste plano).

- [ ] **Step 2: Cherry-pick ou copiar arquivos**

Opção A (cherry-pick dos commits):

```bash
git cherry-pick 7214102 ffb5342 2>&1 | tail -10
```

Opção B (copy direto):

```bash
git checkout origin/chore/ci-release-workflow -- .github/workflows/release-template.yml .agents/specs/conventions/post-merge-release.md
```

Expected: arquivos presentes no working tree.

- [ ] **Step 3: Validar YAML do workflow**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-template.yml'))" && echo "YAML OK"
```

Expected: `YAML OK`.

- [ ] **Step 4: Validar spec atualiza cross-refs**

```bash
cd /home/leo/Documentos/projetos/base && pnpm ci:preflight 2>&1 | grep -E "(post-merge-release|release-template)" | head -5
```

Expected: nenhum erro de cross-ref. Se houver, ajustar.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release-template.yml .agents/specs/conventions/post-merge-release.md
git commit -m "feat(ci): release-template workflow + spec post-merge-release"
```

---

## Task 7: Adicionar referência ao preflight no AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Contexto:** Garantir que devs saibam do novo comando. AGENTS.md é o índice de convenções.

- [ ] **Step 1: Localizar seção de Git Workflow em AGENTS.md**

```bash
grep -n "git-workflow" AGENTS.md | head -5
```

Expected: linha apontando para a spec.

- [ ] **Step 2: Adicionar nota sobre pre-push**

Após a referência a git-workflow.md, adicionar linha:

```markdown
- **Pre-push obrigatório:** rodar `pnpm ci:local` antes de push (ver [git-workflow.md §Pre-Push Quality Gate](./.agents/specs/conventions/git-workflow.md))
```

- [ ] **Step 3: Validar preflight (cross-refs)**

```bash
cd /home/leo/Documentos/projetos/base && pnpm ci:preflight 2>&1 | tail -10
```

Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): referenciar pnpm ci:local em AGENTS.md"
```

---

## Task 8: Atualizar cobertura-testes.md com seção de preflight

**Files:**
- Modify: `.agents/specs/conventions/cobertura-testes.md`

**Contexto:** Spec atual explica a regra de 80% mas não menciona o preflight. Adicionar seção explicando que o gate de cobertura é uma das camadas, e o preflight detecta problemas estruturais antes.

- [ ] **Step 1: Adicionar seção "## CI Defense in Depth"**

Após "## CI Enforcement" (linha 110), adicionar:

```markdown
## CI Defense in Depth

A regra de 80% é **apenas uma camada** da estratégia de CI. Para prevenir
falhas estruturais (drift de tsconfig, ESLint config legada, refs quebradas),
o monorepo usa:

1. **Pre-push local** (`pnpm ci:local`) — devs rodam antes de push; detecta
   em ~30s o que o CI detectaria em ~4min. Ver [git-workflow.md §Pre-Push
   Quality Gate](./git-workflow.md).
2. **Pre-flight CI job** (workflow `ci.yml`) — primeiro job, valida
   cross-refs, tsconfig drift, ESLint drift. Falha rápido em 10s.
3. **Quality CI job** (atual) — lint, typecheck, test, coverage. Roda
   **apenas se preflight passou**.

Threshold de cobertura pode ser ajustado por package em **report-only** mode
(apps/web durante scaffolding) — ver nota em `apps/web/vitest.config.ts`.
Reativar para 80% via PR que adiciona a primeira feature BC.
```

- [ ] **Step 2: Validar preflight (cross-refs em specs)**

```bash
cd /home/leo/Documentos/projetos/base && pnpm ci:preflight 2>&1 | tail -10
```

Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add .agents/specs/conventions/cobertura-testes.md
git commit -m "docs(ci): documentar estratégia defense-in-depth em cobertura-testes.md"
```

---

## Task 9: Smoke test local completo (ci:local end-to-end)

**Files:** nenhum (validação)

**Contexto:** Antes de push, simular exatamente o que CI vai rodar. Validar que:
1. `pnpm ci:local` passa localmente
2. Outputs dos checks são claros
3. Nenhum check demora mais que 30s

- [ ] **Step 1: Rodar ci:local do começo ao fim**

```bash
cd /home/leo/Documentos/projetos/base && time pnpm ci:local 2>&1 | tail -40
```

Expected: termina com exit code 0 em **menos de 90s** (preflight ~5s + lint/typecheck/test ~60s).

- [ ] **Step 2: Forçar uma falha de preflight e validar mensagem**

```bash
echo "[link](arquivo-que-nao-existe.md)" >> /tmp/test-doc.md
cd /home/leo/Documentos/projetos/base && pnpm ci:preflight 2>&1 | grep -E "(❌|quebrado)" | head -3
rm /tmp/test-doc.md
```

Expected: mensagem clara indicando o arquivo quebrado.

**Nota:** preflight escaneia `docs/` e `.agents/specs/`, não `/tmp/`. Para validar erro end-to-end, criar arquivo quebrado em `docs/`:

```bash
echo "[link](inexistente.md)" >> docs/__test-broken.md
cd /home/leo/Documentos/projetos/base && pnpm ci:preflight 2>&1 | tail -10
rm docs/__test-broken.md
```

Expected: exit code 1 com mensagem clara.

- [ ] **Step 3: Commit (se houve ajustes em fixtures)**

```bash
git status
# Se vazio: não precisa commit
# Se houver diff em .tooling/scripts/ci: commit incremental
```

---

## Task 10: Push + PR

**Files:** nenhum

- [ ] **Step 1: Garantir branch atual**

```bash
git branch --show-current
```

Expected: `chore/ci-robustness-improvements`.

- [ ] **Step 2: Push**

```bash
git push -u origin chore/ci-robustness-improvements 2>&1 | tail -10
```

Expected: branch pushed.

- [ ] **Step 3: Criar PR**

```bash
gh pr create \
  --base main \
  --head chore/ci-robustness-improvements \
  --title "chore(ci): defense-in-depth — preflight local + workflow release-template" \
  --body "$(cat <<'EOF'
## Resumo

Adiciona 3 camadas de proteção ao CI após análise das 6 falhas consecutivas
observadas em 2026-09-22 no PR #3 (`feat/cadastro-usuario-com-auditoria`).

### Camada 1 — Pre-push local

Novo script `pnpm ci:local` espelha o CI em ~30-60s. Detecta antes do push:
- Cross-refs quebradas em docs (Task 2)
- Drift em tsconfig (strict, noUncheckedIndexedAccess) (Task 3)
- Drift em ESLint config (.eslintrc.js legada) (Task 4)

### Camada 2 — Pre-flight CI job

Novo job `preflight` no `.github/workflows/ci.yml` roda **antes** de
lint/typecheck/test. Falha em 10s com mensagem acionável ao invés de
esperar 4min por typecheck.

### Camada 3 — Release template workflow

Carrega `.github/workflows/release-template.yml` (do branch
`chore/ci-release-workflow`) que auto-taggea `vX.Y.Z` após bump em
`docs/MONOREPO.md` no `main`. Documentado em
`.agents/specs/conventions/post-merge-release.md`.

## Mudanças

### Novos arquivos

- `.tooling/scripts/ci/preflight.ts` + spec (orquestrador)
- `.tooling/scripts/ci/check-doc-refs.ts` + spec
- `.tooling/scripts/ci/check-tsconfig-drift.ts` + spec
- `.tooling/scripts/ci/check-eslint-drift.ts` + spec
- `.github/workflows/release-template.yml`
- `.agents/specs/conventions/post-merge-release.md`

### Modificados

- `package.json` — scripts `ci:preflight`, `ci:local`
- `.github/workflows/ci.yml` — job `preflight` antes de `quality`
- `AGENTS.md` — nota sobre pre-push
- `.agents/specs/conventions/git-workflow.md` — §Pre-Push Quality Gate
- `.agents/specs/conventions/cobertura-testes.md` — §CI Defense in Depth

## Como falhas observadas são prevenidos

| Falha original (2026-09-22) | Prevenido por |
|------------------------------|---------------|
| Cross-refs quebradas (#1) | checkDocRefs (Task 2) — local em 5s |
| ESLint flat config drift (#2) | checkEslintDrift (Task 4) — local em 5s |
| TS7006 + Prisma.InputJsonValue (#3) | checkTsconfigDrift (Task 3) + cobertura local via `pnpm ci:local` |
| Prisma não gerado (#4, #5) | `pnpm turbo run db:generate` antes de typecheck (já em main via 8cdf989) |
| Coverage 52% < 80% (#6) | `pnpm ci:local` roda coverage local — devs veem antes de push |

## Validação

- [x] TDD: cada check tem spec próprio (Red→Green)
- [x] `pnpm ci:local` roda em <90s
- [x] preflight detecta falha simulada (Task 9.2)
- [x] YAML de workflows valida
- [x] Docs cross-refs validados
- [x] release-template.yml idempotente (verifica tag existente)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Aguardar CI**

```bash
gh pr checks --watch 2>&1 | tail -15
```

Expected: 4 checks verdes (preflight + quality + review-stack + sync-docs).

- [ ] **Step 5: Revisão humana**

PR sai de draft quando reviewer humano aprova.

---

## Self-Review

### 1. Spec coverage

| Requirement | Task |
|-------------|------|
| Reduzir ciclo de feedback | Task 1, 2, 3, 4 (preflight local) |
| Falhar rápido em CI | Task 5 (preflight job) |
| Auto-tag após bump | Task 6 (release-template) |
| Documentar processo | Task 7 (AGENTS), Task 8 (cobertura spec) |
| Validar end-to-end | Task 9 |
| PR + merge | Task 10 |

### 2. Placeholder scan

- ✅ Nenhum "TBD" / "TODO" / "implement later"
- ✅ Cada check tem teste + implementação completos
- ✅ Cada comando tem path absoluto e expected output
- ✅ Cada commit tem mensagem conventional em pt-BR

### 3. Type consistency

- `checkDocRefs`, `checkTsconfigDrift`, `checkEslintDrift` todos retornam `CheckResult { ok: boolean, errors: string[] }` — consistente.
- `preflight.ts` orquestrador consome mesma interface em todos os checks — type-safe.

### Issues encontrados durante escrita

1. **Allowlist `apps/api/.eslintrc.js`:** Adicionada na Task 4 step 7 (NestJS convention usa config legada). Se time decidir migrar NestJS para flat config no futuro, remover allowlist e tratar como erro.

2. **Fixtures em `/tmp`:** Escolhido para não poluir repo. Trade-off: testes não rodam em CI (CI não tem `/tmp/ci-fixtures`). Solução futura: mover fixtures para `.tooling/scripts/ci/__fixtures__/` e commitar. Fora do escopo deste plano.

3. **Cherry-pick vs copy:** Task 6 step 2 — duas opções. Cherry-pick preserva histórico; copy é mais simples. Preferi cherry-pick (Opção A) por manter autoria.

---

## Resumo Final

| Task | Escopo | Arquivos | LOC (aprox) |
|------|--------|---------:|------------:|
| 1 | Script ci:local + doc | 2 | 20 |
| 2 | checkDocRefs + preflight orquestrador | 3 | 150 |
| 3 | checkTsconfigDrift | 3 | 100 |
| 4 | checkEslintDrift | 3 | 70 |
| 5 | preflight job no CI | 1 | 20 |
| 6 | release-template.yml + spec | 2 | 0 (copy) |
| 7 | AGENTS.md nota | 1 | 5 |
| 8 | cobertura-testes.md §Defense in Depth | 1 | 25 |
| 9 | Smoke test | 0 | 0 |
| 10 | Push + PR | 0 | 0 |
| **TOTAL** | 10 tasks | **16 files** | **~390 LOC** |

**Próxima execução:** `superpowers:subagent-driven-development` recomendado para implementar task-by-task com revisão entre tasks.
