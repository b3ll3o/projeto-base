/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`.
 *
 * Um alias de `paths` que aponta para um local que **não existe** é um alias
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
 * **A semântica é a DO TYPESCRIPT, e não uma aproximação dela.** MEDIDO
 * 2026-10-30 (reconfirmado 2026-11-27): o alvo de um `paths` do TS é um
 * **local de módulo**, e o TS aceita TRÊS formas que a versão anterior deste
 * gate acusava:
 *
 *   (a) alvo que é **arquivo** — `"./src/x.ts"` resolve (`tsc --noEmit` sai 0);
 *   (b) alvo com **wildcard** — `"./*"`, que é o que `apps/web/tsconfig.json`
 *       usa (`"@/*": ["./*"]`, com 150 imports `@/…` MEDIDO 2026-11-27);
 *   (c) alvo com **vários destinos** — o TS tenta TODOS em ordem
 *       (`['./src/nao-existe','./src/real.ts']` resolve para `real.ts`), e a
 *       versão anterior olhava SÓ o primeiro.
 *
 * ⚠️ **O gate NÃO exige que o import RESOLVA — ele exige que o ALVO
 * EXISTA.** São coisas diferentes: `@projeto/shared-audit` aponta para
 * `apps/api/src/shared/audit`, que EXISTE mas não tem `index.ts` — então
 * `import '@projeto/shared-audit'` **não resolve** (MEDIDO 2026-11-27:
 * `ts.resolveModuleName` devolve `NÃO RESOLVE` para os três aliases, e só
 * o `@projeto/shared-types` resolve, porque o `src` dele tem `index.ts`).
 * Exigir resolução do import acusaria um alias cuja DECLARAÇÃO é correta —
 * o `paths` do TS mapeia o specifier EXATO (`@projeto/shared-audit` sem
 * `*` casa só ele mesmo), e o alvo é um local, não um módulo.
 *
 * **O que este gate NÃO mede:** se o alias é **usado**. Um alias válido e
 * não usado é uma decisão, não um defeito — o `@projeto/shared-domain` aponta
 * para `apps/api/src/shared/domain`, que existe, e ninguém importa. Remover
 * alias não usado é escopo de quem usa, não deste gate.
 */
import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ts from 'typescript';
import { linhasDoRelato, type CheckResult } from './check-types';

/**
 * As extensões que o TS tenta ao resolver um local de módulo.
 *
 * A lista é a do `ts.resolveModuleName` (MEDIDO 2026-11-27: resolver
 * `./src/x` acha `src/x.ts`), e não a do `ts.Extension` interno — o
 * `typescript.d.ts` não expõe a lista, e reescrevê-la aqui seria um segundo
 * lugar onde a verdade mora.
 */
const EXTENSOES_DE_MODULO = ['.ts', '.tsx', '.d.ts', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/** Diretórios que não contêm tsconfig do repo (build, cache, dependências). */
const DIRETORIOS_IGNORADOS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.next-e2e',
  '.next-boot',
  '.turbo',
  'coverage',
]);

/** Um alias declarado, com TODOS os destinos na ordem que o TS tenta. */
export interface Alias {
  nome: string;
  alvos: string[];
}

/** Um alias medido: o destino, a base contra a qual ele resolve e o veredito. */
export interface AliasMedido {
  nome: string;
  alvo: string;
  base: string;
  vivo: boolean;
  /** O caminho absoluto que o alvo representa (o prefixo, no caso wildcard). */
  resolvido: string;
}

/**
 * Os aliases declarados em `compilerOptions.paths`, com TODOS os destinos.
 *
 * O alvo pode ser string ou lista; o TS normaliza para lista. E `paths` NÃO
 * é mesclado no `extends`: o do filho SUBSTITUI o do pai (MEDIDO 2026-11-27:
 * `apps/web/tsconfig.json` declara `paths` próprio e o resultado efetivo é só
 * `@/*`).
 */
export function aliasesDe(paths: unknown): Alias[] {
  if (typeof paths !== 'object' || paths === null) return [];
  const out: Alias[] = [];
  for (const [nome, valor] of Object.entries(paths as Record<string, unknown>)) {
    const alvos = (Array.isArray(valor) ? valor : [valor]).filter(
      (v): v is string => typeof v === 'string',
    );
    if (alvos.length > 0) out.push({ nome, alvos });
  }
  return out;
}

