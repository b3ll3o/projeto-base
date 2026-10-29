/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`.
 *
 * Um alias de path que aponta para um diretório que **não existe** é um alias
 * morto: o TypeScript não resolve, e nada avisa. MEDIDO 2026-10-29: o
 * `tsconfig.base.json` declarava `@projeto/ui` → `./packages/ui/src`, e
 * `packages/ui/` não existe (o `packages/` tem `eslint-config`,
 * `shared-types` e `tsconfig`). Nenhum import usava o alias — só a própria
 * declaração.
 *
 * O `check-tsconfig-drift` não pega: ele compara as chaves `strict` e
 * `noUncheckedIndexedAccess` entre os tsconfigs, e `paths` não está entre
 * elas. A regra "todo alias aponta para onde existe" ficaria em prosa — o
 * mesmo defeito que um gate em prosa é.
 *
 * **O que este gate NÃO mede:** se o alias é **usado**. Um alias válido e
 * não usado é uma decisão, não um defeito — o `@projeto/shared-domain` aponta
 * para `apps/api/src/shared/domain`, que existe, e ninguém importa. Remover
 * alias não usado é escopo de quem usa, não deste gate.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/** O tsconfig que declara os aliases do workspace. */
export const TSCONFIG_RAIZ = 'tsconfig.base.json';

/** Um alias declarado, com o alvo que ele deveria alcançar. */
export interface Alias {
  nome: string;
  alvo: string;
}

/**
 * Os aliases declarados em `compilerOptions.paths`.
 *
 * O alvo é resolvido contra o **diretório do tsconfig** (o `baseUrl` é `"."`,
 * relativo ao arquivo que o declara) — resolver contra o cwd daria um
 * resultado diferente em outro diretório.
 */
export function extrairAliases(config: unknown): Alias[] {
  if (typeof config !== 'object' || config === null) return [];
  const compilerOptions = (config as { compilerOptions?: { paths?: unknown } }).compilerOptions;
  const paths = compilerOptions?.paths;
  if (typeof paths !== 'object' || paths === null) return [];

  const out: Alias[] = [];
  for (const [nome, alvo] of Object.entries(paths as Record<string, unknown>)) {
    if (typeof alvo === 'string') {
      out.push({ nome, alvo });
    } else if (Array.isArray(alvo)) {
      const primeiro = alvo.find((v): v is string => typeof v === 'string');
      if (primeiro) out.push({ nome, alvo: primeiro });
    }
  }
  return out;
}

/** O path absoluto que um alvo alcança, a partir do diretório do tsconfig. */
export function resolverAlvo(tsconfigDir: string, alvo: string): string {
  return path.resolve(tsconfigDir, alvo);
}

/** Um alias cujo alvo não existe. */
export interface AliasMorto {
  nome: string;
  alvo: string;
  resolvido: string;
}

export async function aliasesMortos(opts: {
  repoRoot: string;
  tsconfigPath?: string;
}): Promise<AliasMorto[]> {
  const root = path.resolve(opts.repoRoot);
  const tsconfigRel = opts.tsconfigPath ?? TSCONFIG_RAIZ;
  const tsconfigAbs = path.join(root, tsconfigRel);
  const tsconfigDir = path.dirname(tsconfigAbs);

  let bruto: string;
  try {
    bruto = await fs.readFile(tsconfigAbs, 'utf-8');
  } catch {
    // Sem tsconfig não há alias — verde por ausência é a classe 5 de
    // `guard-classes.md`.
    return [];
  }

  let config: unknown;
  try {
    config = JSON.parse(bruto);
  } catch {
    // JSON inválido é erro de outro gate (o `tsc`); aqui não há o que medir.
    return [];
  }

  const mortos: AliasMorto[] = [];
  for (const alias of extrairAliases(config)) {
    const resolvido = resolverAlvo(tsconfigDir, alias.alvo);
    let existe = false;
    try {
      const st = await fs.stat(resolvido);
      existe = st.isDirectory();
    } catch {
      existe = false;
    }
    if (!existe) {
      mortos.push({ nome: alias.nome, alvo: alias.alvo, resolvido });
    }
  }
  return mortos;
}

export async function checkPathAlias(opts: {
  repoRoot: string;
  tsconfigPath?: string;
}): Promise<CheckResult> {
  const root = path.resolve(opts.repoRoot);
  const tsconfigRel = opts.tsconfigPath ?? TSCONFIG_RAIZ;

  if (!(await existe(path.join(root, tsconfigRel)))) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `'${tsconfigRel}' ausente — o gate não tem o que comparar`,
    };
  }

  const mortos = await aliasesMortos(opts);
  const errors = mortos.map(
    (m) =>
      `alias morto: '${m.nome}' aponta para '${m.alvo}' (${m.resolvido}), que não existe — ` +
      `remova o alias ou crie o diretório`,
  );

  return { ok: errors.length === 0, errors };
}

async function existe(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
