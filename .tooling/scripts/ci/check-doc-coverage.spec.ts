import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DOC_DE_BC,
  DOC_DE_ROTAS,
  README_DE_PACKAGE,
  checkDocCoverage,
  listarModulos,
  listarRotas,
} from './check-doc-coverage';

/** Raiz do repo real — usada no caso "o repo real está coberto". */
const REPO_REAL = join(import.meta.dirname, '..', '..', '..');

describe('listarModulos', () => {
  let tmp: string;
  let repo: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'doc-coverage-mod-'));
    repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'apps/api/src/modules'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('lista os bounded contexts, ordenados', async () => {
    for (const bc of ['users', 'auth', 'tenancy']) {
      mkdirSync(join(repo, 'apps/api/src/modules', bc), { recursive: true });
    }
    expect(await listarModulos(repo)).toEqual(['auth', 'tenancy', 'users']);
  });

  it('ignora diretório que não é BC (shared, __tests__) e começa com ponto', async () => {
    for (const d of ['users', 'shared', '__tests__', '.cache']) {
      mkdirSync(join(repo, 'apps/api/src/modules', d), { recursive: true });
    }
    expect(await listarModulos(repo)).toEqual(['users']);
  });

  it('raiz ausente → lista vazia (o gate decide o que fazer com isso)', async () => {
    expect(await listarModulos(join(tmp, 'nao-existe'))).toEqual([]);
  });
});

describe('listarRotas', () => {
  let tmp: string;
  let repo: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'doc-coverage-rotas-'));
    repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'apps/web/app'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('acha page.tsx e route.ts, e devolve path relativo ao repo com "/"', async () => {
    mkdirSync(join(repo, 'apps/web/app/admin/flags'), { recursive: true });
    mkdirSync(join(repo, 'apps/web/app/api/health'), { recursive: true });
    writeFileSync(join(repo, 'apps/web/app/admin/flags/page.tsx'), '');
    writeFileSync(join(repo, 'apps/web/app/api/health/route.ts'), '');
    expect(await listarRotas(repo)).toEqual([
      'apps/web/app/admin/flags/page.tsx',
      'apps/web/app/api/health/route.ts',
    ]);
  });

  it('layout.tsx NÃO é rota', async () => {
    writeFileSync(join(repo, 'apps/web/app/layout.tsx'), '');
    expect(await listarRotas(repo)).toEqual([]);
  });

  it('ignora route group (grupo) e slot paralelo (@slot) — não materializam URL', async () => {
    mkdirSync(join(repo, 'apps/web/app/(marketing)/inicio'), { recursive: true });
    mkdirSync(join(repo, 'apps/web/app/@modal/overlay'), { recursive: true });
    writeFileSync(join(repo, 'apps/web/app/(marketing)/inicio/page.tsx'), '');
    writeFileSync(join(repo, 'apps/web/app/@modal/overlay/page.tsx'), '');
    expect(await listarRotas(repo)).toEqual([]);
  });
});

describe('checkDocCoverage', () => {
  let tmp: string;
  let repo: string;

  function modulos(...nomes: string[]): void {
    for (const n of nomes) {
      mkdirSync(join(repo, 'apps/api/src/modules', n), { recursive: true });
    }
  }

  function docDeBc(bc: string, corpo = '# API\n'): void {
    const rel = DOC_DE_BC(bc);
    mkdirSync(join(repo, rel, '..'), { recursive: true });
    writeFileSync(join(repo, rel), corpo);
  }

  function rota(rel: string): void {
    const full = join(repo, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, '');
  }

  function catalogo(conteudo: string): void {
    const rel = DOC_DE_ROTAS;
    mkdirSync(join(repo, rel, '..'), { recursive: true });
    writeFileSync(join(repo, rel), conteudo);
  }

  function readme(pkg: string): void {
    const rel = README_DE_PACKAGE(pkg);
    mkdirSync(join(repo, rel, '..'), { recursive: true });
    writeFileSync(join(repo, rel), '# pkg\n');
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'doc-coverage-'));
    repo = join(tmp, 'repo');
    mkdirSync(repo, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('cobertura completa → verde', async () => {
    modulos('auth', 'users');
    docDeBc('auth');
    docDeBc('users');
    rota('apps/web/app/login/page.tsx');
    catalogo('| Rota | Arquivo |\n|---|---|\n| /login | `apps/web/app/login/page.tsx` |\n');
    mkdirSync(join(repo, 'packages/shared-types'), { recursive: true });
    readme('shared-types');

    const r = await checkDocCoverage({ repoRoot: repo });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('BC sem doc → VERMELHO, nomeando o BC e o path do doc', async () => {
    modulos('auth', 'tenancy');
    docDeBc('auth');

    const r = await checkDocCoverage({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain("bounded context 'tenancy'");
    expect(r.errors.join('\n')).toContain('docs/api/tenancy.md');
  });

  it('rota ausente do catálogo → VERMELHO, nomeando o arquivo da rota', async () => {
    rota('apps/web/app/login/page.tsx');
    catalogo('| Rota | Arquivo |\n|---|---|\n| /home | `apps/web/app/page.tsx` |\n');

    const r = await checkDocCoverage({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('apps/web/app/login/page.tsx');
  });

  it('catálogo de rotas ausente → VERMELHO, nomeando o catálogo', async () => {
    rota('apps/web/app/login/page.tsx');

    const r = await checkDocCoverage({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain(DOC_DE_ROTAS);
  });

  it('package sem README → VERMELHO, nomeando o package', async () => {
    mkdirSync(join(repo, 'packages/shared-types'), { recursive: true });

    const r = await checkDocCoverage({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('packages/shared-types');
    expect(r.errors.join('\n')).toContain('README.md');
  });

  it('corpus vazio → skipped COM MOTIVO (nunca verde por ausência — classe 5)', async () => {
    const r = await checkDocCoverage({ repoRoot: repo });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('não tem o que comparar');
    expect(r.ok).toBe(true);
  });

  it('o gate é vermelho quando uma unidade de código nova aparece — MUTAÇÃO no repo real', async () => {
    // A árvore sadia exercita só metade do conserto: um gate verde sobre uma
    // árvore que ninguém mudou pode estar verde por acidente. A mutação
    // acontece NO REPO REAL — um módulo novo, sem doc — e não toca nenhum
    // arquivo versionado: o gate lê o sistema de arquivos, não o git.
    const sonda = join(REPO_REAL, 'apps', 'api', 'src', 'modules', 'sonda-do-teste');
    mkdirSync(sonda, { recursive: true });
    try {
      const r = await checkDocCoverage({ repoRoot: REPO_REAL });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('sonda-do-teste');
    } finally {
      rmSync(sonda, { recursive: true, force: true });
    }
  });

  it('o repo real tem cobertura completa → verde', async () => {
    const r = await checkDocCoverage({ repoRoot: REPO_REAL });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