/**
 * Os tsconfigs do repo.
 *
 * A regra é a do `check-tsconfig-drift` (o mesmo `^tsconfig.*\.json$`) MAIS
 * os arquivos de um pacote de configs (`packages/tsconfig/*.json`), que são
 * tsconfigs de verdade — referenciados por `extends` — e não casam com o
 * padrão do nome.
 */
async function listarTsconfigs(root: string): Promise<string[]> {
  const encontrados: string[] = [];
  async function andar(dir: string): Promise<void> {
    let entradas;
    try {
      entradas = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (DIRETORIOS_IGNORADOS.has(entrada.name)) continue;
        await andar(completo);
        continue;
      }
      if (!entrada.isFile() || !entrada.name.endsWith('.json')) continue;
      // `package.json` é o MANIFESTO do pacote de configs, não um config —
      // o TS o recusa ("'version' should be set inside the 'compilerOptions'").
      if (entrada.name === 'package.json') continue;
      const noPaiDeTsconfig = path.basename(dir) === 'tsconfig';
      if (/^tsconfig.*\.json$/.test(entrada.name) || noPaiDeTsconfig) {
        encontrados.push(completo);
      }
    }
  }
  await andar(root);
  return encontrados.sort();
}

/**
 * A base contra a qual os alvos de um config resolvem.
 *
 * MEDIDO 2026-11-27: o TS resolve o alvo contra o `baseUrl` quando existe —
 * e o `baseUrl` herdado resolve contra o diretório do arquivo que o DECLAROU
 * (`apps/api/tsconfig.json` estende `packages/tsconfig/node.json`, que
 * estende `tsconfig.base.json` — o `baseUrl` efetivo é a RAIZ do repo, não o
 * diretório de `apps/api`). Sem `baseUrl`, o alvo resolve contra o diretório
 * do config que o declara (`pathsBasePath`).
 */
function baseDe(opcoes: ts.CompilerOptions, diretorio: string): string {
  const comBase = opcoes as ts.CompilerOptions & { pathsBasePath?: string };
  return opcoes.baseUrl ?? comBase.pathsBasePath ?? diretorio;
}

/**
 * O host que o TS usa para resolver um tsconfig.
 *
 * O `readDirectory` é VAZIO de propósito: sem isto o TS enumera os `include`
 * do repo inteiro (e o erro 18003 — "no inputs were found" — que ele devolve
 * é do arquivo, não do `paths`). O `onUnRecoverableConfigFileDiagnostic` é
 * descartado porque o gate mede o `paths`, e o diagnóstico de JSON inválido é
 * lido pela OUTRA porta (`ts.readConfigFile`), que não o engole.
 */
const HOST_DE_CONFIG: ts.ParseConfigFileHost = {
  ...ts.sys,
  readDirectory: () => [],
  onUnRecoverableConfigFileDiagnostic: () => {},
};

/** O primeiro `*` do alvo, ou -1. */
function indiceDoWildcard(alvo: string): number {
  return alvo.indexOf('*');
}

/** O `stat` de um caminho, ou `null` quando ele não existe. */
async function statDe(caminho: string): Promise<Stats | null> {
  try {
    return await fs.stat(caminho);
  } catch {
    return null;
  }
}

/** Escapa os metacaracteres de uma regex. */
function escapaRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * O alvo resolve para um local que o TS consegue usar?
 *
 * Formas, na ordem que o TS as tenta:
 *
 *   1. **wildcard** — o `*` do alvo é o ponto onde o TS substitui o trecho do
 *      specifier que casou com o `*` do ALIAS. O que tem de existir é o
 *      prefixo fixo (o diretório) e, dentro dele, pelo menos um arquivo de
 *      módulo que case com a cauda do padrão.
 *   2. **arquivo** — o alvo nomeia um arquivo; o TS o usa.
 *   3. **diretório** — o alvo nomeia um diretório; o TS procura `index.*`
 *      dentro dele.
 *
 * E, para as três, a extensão que o TS acrescentaria: `./src/x` resolve para
 * `src/x.ts`.
 */
