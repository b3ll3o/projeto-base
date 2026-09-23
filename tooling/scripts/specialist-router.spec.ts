// tooling/scripts/specialist-router.spec.ts
//
// pt-BR: Testes do classificador specialist-router. Espelha
// review-router.spec.ts (vitest, ESM `.js` import suffixes).
// Cobre matchPathGlobs / matchDemandKeywords / matchDemandScopes /
// classify / loadMatrix com a matriz real
// `.agents/specs/conventions/specialist-routing.md` (v1.0).

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  classify,
  matchPathGlobs,
  matchDemandKeywords,
  matchDemandScopes,
  loadMatrix,
  getRepoRoot,
  resolveMatrixPath,
  type Matrix,
} from './specialist-router.js';

// pt-BR: path resolução CWD-independent via __dirname (tooling/scripts/
// → ../../ → project root). Funciona quando vitest roda de project root
// (pnpm tooling:test) ou de tooling/scripts (pnpm test).
const MATRIX_PATH = path.resolve(
  __dirname,
  '../../.agents/specs/conventions/specialist-routing.md',
);

let matrix: Matrix;

beforeAll(async () => {
  matrix = await loadMatrix(MATRIX_PATH);
});

describe('matchPathGlobs', () => {
  it('matches apps/api/** → nestjs-specialist', () => {
    const m = matchPathGlobs(['apps/api/src/foo.ts'], matrix);
    expect(m.specialists.has('nestjs-specialist')).toBe(true);
  });

  it('matches apps/web/** → nextjs-specialist', () => {
    const m = matchPathGlobs(['apps/web/app/page.tsx'], matrix);
    expect(m.specialists.has('nextjs-specialist')).toBe(true);
  });

  it('matches **/Dockerfile* → docker-specialist', () => {
    const m = matchPathGlobs(['apps/api/Dockerfile'], matrix);
    expect(m.specialists.has('docker-specialist')).toBe(true);
  });

  it('matches **/docker-compose*.yml → docker-specialist', () => {
    const m = matchPathGlobs(['docker-compose.dev.yml'], matrix);
    expect(m.specialists.has('docker-specialist')).toBe(true);
  });

  it('matches pnpm-workspace.yaml (blocking) → monorepo-specialist', () => {
    const m = matchPathGlobs(['pnpm-workspace.yaml'], matrix);
    expect(m.specialists.has('monorepo-specialist')).toBe(true);
    expect(m.blocking).toBe(true);
  });

  it('matches turbo.json (blocking) → monorepo-specialist', () => {
    const m = matchPathGlobs(['turbo.json'], matrix);
    expect(m.specialists.has('monorepo-specialist')).toBe(true);
    expect(m.blocking).toBe(true);
  });

  it('matches **/auth/** → security-auditor', () => {
    const m = matchPathGlobs(['apps/api/src/auth/login.ts'], matrix);
    expect(m.specialists.has('security-auditor')).toBe(true);
  });

  it('matches **/*.md → doc-writer', () => {
    const m = matchPathGlobs(['README.md'], matrix);
    expect(m.specialists.has('doc-writer')).toBe(true);
  });

  it('returns empty for path without match', () => {
    const m = matchPathGlobs(['apps/api/src/foo.ts'], {
      path_globs: [{ pattern: 'apps/web/**', specialists: ['nextjs-specialist'] }],
      demand_keywords: [],
      demand_scopes: {},
    });
    expect(m.specialists.size).toBe(0);
    expect(m.blocking).toBe(false);
  });

  it('deduplicates specialists via Set', () => {
    const m = matchPathGlobs(['apps/api/src/auth/login.ts', 'apps/api/Dockerfile'], matrix);
    const arr = Array.from(m.specialists);
    expect(new Set(arr).size).toBe(arr.length);
  });
});

describe('matchDemandKeywords', () => {
  it('matches "dockerizar apps/api" → docker-specialist', () => {
    const r = matchDemandKeywords('dockerizar apps/api e apps/web com compose', matrix);
    expect(r.has('docker-specialist')).toBe(true);
  });

  it('matches "configurar turbo" → monorepo-specialist', () => {
    const r = matchDemandKeywords('configurar turbo pipeline', matrix);
    expect(r.has('monorepo-specialist')).toBe(true);
  });

  it('matches "corrigir JWT" → security-auditor (auth|jwt)', () => {
    const r = matchDemandKeywords('corrigir JWT validation bug', matrix);
    expect(r.has('security-auditor')).toBe(true);
  });

  it('matches "refactor helper" → refactorer', () => {
    // pt-BR: "refatorar" (Português) não está na regex da matriz v1.0 —
    // a regex aceita "refactor" (English), "simplificar", "simplify",
    // "dry", "limpar", "cleanup". O teste usa a keyword em inglês para
    // casar com a regra literal; português pode entrar em v1.1.
    const r = matchDemandKeywords('refactor helper de validação', matrix);
    expect(r.has('refactorer')).toBe(true);
  });

  it('returns empty for text without keywords', () => {
    const r = matchDemandKeywords('lorem ipsum dolor sit amet', matrix);
    expect(r.size).toBe(0);
  });
});

