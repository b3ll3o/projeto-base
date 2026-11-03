import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DOC_DE_BC,
  DOC_DE_ROTAS,
  README_DE_PACKAGE,
  checkDocCoverage,
  declaracoesDeExcecao,
  listarModulos,
  listarRotas,
} from './check-doc-coverage';
import { linhasDoRelato } from './check-types';

/** Raiz do repo real — usada no caso "o repo real está coberto". */
const REPO_REAL = join(import.meta.dirname, '..', '..', '..');

/**
 * `tsx` e o script, derivados do PRÓPRIO spec — nunca de `process.cwd()`.
 *
 * O teste de CLI abaixo executa o gate com `cwd` no repo de mentira; se
 * qualquer um dos dois viesse do `process.cwd()`, o teste mediria o repo de
 * verdade e passaria pelo motivo errado.
 */
const TSX = join(REPO_REAL, 'node_modules/.bin/tsx');
const SCRIPT = join(REPO_REAL, '.tooling/scripts/ci/check-doc-coverage.ts');

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

  it('desce em route group (grupo): a página DENTRO do grupo É rota', async () => {
    // O grupo não materializa segmento na URL (`app/(marketing)/inicio/page.tsx`
    // serve `/inicio`), mas a página dentro dele é uma rota normal. MEDIDO
    // 2026-10-29 no `normalizeAppPath` do Next.js: `isGroupSegment(segment)`
    // → o segmento é ignorado na URL, e o resto do path é o endereço.
    //
    // O path MEDIDO é o relativo ao ARQUIVO — e ele carrega o grupo, porque
    // é assim que o arquivo se chama no disco. Ver a decisão no cabeçalho
    // de `check-doc-coverage.ts`.
    mkdirSync(join(repo, 'apps/web/app/(marketing)/inicio'), { recursive: true });
    writeFileSync(join(repo, 'apps/web/app/(marketing)/inicio/page.tsx'), '');
    expect(await listarRotas(repo)).toEqual(['apps/web/app/(marketing)/inicio/page.tsx']);
  });

  it('ignora slot paralelo (@slot) — a página dentro é rota paralela, não endereço', async () => {
    // O slot é uma ROTA PARALAELA: a página dentro é renderizada dentro do
    // layout pai, no MESMO segmento de URL. Ela não é um endereço próprio,
    // então não é uma rota do catálogo.
    mkdirSync(join(repo, 'apps/web/app/@modal/overlay'), { recursive: true });
    writeFileSync(join(repo, 'apps/web/app/@modal/overlay/page.tsx'), '');
    expect(await listarRotas(repo)).toEqual([]);
  });

  it('desce em (grupo) e para em @slot — os dois casos são DIFERENTES', async () => {
    // Este caso é a razão de o anterior existir: `(grupo)` e `@slot` começam
    // com um caractere especial e os DOIS são ignorados na URL, mas só um
    // deles esconde uma rota. Um `it()` que juntasse os dois e dissesse
    // `[]` fixaria a premissa errada como regressão.
    mkdirSync(join(repo, 'apps/web/app/(marketing)/inicio'), { recursive: true });
    mkdirSync(join(repo, 'apps/web/app/@modal/overlay'), { recursive: true });
    writeFileSync(join(repo, 'apps/web/app/(marketing)/inicio/page.tsx'), '');
    writeFileSync(join(repo, 'apps/web/app/@modal/overlay/page.tsx'), '');
    expect(await listarRotas(repo)).toEqual(['apps/web/app/(marketing)/inicio/page.tsx']);
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

  /**
   * A convenção é a **única** fonte das exceções, então o repo de mentira
   * precisa dela — sem ela o gate responde "não foi possível ler" e nenhum
   * caso de cobertura é medido.
   */
  function convencao(tabela = ''): void {
    const rel = join(repo, '.agents/specs/conventions/documentacao.md');
    mkdirSync(join(rel, '..'), { recursive: true });
    writeFileSync(
      rel,
      [
        '## §5. O gate — `check-doc-coverage`',
        '',
        '### Exceções declaradas (nunca inferidas)',
        '',
        '| Unidade | Motivo |',
        '|---|---|',
        tabela,
        '',
      ].join('\n'),
    );
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'doc-coverage-'));
    repo = join(tmp, 'repo');
    mkdirSync(repo, { recursive: true });
    convencao();
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
    // A string que **só** este ramo produz: o outro ramo ("a rota X não
    // aparece em Y") também cita `docs/web/rotas.md`, e uma asserção
    // satisfeita pelo motivo errado é a classe 2 (MEDIDO 2026-11-02: com o
    // ramo neutralizado, 22 de 22 seguiam verdes).
    expect(r.errors.join('\n')).toContain('catálogo de rotas');
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

  it('o gate é vermelho quando uma ROTA DENTRO de route group aparece sem citação — MUTAÇÃO no repo real', async () => {
    // O dente do achado que corrigiu o gate: uma rota dentro de `(grupo)`
    // precisa ser citada no catálogo. Plantada no repo real, sem tocar
    // arquivo versionado.
    const sonda = join(REPO_REAL, 'apps', 'web', 'app', '(grupo-da-sonda)', 'inicio');
    mkdirSync(sonda, { recursive: true });
    writeFileSync(join(sonda, 'page.tsx'), '');
    try {
      const r = await checkDocCoverage({ repoRoot: REPO_REAL });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('(grupo-da-sonda)');
    } finally {
      rmSync(join(REPO_REAL, 'apps', 'web', 'app', '(grupo-da-sonda)'), {
        recursive: true,
        force: true,
      });
    }
  });

  it('uma exceção DECLARADA na convenção isenta a unidade', async () => {
    // A regra que a convenção prescreve e que o gate implementa: exceção é
    // linha escrita, com motivo. O caminho da unidade é o mesmo que a
    // matriz §3 nomeia.
    modulos('sem-doc');
    const r = await checkDocCoverage({
      repoRoot: repo,
      excecoes: new Map([['apps/api/src/modules/sem-doc', 'unitário, sem superfície HTTP']]),
    });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('a exceção DECLARADA na CONVENÇÃO isenta a unidade — a wiring, não o override', async () => {
    // Os 2 casos acima passam `opts.excecoes` **explicitamente** — o
    // override **contorna** a leitura da convenção. Sem este caso, o gate
    // podia IGNORAR a tabela do `documentacao.md` e os 22 specs seguiam
    // verdes (MEDIDO 2026-11-02: neutralizar a leitura → 0 de 22 caem).
    modulos('sem-doc');
    convencao('| `apps/api/src/modules/sem-doc` | unitário, sem superfície HTTP |');
    const r = await checkDocCoverage({ repoRoot: repo });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('uma exceção DECLARADA que não se aplica é documentation lie', async () => {
    // O sentido inverso: a exceção que não exclui nada. Sem esta checagem, a
    // tabela vira um arquivo de desculpas e a dívida que ela escondesse
    // deixa de ser visível. Mesmo padrão de `check-test-set-covered.ts`.
    modulos('com-doc');
    docDeBc('com-doc');
    const r = await checkDocCoverage({
      repoRoot: repo,
      excecoes: new Map([['apps/api/src/modules/com-doc', 'aunitada']]),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('exceção declarada que não se aplica');
  });

  it('a tabela de exceções é lida da convenção, por NOME de coluna', () => {
    // Coluna por NOME, nunca por índice: `split('|')[1]` funciona até
    // alguém reordenar, e aí falha cobrindo exatamente a forma que existe
    // hoje — a classe 2 com outro nome.
    const markdown = [
      '## §5. O gate — `check-doc-coverage`',
      '',
      '### Exceções declaradas (nunca inferidas)',
      '',
      '| Motivo | Unidade |',
      '|---|---|',
      '| unitário, sem superfície HTTP | `apps/api/src/modules/sem-doc` |',
    ].join('\n');
    const declaradas = declaracoesDeExcecao(markdown);
    expect(declaradas.get('apps/api/src/modules/sem-doc')).toBe('unitário, sem superfície HTTP');
  });

  it('a linha de exemplo "(nenhuma)" da convenção NÃO é uma exceção', () => {
    // A tabela da convenção tem uma linha de exemplo. Se ela fosse lida como
    // unidade, o gate acusaria uma exceção que não exclui nada — e o
    // documento estaria mentindo sobre o próprio estado.
    const markdown = [
      '### Exceções declaradas (nunca inferidas)',
      '',
      '| Unidade | Motivo |',
      '|---|---|',
      '| (nenhuma — a matriz §3 é fechada) | — |',
    ].join('\n');
    expect(declaracoesDeExcecao(markdown).size).toBe(0);
  });

  it('o repo real tem cobertura completa → verde', async () => {
    const r = await checkDocCoverage({ repoRoot: REPO_REAL });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('rodado como CLI, mede e sai com exit 1 — MEDIDO 2026-10-29', async () => {
    // O gate em modo CLI: sem o bloco IIFE, `pnpm exec tsx
    // .tooling/scripts/ci/check-doc-coverage.ts` devolvia `exit 0` e NENHUMA
    // saída, mesmo com uma rota plantada. Um gate que não mede quando
    // invocado direto é a classe 6 do `guard-classes.md` — "ferramenta
    // reporta sucesso corrompendo".
    //
    // Este teste executa o BINÁRIO de verdade contra um repo de verdade:
    // o defeito é justamente o caminho de execução, e testar a função não
    // diria nada sobre ele (mesmo padrão de `check-branch-up-to-date.spec.ts`).
    const repo = mkdtempSync(join(tmpdir(), 'doc-coverage-cli-'));
    try {
      // A convenção é a única fonte das exceções — sem ela o gate responde
      // "não foi possível ler" e sai antes de medir cobertura.
      const convRel = join(repo, '.agents/specs/conventions/documentacao.md');
      mkdirSync(join(convRel, '..'), { recursive: true });
      writeFileSync(
        convRel,
        '### Exceções declaradas (nunca inferidas)\n\n| Unidade | Motivo |\n|---|---|\n',
      );
      mkdirSync(join(repo, 'apps/api/src/modules/so-sem-doc'), { recursive: true });
      mkdirSync(join(repo, 'apps/web/app/(grupo)/inicio'), { recursive: true });
      writeFileSync(join(repo, 'apps/web/app/(grupo)/inicio/page.tsx'), '');

      // Precondição — sem isso o teste passa vacuamente: se o CLI não
      // imprimisse nada, a igualdade abaixo continuaria valendo.
      const esperado = await checkDocCoverage({ repoRoot: repo });
      expect(esperado.ok).toBe(false);
      expect(esperado.errors.join('\n')).toContain('so-sem-doc');

      let stderr = '';
      let status: number | null = null;
      try {
        execFileSync(TSX, [SCRIPT], {
          cwd: repo,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        stderr = (err as { stderr?: string }).stderr ?? '';
        status = (err as { status?: number | null }).status ?? null;
      }

      expect(stderr).toContain('so-sem-doc');
      // Paridade estrita: a saída do CLI é exatamente o relato. Qualquer
      // categoria que um caminho imprima e o outro não quebra aqui.
      expect(stderr.trimEnd()).toBe(linhasDoRelato(esperado).join('\n'));
      expect(status).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