async function alvoVivo(base: string, alvo: string): Promise<{ vivo: boolean; resolvido: string }> {
  const resolvido = path.resolve(base, alvo);

  const i = indiceDoWildcard(alvo);
  if (i >= 0) {
    // O `*` do ALVO é o ponto onde o TS substitui o trecho do specifier que
    // casou com o `*` do ALIAS (MEDIDO 2026-11-27: `@/deep/a` → `./src/*`
    // resolve para `src/deep/a.ts` — o `*` casa `/` também).
    //
    // O alvo se quebra em três pedaços: o DIRETÓRIO fixo (o que existe sem
    // o trecho capturado), o PREFIXO dentro dele e a CAUDA (a extensão).
    // Só o diretório fixo é obrigatório; o resto é o padrão que o trecho
    // capturado tem de casar.
    const semPrefixo = alvo.replace(/^\.\//, '');
    const estrela = semPrefixo.indexOf('*');
    const barra = semPrefixo.lastIndexOf('/', estrela);
    const diretorioRel = barra >= 0 ? semPrefixo.slice(0, barra + 1) : '';
    const prefixo = semPrefixo.slice(diretorioRel.length, estrela);
    const cauda = semPrefixo.slice(estrela + 1);
    const ancora = path.resolve(base, diretorioRel);
    const existe = await statDe(ancora);
    if (existe === null || !existe.isDirectory()) return { vivo: false, resolvido: ancora };

    // O `*` casa qualquer texto, inclusive `/` — então o regex é `.*`.
    const regex = new RegExp(`^${escapaRegex(prefixo)}.*${escapaRegex(cauda)}$`);
    const arquivos = ts.sys.readDirectory(ancora, EXTENSOES_DE_MODULO, undefined, ['**/*']);
    for (const arquivo of arquivos) {
      const relativo = path.relative(ancora, arquivo);
      if (regex.test(relativo)) return { vivo: true, resolvido: arquivo };
      const semExtensao = relativo.replace(/\.(tsx|ts|mts|cts|jsx|js|mjs|cjs)$/, '');
      if (regex.test(semExtensao)) return { vivo: true, resolvido: arquivo };
    }
    return { vivo: false, resolvido: ancora };
  }

  const direto = await statDe(resolvido);
  if (direto !== null) return { vivo: true, resolvido };

  for (const ext of EXTENSOES_DE_MODULO) {
    if ((await statDe(resolvido + ext)) !== null) return { vivo: true, resolvido: resolvido + ext };
  }
  for (const ext of EXTENSOES_DE_MODULO) {
    const indice = path.join(resolvido, `index${ext}`);
    if ((await statDe(indice)) !== null) return { vivo: true, resolvido: indice };
  }
  return { vivo: false, resolvido };
}

/** Um tsconfig encontrado no disco, com o motivo quando não pôde ser medido. */
interface ConfigMedida {
  arquivo: string;
  /** O diretório do tsconfig — a base quando o config não declara `baseUrl`. */
  diretorio: string;
  base: string;
  aliases: Alias[];
  /** O motivo pelo qual o config NÃO foi medido (JSON inválido, `extends` quebrado). */
  motivo?: string;
}

/**
 * Mede um tsconfig: os aliases que ele declara (após o `extends`) e a base
 * contra a qual eles resolvem.
 *
 * A leitura é feita em DUAS portas, porque cada uma esconde um defeito
 * diferente (MEDIDO 2026-11-27):
 *
 *   - `ts.readConfigFile` — diz se o ARQUIVO é JSON/JSONC válido. É a porta
 *     do `tsc` e aceita comentário e vírgula final.
 *   - `ts.getParsedCommandLineOfConfigFile` — resolve o `extends` e devolve o
 *     `paths` e o `baseUrl` EFETIVOS. ⚠️ Esta porta **engole** o erro de
 *     JSON inválido (devolve `paths: undefined` e um erro 18003 de "no
 *     inputs"), então ela não pode ser a única: sem a primeira, um tsconfig
 *     quebrado pareceria um tsconfig sem alias — verde por ausência.
 */
function medirConfig(arquivo: string): ConfigMedida {
  const diretorio = path.dirname(arquivo);
  const lido = ts.readConfigFile(arquivo, ts.sys.readFile);
  if (lido.error !== undefined) {
    const mensagem = ts.flattenDiagnosticMessageText(lido.error.messageText, ' ');
    return {
      arquivo,
      diretorio,
      base: diretorio,
      aliases: [],
      motivo: `não é JSON nem JSONC: ${mensagem}`,
    };
  }

  const parseado = ts.getParsedCommandLineOfConfigFile(arquivo, {}, HOST_DE_CONFIG);
  if (parseado === undefined) {
    return {
      arquivo,
      diretorio,
      base: diretorio,
      aliases: [],
      motivo: 'não pôde ser resolvido: o TS não devolveu config',
    };
  }
  const erros = parseado.errors.filter((e) => e.code !== 18003);
  if (erros.length > 0) {
    const mensagem = ts.flattenDiagnosticMessageText(erros[0]!.messageText, ' ');
    return {
      arquivo,
      diretorio,
      base: diretorio,
      aliases: [],
      motivo: `não pôde ser resolvido: ${mensagem}`,
    };
  }

  return {
    arquivo,
    diretorio,
    base: baseDe(parseado.options, diretorio),
    aliases: aliasesDe(parseado.options.paths),
  };
}

/** A medição de um repo inteiro: os aliases medidos e os configs não medidos. */
export interface Medicao {
  aliases: AliasMedido[];
  /** Um config que NÃO pôde ser medido, com o motivo. */
  naoMedidos: { arquivo: string; motivo: string }[];
}

/**
 * Mede TODOS os aliases de TODOS os tsconfigs do repo.
 *
 * O gate mede o repo inteiro, e não um tsconfig só: o alias com wildcard
 * (`"@/*": ["./*"]`) só existe em `apps/web/tsconfig.json`, e foi por não
 * medir lá que o defeito ficou LATENTE por um ano (MEDIDO 2026-10-30).
 */
export async function medirAliases(repoRoot: string): Promise<Medicao> {
  const root = path.resolve(repoRoot);
  const arquivos = await listarTsconfigs(root);
  const aliases: AliasMedido[] = [];
  const naoMedidos: { arquivo: string; motivo: string }[] = [];

  for (const arquivo of arquivos) {
    const config = medirConfig(arquivo);
    if (config.motivo !== undefined) {
      naoMedidos.push({ arquivo: path.relative(root, arquivo), motivo: config.motivo });
      continue;
    }
    for (const alias of config.aliases) {
      for (const alvo of alias.alvos) {
        const { vivo, resolvido } = await alvoVivo(config.base, alvo);
        aliases.push({ nome: alias.nome, alvo, base: config.base, vivo, resolvido });
      }
    }
  }

  return { aliases, naoMedidos };
}

/** A mensagem de um alias morto. */
function mensagemDeMorto(medido: AliasMedido): string {
  const como =
    indiceDoWildcard(medido.alvo) >= 0 ? 'não casa com nenhum arquivo de módulo' : 'que não existe';
  return (
    `alias morto: '${medido.nome}' aponta para '${medido.alvo}' (${medido.resolvido}), ${como} — ` +
    `remova o alias ou aponte para um local que exista`
  );
}

export async function checkPathAlias(opts: { repoRoot: string }): Promise<CheckResult> {
  const root = path.resolve(opts.repoRoot);
  const { aliases, naoMedidos } = await medirAliases(root);

  if (aliases.length === 0 && naoMedidos.length === 0) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: 'nenhum tsconfig encontrado — o gate não tem o que medir',
    };
  }

  if (aliases.length === 0) {
    const detalhe = naoMedidos.map((n) => `${n.arquivo} (${n.motivo})`).join('; ');
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `nenhum tsconfig pôde ser medido — ${detalhe}`,
    };
  }

  // Um alias com vários destinos é VIVO se ALGUM destino resolve — é o que o
  // TS faz (tenta cada um em ordem). Só quando NENHUM resolve o alias é
  // morto, e aí o relatório nomeia cada destino que falhou.
  //
  // O agrupamento é por (NOME, BASE): o mesmo nome em bases diferentes são
  // aliases diferentes (o `@/*` do web e um `@/*` de outro projeto), e um
  // vivo em uma base não pode esconder um morto em outra. A base entra
  // também na chave porque é ela que decide a resolução.
  const porAlias = new Map<string, AliasMedido[]>();
  for (const medido of aliases) {
    const chave = `${medido.nome}\u0000${medido.base}`;
    const lista = porAlias.get(chave) ?? [];
    lista.push(medido);
    porAlias.set(chave, lista);
  }

  const errors: string[] = [];
  const vistos = new Set<string>();
  for (const [, destinos] of porAlias) {
    if (destinos.some((d) => d.vivo)) continue;
    for (const destino of destinos) {
      const mensagem = mensagemDeMorto(destino);
      if (vistos.has(mensagem)) continue;
      vistos.add(mensagem);
      errors.push(mensagem);
    }
  }

  const advisories = naoMedidos.map(
    (n) =>
      `NÃO medido: '${n.arquivo}' — ${n.motivo} (os aliases desse tsconfig não foram conferidos)`,
  );

  return {
    ok: errors.length === 0,
    errors,
    ...(advisories.length > 0 ? { advisories } : {}),
  };
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
  checkPathAlias({ repoRoot: process.cwd() }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}