describe('matchDemandScopes', () => {
  it('adds security-auditor in scope=security (always)', () => {
    const r = matchDemandScopes('security', matrix);
    expect(r).toContain('security-auditor');
  });

  it('adds test-writer + doc-writer in scope=feat', () => {
    const r = matchDemandScopes('feat', matrix);
    expect(r).toContain('test-writer');
    expect(r).toContain('doc-writer');
  });

  it('adds test-writer in scope=fix', () => {
    const r = matchDemandScopes('fix', matrix);
    expect(r).toContain('test-writer');
  });

  it('adds docker+monorepo in scope=infra', () => {
    const r = matchDemandScopes('infra', matrix);
    expect(r).toContain('docker-specialist');
    expect(r).toContain('monorepo-specialist');
  });

  it('returns empty for unknown scope', () => {
    const r = matchDemandScopes('unknown-scope', matrix);
    expect(r).toEqual([]);
  });
});

describe('classify', () => {
  it('integra paths + keywords + scopes (Cenário D)', () => {
    // Cenário D — dockerizar monorepo (multi-stack, scope=feat+infra).
    // pt-BR: scope combina feat (test-writer + doc-writer) + infra
    // (docker + monorepo) — comma-separated é suportado por matchDemandScopes.
    const r = classify(
      {
        demand: 'dockerizar apps/api e apps/web com compose',
        paths: [
          'apps/api/Dockerfile',
          'apps/web/Dockerfile',
          'docker-compose.yml',
          'docker-compose.dev.yml',
        ],
        scope: 'feat,infra',
      },
      matrix,
    );
    expect(r.specialists).toContain('monorepo-specialist');
    expect(r.specialists).toContain('docker-specialist');
    expect(r.specialists).toContain('nestjs-specialist');
    expect(r.specialists).toContain('nextjs-specialist');
    expect(r.specialists).toContain('test-writer');
    expect(r.specialists).toContain('doc-writer');
    expect(r.gap_detected).toBe(false);
    expect(r.blocking).toBe(false);
  });

  it('integra paths + keywords + scopes (Cenário E)', () => {
    // Cenário E — correção de segurança (scoped security, fix).
    const r = classify(
      {
        demand: 'auditar vulnerabilidade de SQL injection no módulo users',
        paths: [
          'apps/api/src/modules/users/infra/persistence/user.repository.ts',
          'apps/api/src/modules/users/application/queries/get-user.usecase.ts',
        ],
        scope: 'security,fix',
      },
      matrix,
    );
    expect(r.specialists).toContain('monorepo-specialist');
    expect(r.specialists).toContain('nestjs-specialist');
    expect(r.specialists).toContain('security-auditor');
    expect(r.specialists).toContain('test-writer');
    // Skip rules aplicados
    expect(r.specialists).not.toContain('nextjs-specialist');
    expect(r.specialists).not.toContain('docker-specialist');
    expect(r.specialists).not.toContain('refactorer');
    expect(r.gap_detected).toBe(false);
  });

  it('integra paths + keywords + scopes (Cenário F)', () => {
    // Cenário F — refactor simples (tooling, scope=refactor).
    const r = classify(
      {
        demand: 'simplificar o helper de validação em tooling/scripts',
        paths: ['tooling/scripts/lib/validation.ts'],
        scope: 'refactor',
      },
      matrix,
    );
    expect(r.specialists).toContain('monorepo-specialist');
    expect(r.specialists).toContain('refactorer');
    // Skip rules aplicados — demanda puramente tooling sem sinais
    // de outros domínios não deve despachar outros specialists.
    expect(r.specialists).not.toContain('nestjs-specialist');
    expect(r.specialists).not.toContain('nextjs-specialist');
    expect(r.specialists).not.toContain('docker-specialist');
    expect(r.specialists).not.toContain('security-auditor');
    expect(r.specialists).not.toContain('test-writer');
    expect(r.specialists).not.toContain('doc-writer');
    expect(r.gap_detected).toBe(false);
  });

  it('detecta gap quando nenhum specialist casa', () => {
    const r = classify(
      {
        demand: 'foo bar',
        paths: [],
        scope: 'unknown',
      },
      {
        path_globs: [],
        demand_keywords: [],
        demand_scopes: {},
        skip_rules: {},
        always_on: [],
      },
    );
    expect(r.gap_detected).toBe(true);
    expect(r.specialists).toEqual([]);
  });

  it('marca blocking=true se algum path_glob tem blocking', () => {
    const r = classify(
      {
        demand: 'revisar workspace config',
        paths: ['pnpm-workspace.yaml'],
        scope: '',
      },
      matrix,
    );
    expect(r.blocking).toBe(true);
    expect(r.specialists).toContain('monorepo-specialist');
  });

  it('respeita skip_rules (nestjs-specialist skipped se paths só frontend)', () => {
    // paths todos em apps/web/** + scope=feat (adiciona test-writer + doc-writer
    // mas NÃO nestjs-specialist) + sem keyword nestjs → skip rule dispara.
    const r = classify(
      {
        demand: 'adicionar página inicial ao site',
        paths: ['apps/web/app/page.tsx'],
        scope: 'feat',
      },
      matrix,
    );
    expect(r.specialists).not.toContain('nestjs-specialist');
    expect(r.specialists).toContain('nextjs-specialist');
  });

  it('dispatcha docker-specialist para "dockerizar apps/api" (compound PT)', () => {
    // pt-BR: regressão do bug I1 — o skip_rule usava `\b(docker|...)\b`
    // que falhava em "dockerizar" (o `i` pós-"docker" é word char).
    // Sem scope=infra e sem Dockerfile nos paths, o skip_rule agora
    // usa substring `(docker|container|compose)` → regex matches →
    // skip NÃO dispara → docker-specialist dispatchado.
    const r = classify(
      {
        demand: 'dockerizar apps/api',
        paths: ['apps/api/**'],
        scope: 'feat',
      },
      matrix,
    );
    expect(r.specialists).toContain('docker-specialist');
  });

  it('dispatcha docker-specialist para "containerização" (compound PT)', () => {
    // pt-BR: segunda regressão do mesmo bug — "containerização" começa
    // com "container" + "i" (word char); sem o substring-match o
    // skip_rule descartaria docker-specialist indevidamente.
    const r = classify(
      {
        demand: 'containerização do postgres',
        paths: [],
        scope: 'infra',
      },
      matrix,
    );
    expect(r.specialists).toContain('docker-specialist');
  });
});

