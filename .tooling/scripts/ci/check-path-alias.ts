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
import ts from 'typescript';
import { linhasDoRelato, type CheckResult } from './check-types';

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

  const { config, erro } = parseDoTsconfig(bruto, tsconfigAbs);
  if (erro !== undefined) return [];
  return aliasesMortosDoConfig(config, tsconfigDir);
}

/**
 * Os aliases mortos de um `tsconfig` já LIDO.
 *
 * Separado do `aliasesMortos` para que o gate possa usar o MESMO caminho de
 * medição sem o `catch` engolir o erro de parse (que o gate declara como
 * `skipped` com motivo).
 */
export async function aliasesMortosDoConfig(
  config: unknown,
  tsconfigDir: string,
): Promise<AliasMorto[]> {
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

/**
 * O `tsconfig` LIDO COMO O `tsc` LÊ — e não como o `JSON.parse` lê.
 *
 * ⚠️ MEDIDO em 2026-11-26: `tsconfig.json` é **JSONC** — o TypeScript aceita
 * comentário e vírgula final, e o `JSON.parse` REJEITA os dois. A primeira
 * versão deste gate usava `JSON.parse`, e o `catch` devolvia `[]` — **verde
 * silencioso** (a classe 5 de `guard-classes.md`): um `tsconfig.base.json`
 * com um `//` no meio desligava o gate inteiro, e os aliases mortos que
 * ninguém via não eram vistos. MEDIDO: com um `//` no `tsconfig.base.json` e
 * DOIS aliases mortos, o gate devolvia `{ok: true, errors: []}`.
 *
 * `ts.parseConfigFileTextToJson` é o mesmo leitor do `tsc` — comentário,
 * vírgula final e BOM saem como o compilador entende. E JSON que é inválido
 * DE VERDADE devolve o erro, que o gate declara como `skipped` COM MOTIVO
 * (nunca verde por ausência).
 */
export function parseDoTsconfig(
  bruto: string,
  caminho = TSCONFIG_RAIZ,
): { config: unknown; erro?: string } {
  // `ts.readConfigFile` e não `ts.parseConfigFileTextToJson`: MEDIDO
  // 2026-11-26, o segundo LANÇA um "Debug Failure" quando o texto tem
  // comentário (o `attachFileToDiagnostic` do TS compara o nome do arquivo
  // com um diagnóstico sem arquivo) — e um tsconfig com comentário é
  // exatamente o caso que este gate precisa ler. O `readConfigFile` é a MESMA
  // porta que o `tsc` usa, e o leitor é injetado para medir o CONTEÚDO já
  // lido (o gate não quer tocar o disco duas vezes).
  const lido = ts.readConfigFile(caminho, () => bruto);
  if (lido.error !== undefined) {
    const mensagem = ts.flattenDiagnosticMessageText(lido.error.messageText, ' ');
    return { config: undefined, erro: `'${caminho}' não é JSON nem JSONC: ${mensagem}` };
  }
  return { config: lido.config };
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

  // O gate LÊ o tsconfig por conta própria (e não via `aliasesMortos`) para
  // poder DECLARAR um JSON inválido como `skipped` com motivo — o `aliasesMortos`
  // devolve `[]` no mesmo caso, e verde por ausência é a classe 5.
  const tsconfigAbs = path.join(root, tsconfigRel);
  let bruto: string;
  try {
    bruto = await fs.readFile(tsconfigAbs, 'utf-8');
  } catch {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `'${tsconfigRel}' ausente — o gate não tem o que comparar`,
    };
  }
  const { config, erro } = parseDoTsconfig(bruto, tsconfigAbs);
  if (erro !== undefined) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `${erro} — o gate não tem o que comparar (o erro de JSON é do \`tsc\`)`,
    };
  }

  const mortos = await aliasesMortosDoConfig(config, path.dirname(tsconfigAbs));
  const errors = mortos.map(
    (m) =>
      `alias morto: '${m.nome}' aponta para '${m.alvo}' (${m.resolvido}), que não existe — ` +
      `remova o alias ou crie o diretório`,
  );

  return { ok: errors.length === 0, errors };
}

// Executado como CLI.
//
// MEDIDO 2026-10-29: sem este bloco, `pnpm exec tsx
// .tooling/scripts/ci/check-path-alias.ts` devolvia `exit 0` e **nenhuma
// saída**. O gate só media alguma coisa pelo mapa `RUNNERS` do preflight;
// invocado direto, ele não media NADA.
//
// `checkPathAlias` é **assíncrono**, então o bloco usa `.then()` — o mesmo
// padrão de `check-ci-local-e2e.ts`.
if (process.argv[1]?.endsWith('check-path-alias.ts')) {
  checkPathAlias({ repoRoot: '.' }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}

async function existe(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
