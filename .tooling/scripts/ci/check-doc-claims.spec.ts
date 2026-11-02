import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  REGISTRY,
  checkDocClaims,
  claimsDivergentes,
  derivar,
  lerRegistry,
  tyingQuebrado,
  valorCitado,
  type Claim,
} from './check-doc-claims';
import { linhasDoRelato } from './check-types';

/** Raiz do repo real — usada no caso "o repo real está coerente". */
const REPO_REAL = join(import.meta.dirname, '..', '..', '..');

/** O binário e o script — para o caso de CLI (o mesmo padrão do `check-doc-coverage`). */
const TSX = join(REPO_REAL, 'node_modules/.bin/tsx');
const SCRIPT = join(REPO_REAL, '.tooling/scripts/ci/check-doc-claims.ts');

describe('valorCitado', () => {
  it('lê o valor ao lado do comando citado', () => {
    const doc = '> `grep x | wc -l`\n> → `7`. O resto.';
    expect(valorCitado(doc, 'grep x | wc -l')).toBe(7);
  });

  it('devolve null quando o doc NÃO cita o comando', () => {
    expect(valorCitado('> nada aqui', 'grep x')).toBeNull();
  });

  it('devolve null quando o doc cita o comando mas não afirma valor', () => {
    // Não é "sem claim" — é um registry que declara um valor que o doc não
    // diz. O gate tem de distinguir os dois.
    expect(valorCitado('> `grep x | wc -l` e nada mais', 'grep x | wc -l')).toBeNull();
  });
});