describe('loadMatrix', () => {
  it('parseia specialist-routing.md com 4 seções YAML (path_globs, demand_keywords, demand_scopes, skip_rules) + always_on', () => {
    expect(matrix.path_globs).toBeDefined();
    expect(matrix.path_globs.length).toBeGreaterThan(0);
    expect(matrix.demand_keywords).toBeDefined();
    expect(matrix.demand_keywords.length).toBeGreaterThan(0);
    expect(matrix.demand_scopes).toBeDefined();
    expect(Object.keys(matrix.demand_scopes).length).toBeGreaterThan(0);
    expect(matrix.skip_rules).toBeDefined();
    expect(matrix.always_on).toBeDefined();
    expect(matrix.always_on).toContain('monorepo-specialist');
  });
});

describe('getRepoRoot', () => {
  it('retorna path absoluto da raiz do repo quando invocado do repo (cwd padrão)', () => {
    const root = getRepoRoot();
    expect(root).toBeTruthy();
    expect(path.isAbsolute(root!)).toBe(true);
    // A raiz do repo deve conter o arquivo da matriz v1.0 (sanity check
    // de que o git rev-parse resolveu para o repo correto, não um pai
    // acima ou algum trabalho de diretório aleatório).
    expect(fs.existsSync(path.join(root!, '.agents/specs/conventions/specialist-routing.md'))).toBe(
      true,
    );
  });

  it('retorna null quando cwd não está em um repositório git', () => {
    // Cria temp dir vazio (não-git-repo) e tenta resolver dali. Evita
    // fragilidade de assumir que /tmp não é repo em algum CI exótico.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-no-repo-'));
    try {
      expect(getRepoRoot(tmpDir)).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('resolveMatrixPath', () => {
  it('resolve default matrix path a partir do repo root quando --matrix é omitido', () => {
    const resolved = resolveMatrixPath(undefined);
    const root = getRepoRoot();
    expect(resolved).toBe(path.join(root!, '.agents/specs/conventions/specialist-routing.md'));
  });

  it('preserva paths absolutos sem modificação', () => {
    const abs = path.resolve('/absolute/path/to/matrix.md');
    expect(resolveMatrixPath(abs)).toBe(abs);
  });

  it('resolve paths relativos a partir do repo root (não do cwd)', () => {
    const resolved = resolveMatrixPath('custom/relative/matrix.md');
    const root = getRepoRoot();
    expect(resolved).toBe(path.join(root!, 'custom/relative/matrix.md'));
    expect(path.isAbsolute(resolved)).toBe(true);
  });
});
