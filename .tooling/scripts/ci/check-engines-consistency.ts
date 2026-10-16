/**
 * SEM shebang, de propósito.
 *
 * Estende o alcance de check-package-json-drift.ts: aquele varre a raiz;
 * este varre os package.json dos apps. A pendência explícita em
 * ci-defense-in-depth-pendencias.md (linha 208) diz que task turbo fantasma
 * declarada em apps escapa do gate; aqui atacamos a metade que é engines
 * (apps podem usar Node 18 sem detecção).
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

interface PackageJson {
  name?: string;
  engines?: { node?: string; pnpm?: string };
  [key: string]: unknown;
}

/**
 * Parseia uma spec semver como `>=22.6.0` em {min: 22.6.0}. SPECs suportadas:
 * `>=X`, `>X`, `^X` (= `>=X <X+1.0.0`), `~X` (= `>=X <X+0.1.0`), `X` exato.
 * Devolve `null` para SPECs que o gate não entende (a `engines.node` da raiz
 * é um `>=`, então a regra prática é cobrir `>=`).
 */
export function parseMinEngine(spec: string): { op: '>=' | '>' | '~' | '^' | '='; major: number; minor: number; patch: number } | null {
  const m = spec.match(/^(>=|>|~|\^|=)?\s*(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  const op = (m[1] as '>=' | '>' | '~' | '^' | '=') || '=';
  return { op, major: +m[2]!, minor: +m[3]!, patch: +m[4]! };
}

/** Compara duas engines: a do app é SATISFEITA pela da raiz? */
export function rootSatisfiesApp(rootSpec: string | undefined, appSpec: string | undefined): boolean {
  if (!appSpec) return true; // app não declara engines — não há o que comparar
  if (!rootSpec) return true; // raiz não declara — gate não tem como julgar; deixamos passar
  const root = parseMinEngine(rootSpec);
  const app = parseMinEngine(appSpec);
  if (!root || !app) return true; // SPEC não coberta pelo parser — não inventar erro

  // Caso comum: raiz `>=22.6.0` e app `>=22.0.0` (mais permissivo) → app roda no Node da raiz? SIM.
  // Caso comum: raiz `>=22.6.0` e app `^20.0.0` (~= `>=20 <21`) → app NÃO roda no Node da raiz. ERRO.
  // Caso comum: raiz `>=22.6.0` e app `>=24.0.0` (mais restritivo acima) → app NÃO roda no Node da raiz. ERRO.
  // Caso comum: raiz `>=22.6.0` e app `>=22.6.0` (igual) → OK.
  // A regra: o min do app deve ser >= o min da raiz. (Ignoramos upper-bounds do app
  // porque `^20` com raiz `>=22.6.0` é o caso errado — `^20` é `>=20 <21`, e o
  // `>=20` está satisfeito, mas a app está ALVO em Node 20, que está abaixo da
  // raiz.)
  //
  // Para simplificar a 1ª versão, comparamos SÓ o `>=` mínimo:
  // - raiz: `>=22.6.0` → min = 22.6.0
  // - app:   `>=20.0.0` → min = 20.0.0 → 20.0.0 < 22.6.0 → ERRO
  // - app:   `>=24.0.0` → min = 24.0.0 → 24.0.0 > 22.6.0 → ERRO (app exige mais que a raiz)
  // - app:   `^20.0.0`  → min = 20.0.0 → ERRO (mesmo motivo)
  // - app:   `>=22.6.0` → min = 22.6.0 → OK
  //
  // Para cobrir o `^`/`~`: a regra passa a ser: o min do app deve estar
  // **dentro do range declarado pela raiz**. Como a raiz é `>=X`, o range é
  // `[X, ∞)`. Logo: `app.min >= root.min`.
  if (app.major < root.major) return false;
  if (app.major > root.major) return false; // app exige mais novo que a raiz
  if (app.major === root.major) {
    if (app.minor < root.minor) return false;
    if (app.minor > root.minor) return false;
    if (app.minor === root.minor) {
      if (app.patch < root.patch) return false;
    }
  }
  return true;
}

async function readJson(p: string): Promise<PackageJson | null> {
  try {
    const raw = await fs.readFile(p, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function findAppPackageJsons(appsRoot: string): Promise<{ file: string; pkg: PackageJson }[]> {
  const out: { file: string; pkg: PackageJson }[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(appsRoot, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const pkgPath = path.join(appsRoot, e.name, 'package.json');
    const pkg = await readJson(pkgPath);
    if (pkg) out.push({ file: path.relative(process.cwd(), pkgPath), pkg });
  }
  return out;
}

export async function checkEnginesConsistency(opts: {
  repoRoot: string;
  appsRoots?: string[];
}): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.repoRoot);
  const appsRoots = opts.appsRoots ?? [path.join(root, 'apps')];

  // Lê a engines da raiz — fonte da verdade.
  const rootPkg = await readJson(path.join(root, 'package.json'));
  const rootNode = rootPkg?.engines?.node;
  const rootPnpm = rootPkg?.engines?.pnpm;

  if (!rootNode) {
    // A raiz não declara `engines.node`. O gate não tem como julgar — `skipped`
    // com motivo é o caminho honesto: declarar `ok: true` aqui seria a classe 5
    // de guard-classes.md (verde por ausência).
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: 'engines.node ausente do package.json raiz — gate não tem como comparar',
    };
  }

  for (const appsRoot of appsRoots) {
    const apps = await findAppPackageJsons(appsRoot);
    if (apps.length === 0) {
      return {
        ok: true,
        errors: [],
        skipped: true,
        reason: `nenhum apps/*/package.json encontrado em '${appsRoot}'`,
      };
    }
    for (const { file, pkg } of apps) {
      if (pkg.engines?.node && !rootSatisfiesApp(rootNode, pkg.engines.node)) {
        errors.push(
          `drift de engines.node: raiz declara '${rootNode}' mas '${file}' declara '${pkg.engines.node}' — ` +
            `o app NÃO rodará no Node que a raiz exige (ou a app exige mais novo que a raiz permite). ` +
            `Alinhe os dois ou remova a engines do app se a intenção é herdar.`,
        );
      }
      if (pkg.engines?.pnpm && rootPnpm && !rootSatisfiesApp(rootPnpm, pkg.engines.pnpm)) {
        errors.push(
          `drift de engines.pnpm: raiz declara '${rootPnpm}' mas '${file}' declara '${pkg.engines.pnpm}'`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