describe('derivar', () => {
  it('contar-paths-openapi bate com o contrato versionado', async () => {
    const n = await derivar(REPO_REAL, { tipo: 'contar-paths-openapi' });
    const spec = JSON.parse(readFileSync(join(REPO_REAL, 'apps/api/openapi.json'), 'utf-8')) as {
      paths: Record<string, unknown>;
    };
    expect(n).toBe(Object.keys(spec.paths).length);
  });

  it('contar-operacoes-openapi bate com o contrato versionado', async () => {
    const n = await derivar(REPO_REAL, { tipo: 'contar-operacoes-openapi' });
    const spec = JSON.parse(readFileSync(join(REPO_REAL, 'apps/api/openapi.json'), 'utf-8')) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const esperado = Object.values(spec.paths).reduce(
      (acc, p) =>
        acc +
        Object.keys(p).filter((k) => ['get', 'post', 'put', 'patch', 'delete'].includes(k)).length,
      0,
    );
    expect(n).toBe(esperado);
  });

  it('contar-decoradores-http conta OCORRÊNCIAS, não linhas', async () => {
    // Um arquivo com 2 decorators na MESMA linha: `grep -cE` diria 1,
    // `grep -hoE | wc -l` diria 2. A derivação conta ocorrências — é a
    // forma que o registry declara.
    const tmp = mkdtempSync(join(tmpdir(), 'doc-claims-deriva-'));
    try {
      const arquivo = join(tmp, 'c.ts');
      writeFileSync(arquivo, '@Get()\n@Get() @Post()\n');
      const n = await derivar(tmp, { tipo: 'contar-decoradores-http', caminhos: ['c.ts'] });
      expect(n).toBe(3);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('contar-decoradores-http resolve o glob do caminho — o `*.spec.ts` NÃO conta', async () => {
    // A derivação tem que medir o MESMO conjunto que o comando citado. O
    // comando dos 3 BCs com vários controllers usa o glob `*.controller.ts`;
    // uma derivação que lê TODO `.ts` do diretório conta também os specs — e
    // acusa um doc que continua correto.
    const tmp = mkdtempSync(join(tmpdir(), 'doc-claims-glob-'));
    try {
      mkdirSync(join(tmp, 'http'), { recursive: true });
      writeFileSync(join(tmp, 'http', 'a.controller.ts'), '@Get()\n');
      writeFileSync(join(tmp, 'http', 'a.controller.spec.ts'), '@Get()\n');
      const n = await derivar(tmp, {
        tipo: 'contar-decoradores-http',
        caminhos: ['http/*.controller.ts'],
      });
      expect(n).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('tyingQuebrado', () => {
  it('o comando que o doc cita tem que CONTER o caminho que a derivação mede', () => {
    // O tying é o que impede a RECINCIDÊNCIA: um registry que cita um caminho
    // e mede outro é vermelho, nomeando os dois — em vez de medir em silêncio
    // um objeto diferente do que o doc afirma.
    const claim: Claim = {
      doc: 'docs/x.md',
      comando: 'grep -hoE "@Get\\(" apps/api/src/modules/users/http/users.controller.ts | wc -l',
      derivacao: { tipo: 'contar-decoradores-http', caminhos: ['apps/api/src/modules/users/http'] },
      motivo: 'teste',
    };
    expect(tyingQuebrado(claim)).not.toBeNull();

    const amarrado: Claim = {
      ...claim,
      derivacao: {
        tipo: 'contar-decoradores-http',
        caminhos: ['apps/api/src/modules/users/http/users.controller.ts'],
      },
    };
    expect(tyingQuebrado(amarrado)).toBeNull();
  });

  it('um caminho com BARRA FINAL também é desamarrado', () => {
    // MEDIDO 2026-11-02: `…/http/` passava pelo tying (o `path.join` do
    // resolver normaliza a barra, e o tying comparava a barra) e a derivação
    // lia o **diretório inteiro** — o defeito G-101 de volta, em silêncio. O
    // tying compara o caminho NORMALIZADO, então a barra final não escapa.
    const claim: Claim = {
      doc: 'docs/x.md',
      comando: 'grep -hoE "@Get\\(" apps/api/src/modules/users/http/*.controller.ts | wc -l',
      derivacao: {
        tipo: 'contar-decoradores-http',
        caminhos: ['apps/api/src/modules/users/http/'],
      },
      motivo: 'teste',
    };
    expect(tyingQuebrado(claim)).not.toBeNull();
  });

  it('a derivação do openapi mede o contrato versionado — e o tying vale para ele', () => {
    const claim: Claim = {
      doc: 'docs/x.md',
      comando: 'node -e "const d=require(\'./apps/api/openapi.json\');console.log(1)"',
      derivacao: { tipo: 'contar-paths-openapi' },
      motivo: 'teste',
    };
    expect(tyingQuebrado(claim)).toBeNull();
  });
});

describe('claimsDivergentes', () => {
  let tmp: string;
  let repo: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'doc-claims-'));
    repo = join(tmp, 'repo');
    mkdirSync(repo, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('um doc que afirma o valor errado → divergente', async () => {
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'x.md'), '> `grep inexistente.ts | wc -l`\n> → `9`.\n');
    const divergentes = await claimsDivergentes(repo, [
      {
        doc: 'docs/x.md',
        comando: 'grep inexistente.ts | wc -l',
        derivacao: { tipo: 'contar-decoradores-http', caminhos: ['inexistente.ts'] },
        motivo: 'teste',
      },
    ]);
    expect(divergentes.length).toBe(1);
    expect(divergentes[0]?.valorCitado).toBe(9);
  });

  it('um doc que NÃO cita o comando → divergente (não "sem claim")', async () => {
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'x.md'), '> nada.\n');
    const divergentes = await claimsDivergentes(repo, [
      {
        doc: 'docs/x.md',
        comando: 'grep inexistente.ts | wc -l',
        derivacao: { tipo: 'contar-decoradores-http', caminhos: ['inexistente.ts'] },
        motivo: 'teste',
      },
    ]);
    expect(divergentes.length).toBe(1);
  });

  it('um registry DESAMARRADO (comando que não contém o caminho medido) → divergente', async () => {
    // O tying: o comando citado tem que conter o caminho que a derivação
    // mede. Sem ele, o registry pode medir um objeto diferente do que o doc
    // afirma — em silêncio.
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'x.md'), '> `grep inexistente.ts | wc -l`\n> → `9`.\n');
    const divergentes = await claimsDivergentes(repo, [
      {
        doc: 'docs/x.md',
        comando: 'grep inexistente.ts | wc -l',
        derivacao: { tipo: 'contar-decoradores-http', caminhos: ['outro/lugar.ts'] },
        motivo: 'teste',
      },
    ]);
    expect(divergentes.length).toBe(1);
    expect(divergentes[0]?.motivo).toBe('registry-desamarrado');
  });
});

describe('checkDocClaims', () => {
  let tmp: string;
  let repo: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'doc-claims-cli-'));
    repo = join(tmp, 'repo');
    mkdirSync(repo, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('registry ausente → erro, nunca verde', async () => {
    const r = await checkDocClaims({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('teatro');
  });

  it('registry vazio → skipped COM MOTIVO (nunca verde por ausência — classe 5)', async () => {
    mkdirSync(join(repo, '.tooling/scripts/ci'), { recursive: true });
    writeFileSync(join(repo, REGISTRY), JSON.stringify({ claims: [] }));
    const r = await checkDocClaims({ repoRoot: repo });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('não tem o que comparar');
    expect(r.ok).toBe(true);
  });

  it('o repo real tem os claims coerentes → verde', async () => {
    const r = await checkDocClaims({ repoRoot: REPO_REAL });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('o gate é vermelho quando um doc mente — MUTAÇÃO no repo real', async () => {
    // O dente: uma árvore sadia exercita só metade do conserto. A mutação
    // acontece NO REPO REAL — o número **ao lado do comando citado** trocado
    // — e o arquivo é restaurado no `finally`.
    //
    // ⚠️ A mutação tem de ser no valor que o gate LÊ (o `→ \`N\`` depois
    // do comando), e não na prosa ("os 7 endpoints deste BC"): o gate mede
    // o par comando → valor, e trocar a prosa sem o valor seria um doc que
    // mente **em outro lugar** — o que é um gate diferente.
    const doc = join(REPO_REAL, 'docs', 'api', 'users.md');
    const original = readFileSync(doc, 'utf-8');
    try {
      const trocado = original.replace(
        'apps/api/src/modules/users/infrastructure/http/users.controller.ts | wc -l`\n> → `7`',
        'apps/api/src/modules/users/infrastructure/http/users.controller.ts | wc -l`\n> → `8`',
      );
      expect(trocado).not.toBe(original);
      writeFileSync(doc, trocado);
      const r = await checkDocClaims({ repoRoot: REPO_REAL });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('claim divergente');
      expect(r.errors.join('\n')).toContain('users.md');
    } finally {
      writeFileSync(doc, original);
    }
  });

  it('o gate é vermelho quando o código muda e o doc não', async () => {
    // A outra direção: o código produz um número novo e o doc fica velho.
    // Mutação no controller — um endpoint a mais — sem tocar em nenhum
    // arquivo versionado além do próprio (restaurado no `finally`).
    const controller = join(
      REPO_REAL,
      'apps/api/src/modules/users/infrastructure/http/users.controller.ts',
    );
    const original = readFileSync(controller, 'utf-8');
    try {
      writeFileSync(
        controller,
        `${original}\n  @Get('/sonda-do-teste')()\n  findOne() { return undefined; }\n`,
      );
      const r = await checkDocClaims({ repoRoot: REPO_REAL });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('users.md');
    } finally {
      writeFileSync(controller, original);
    }
  });

  it('o gate NÃO acusa o doc quando um `*.spec.ts` novo tem decorator HTTP — MUTAÇÃO no repo real', async () => {
    // A regressão que a revisão do PR mediu (2026-11-02): a derivação lia
    // TODOS os `.ts` do diretório de controllers, inclusive os `*.spec.ts`,
    // enquanto o comando que o doc cita usa o glob `*.controller.ts`. Com um
    // spec novo no diretório, o gate acusava `docs/api/tenancy.md` de "afirmar
    // 5 e o código produzir 6" — sendo que o comando do doc ainda dava 5.
    //
    // O doc estava CORRETO e o gate mandava corrigir o doc.
    const planta = join(
      REPO_REAL,
      'apps/api/src/modules/tenancy/infrastructure/http/PLANT-sonda.controller.spec.ts',
    );
    try {
      writeFileSync(planta, 'export class P { @Get() r() { return 1; } }\n');
      const r = await checkDocClaims({ repoRoot: REPO_REAL });
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
    } finally {
      rmSync(planta, { force: true });
    }
  });

  it('um doc que MENTE com prosa no meio é VERMELHO — o valor tem de ser adjacente', async () => {
    // MEDIDO 2026-11-02: a janela de 200 caracteres do valorCITado sangrava
    // para o claim vizinho. Um doc que afirmava `7` (com o código produzindo
    // `1`) passava **verde**, porque o gate lia o `→ \`1\`` de uma frase de
    // prosa no meio. Isso é o INVERSO do que o gate existe para.
    const doc = join(REPO_REAL, 'docs', 'api', 'health.md');
    const original = readFileSync(doc, 'utf-8');
    try {
      const trocado = original.replace(
        'health.controller.ts | wc -l`\n> → `1`',
        'health.controller.ts | wc -l`\n> (o healthcheck responde 200 → `1`)\n> → `7`',
      );
      expect(trocado).not.toBe(original);
      writeFileSync(doc, trocado);
      const r = await checkDocClaims({ repoRoot: REPO_REAL });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('health.md');
    } finally {
      writeFileSync(doc, original);
    }
  });

  it('rodado como CLI, mede e sai com exit 1 — MEDIDO 2026-11-02', async () => {
    // O gate em modo CLI: sem o bloco IIFE, `pnpm exec tsx
    // .tooling/scripts/ci/check-doc-claims.ts` devolvia `exit 0` e NENHUMA
    // saída. Um gate que não mede quando invocado direto é a classe 6 do
    // `guard-classes.md` — "ferramenta reporta sucesso corrompendo".
    //
    // Este teste executa o BINÁRIO de verdade contra um repo de verdade:
    // o defeito é justamente o caminho de execução, e testar a função não
    // diria nada sobre ele (mesmo padrão de `check-doc-coverage.spec.ts`).
    const repo = mkdtempSync(join(tmpdir(), 'doc-claims-cli-'));
    try {
      mkdirSync(join(repo, '.tooling/scripts/ci'), { recursive: true });
      writeFileSync(
        join(repo, REGISTRY),
        JSON.stringify({
          claims: [
            {
              doc: 'docs/x.md',
              comando: 'grep x | wc -l',
              derivacao: { tipo: 'contar-decoradores-http', caminhos: ['c.ts'] },
              motivo: 'teste',
            },
          ],
        }),
      );
      mkdirSync(join(repo, 'docs'), { recursive: true });
      writeFileSync(join(repo, 'docs', 'x.md'), '> `grep x | wc -l`\n> → `9`.\n');
      writeFileSync(join(repo, 'c.ts'), '@Get()\n');

      // Precondição — sem isso o teste passa vacuamente: se o CLI não
      // imprimisse nada, a igualdade abaixo continuaria valendo.
      const esperado = await checkDocClaims({ repoRoot: repo });
      expect(esperado.ok).toBe(false);
      expect(esperado.errors.join('\n')).toContain('x.md');

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

      expect(stderr).toContain('x.md');
      // Paridade estrita: a saída do CLI é exatamente o relato. Qualquer
      // categoria que um caminho imprima e o outro não quebra aqui.
      expect(stderr.trimEnd()).toBe(linhasDoRelato(esperado).join('\n'));
      expect(status).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('lerRegistry', () => {
  it('lê as claims do registry do repo real', async () => {
    const claims = await lerRegistry(REPO_REAL);
    expect(claims.length).toBeGreaterThan(0);
    for (const c of claims) {
      expect(typeof c.doc).toBe('string');
      expect(typeof c.comando).toBe('string');
      expect(c.motivo.length).toBeGreaterThan(0);
    }
  });

  it('a entrada NÃO declara `valor` — o número tem duas cópias, e uma delas é morta', async () => {
    // MEDIDO 2026-11-02: o registry tinha um campo `valor`, e trocar o `valor`
    // de uma entrada de 7 para 99 deixava o gate **verde** — o campo era
    // **morto**. O número tem duas cópias: a que o código produz (o dono) e a
    // que o doc afirma. Uma terceira, livre, é a que a regra de `dry.md`
    // proíbe — e o plano anterior mandava criá-la.
    const claims = await lerRegistry(REPO_REAL);
    for (const c of claims) {
      expect(c).not.toHaveProperty('valor');
    }
  });
});
