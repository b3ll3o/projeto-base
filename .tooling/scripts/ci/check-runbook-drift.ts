/**
 * SEM shebang, de propósito.
 *
 * `docs/como-rodar.md` é o mapa de execução por ambiente. Ele envelhece sem
 * aviso: um script sai do `package.json`, uma chave de env some do
 * `.env.example`, e o runbook segue mandando o leitor copiar um comando que não
 * existe mais. Nenhum gate cobria isso — `check-doc-refs` só checa se o arquivo
 * é citado, não se o que ele diz ainda é verdade.
 *
 * Duas classes de claim, as duas verificáveis sem executar nada:
 *
 * 1. **Comandos** — todo `pnpm <script>` que o runbook manda copiar tem que
 *    existir como script em algum `package.json` do workspace.
 * 2. **Chaves de env** — toda chave da tabela "Variáveis de ambiente" tem que
 *    existir em algum `.env.example` / `.env.production.example` do repo.
 * 3. **O container do banco local** — o nome que o runbook usa para CRIAR o
 *    container tem que ser o mesmo que o app manda RELIGAR e que o tooling
 *    procura (ver `SUPERFICIES_DO_CONTAINER`).
 *
 * Uma classe que não tem como ser medida é declarada `skipped` COM MOTIVO, nunca
 * `ok: true` silencioso (classe 5 de guard-classes.md).
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/** `pnpm exec X`, `pnpm --filter P X`, `pnpm turbo run X` — o token seguinte NÃO é script da raiz. */
const FORMAS_NAO_SCRIPT = new Set(['exec', 'turbo', 'dlx', 'create', 'add', 'remove', 'install']);

/**
 * Conteúdo dos blocos cercados (``` ... ```), com a indentação removida.
 *
 * Só bloco de código é comando copiável. MEDIDO 2026-10-16: varrer o doc
 * inteiro acusou 5 falsos positivos no runbook real — "pnpm nativo" (título de
 * seção), "pnpm responde" (prosa), "workspace pnpm as deps" (frase), e as
 * referências a `pnpm prune`/`pnpm deploy` da seção de diagnóstico. Gate
 * vermelho em repo correto treina o descaso com o gate.
 */
function blocosDeCodigo(doc: string): string[] {
  const out: string[] = [];
  const linhas = doc.split('\n');
  let dentro = false;
  let buffer: string[] = [];
  for (const linha of linhas) {
    if (/^\s*```/.test(linha)) {
      if (dentro) {
        out.push(buffer.join('\n'));
        buffer = [];
      }
      dentro = !dentro;
      continue;
    }
    if (dentro) buffer.push(linha.replace(/^\s{0,3}/, ''));
  }
  return out;
}

/**
 * Scripts `pnpm <nome>` citados nos blocos de código do doc. Devolve nomes
 * únicos, na ordem em que o leitor encontra.
 */
export function extrairScriptsPnpm(doc: string): string[] {
  const out: string[] = [];
  for (const bloco of blocosDeCodigo(doc)) {
    for (const m of bloco.matchAll(/\bpnpm\s+(--?[\w-]+|[\w:.-]+)/g)) {
      const token = m[1]!;
      if (token.startsWith('-')) continue; // flag: `--filter`, `--version`
      if (FORMAS_NAO_SCRIPT.has(token)) continue; // subcomando do pnpm, não script
      if (!out.includes(token)) out.push(token);
    }
  }
  return out;
}

/** Chaves da tabela "Variáveis de ambiente": a primeira coluna de uma linha `| \`KEY\` | ...`. */
export function extrairChavesEnv(doc: string): string[] {
  const out: string[] = [];
  for (const linha of doc.split('\n')) {
    const m = linha.match(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/);
    if (m && !out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

/**
 * As superfícies que guardam o nome do container do banco local.
 *
 * ⚠️ POR QUE UM GATE, E NÃO UM DONO ÚNICO
 *
 * As 3 superfícies estão em unidades de build diferentes: o app (`apps/api` —
 * que o `Dockerfile` copia sozinho), o tooling (`.tooling/scripts/ci`) e o
 * runbook (doc). Nenhuma importação pode ligar o app ao tooling — é DESENHO,
 * não acidente (o mesmo argumento do `check-feature-flag-contract`). A
 * duplicação do nome é, portanto, NECESSÁRIA; o que era indefensável é ela
 * não ter DONO NINGUÉM.
 *
 * MEDIDO em 2026-11-03 (grafo do `graphify`): as 3 vivem em 3 COMUNIDADES
 * diferentes (386 / 133 / 39) e o caminho mais curto entre elas passa por
 * `ref_node_fs` — um nó genérico de filesystem, não uma dependência. Nenhum
 * import as liga, e nenhuma linguagem de programação impede que alguém
 * renomeie uma e não as outras.
 *
 * O DONO é o runbook §1.1: é a receita que CRIA o container. As duas cópias de
 * código têm de concordar com ele.
 */
export const SUPERFICIES_DO_CONTAINER = [
  { rotulo: 'runbook', caminho: 'docs/como-rodar.md', tipo: 'runbook' },
  {
    rotulo: 'app',
    caminho: 'apps/api/src/shared/infrastructure/prisma/traducao-de-falha-de-conexao.ts',
    tipo: 'codigo',
  },
  { rotulo: 'tooling', caminho: '.tooling/scripts/ci/ambiente-local.ts', tipo: 'codigo' },
] as const;

/**
 * O nome do container do banco local, na receita do runbook.
 *
 * Ancorado no `--name` — que é o que **cria** o container (os `docker start` e
 * `docker rm` do mesmo trecho são consequência, não definição).
 */
export function nomeDoContainerNoRunbook(doc: string): string | undefined {
  const achado = /--name[= ]+([A-Za-z0-9][A-Za-z0-9_.-]*)/.exec(doc);
  return achado?.[1];
}

/**
 * O nome do container do banco local, na DECLARAÇÃO da constante do código.
 *
 * ⚠️ Ancorado na DECLARAÇÃO (`CONTAINER_DO_BANCO_LOCAL = '…'`), e não na
 * primeira ocorrência do literal: o mesmo nome aparece em COMENTÁRIOS das
 * mesmas superfícies (o cabeçalho do arquivo fala dele), e um `includes`
 * pegaria o comentário — que é o caso em que o gate mediria a prosa em vez
 * do código.
 *
 * Consequência declarada: renomear a **constante** (e não o valor) deixa o
 * gate vermelho por "superfície ausente". Quem renomear atualiza o gate.
 */
export function nomeDoContainerNoCodigo(codigo: string): string | undefined {
  const achado = /(?:export\s+)?const\s+CONTAINER_DO_BANCO_LOCAL\s*=\s*'([^']+)'/.exec(codigo);
  return achado?.[1];
}

/** Uma superfície do nome do container, já lida. */
export interface SuperficieDoContainer {
  rotulo: string;
  caminho: string;
  nome: string | undefined;
  /**
   * A superfície é EXIGIDA — a ausência dela é um erro.
   *
   * ⚠️ As duas superfícies de CÓDIGO são exigidas: elas são parte do
   * template, e a ausência da constante significa que o template mudou (e o
   * gate, que não pode mais ler o nome, tem de ser atualizado).
   *
   * ⚠️ O runbook NÃO é exigido: um repo que aponte o banco para um Postgres
   * local (sem container) não tem receita de `docker run --name` — e acusar
   * esse repo seria um falso positivo. Quando o runbook DECLARA um container,
   * ele entra na comparação; quando não declara, não há o que comparar.
   */
  exigida: boolean;
}

/**
 * As superfícies têm de nomear o MESMO container.
 *
 * ⚠️ Anti-vacuuidade: uma superfície EXIGIDA que não foi lida é **erro**,
 * nunca verde. Um gate que não mediu nada não pode reportar sucesso — é a
 * classe 5 de `guard-classes.md` ("classe ausente do dado") aplicada a si
 * próprio.
 */
export function comparaNomesDoContainer(superficies: SuperficieDoContainer[]): string[] {
  const errors: string[] = [];

  const ausentes = superficies.filter((s) => s.exigida && s.nome === undefined);
  for (const s of ausentes) {
    errors.push(
      `runbook desatualizado: não achei o nome do container do banco local em ` +
        `${s.caminho} (${s.rotulo}) — o gate não pode medir o que não leu ` +
        '(verde por ausência é a classe 5 de guard-classes.md).',
    );
  }

  // ⚠️ Uma superfície AUSENTE já é o erro — e a divergência que ela produz
  // ("o nome difere") seria uma leitura ENFERRUJADA (o gate não sabe o nome,
  // ele não sabe que o nome mudou). Então a ausência SAI SOZINHA.
  if (ausentes.length > 0) return errors;

  // O runbook entra na comparação só quando DECLARA um container.
  const declarados = superficies.filter((s) => s.nome !== undefined);
  const distintos = [...new Set(declarados.map((s) => s.nome))];
  if (distintos.length > 1) {
    errors.push(
      'o nome do container do banco local diverge entre as superfícies que o guardam: ' +
        declarados.map((s) => `${s.rotulo}=${s.nome ?? '(não encontrado)'}`).join(' · ') +
        '. O runbook §1.1 é o DONO (a receita que cria o container) — renomeou num ' +
        'lugar, renomeou em todos, senão o `pnpm dev` manda `docker start` de um ' +
        'nome que não existe.',
    );
  }

  return errors;
}

/** Lê as 3 superfícies do nome do container e compara. */
export async function checkNomeDoContainer(opts: {
  repoRoot: string;
  doc: string;
}): Promise<string[]> {
  const root = path.resolve(opts.repoRoot);
  const superficies: SuperficieDoContainer[] = [];

  for (const s of SUPERFICIES_DO_CONTAINER) {
    if (s.tipo === 'runbook') {
      superficies.push({
        rotulo: s.rotulo,
        caminho: s.caminho,
        nome: nomeDoContainerNoRunbook(opts.doc),
        exigida: false,
      });
      continue;
    }
    let codigo = '';
    try {
      codigo = await fs.readFile(path.join(root, s.caminho), 'utf-8');
    } catch {
      // arquivo ausente: o nome fica `undefined` e a comparação acusa.
      codigo = '';
    }
    superficies.push({
      rotulo: s.rotulo,
      caminho: s.caminho,
      nome: nomeDoContainerNoCodigo(codigo),
      exigida: true,
    });
  }

  return comparaNomesDoContainer(superficies);
}

async function lerJson(p: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8')) as PackageJson;
  } catch {
    return null;
  }
}

/** Scripts de todos os `package.json` do workspace (raiz + `apps/*` + `packages/*`). */
async function scriptsDoWorkspace(repoRoot: string): Promise<Set<string>> {
  const out = new Set<string>();
  const raiz = await lerJson(path.join(repoRoot, 'package.json'));
  for (const s of Object.keys(raiz?.scripts ?? {})) out.add(s);
  for (const grupo of ['apps', 'packages']) {
    let entradas: import('node:fs').Dirent[];
    try {
      entradas = await fs.readdir(path.join(repoRoot, grupo), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      const pkg = await lerJson(path.join(repoRoot, grupo, e.name, 'package.json'));
      for (const s of Object.keys(pkg?.scripts ?? {})) out.add(s);
    }
  }
  return out;
}

/** Chaves declaradas em qualquer `.env.example` / `.env.production.example` do repo. */
async function chavesDeEnvExample(repoRoot: string): Promise<Set<string>> {
  const out = new Set<string>();
  const candidatos = [
    '.env.example',
    '.env.production.example',
    'apps/api/.env.example',
    'apps/web/.env.example',
  ];
  for (const rel of candidatos) {
    try {
      const raw = await fs.readFile(path.join(repoRoot, rel), 'utf-8');
      for (const linha of raw.split('\n')) {
        const m = linha.match(/^([A-Z][A-Z0-9_]*)=/);
        if (m) out.add(m[1]!);
      }
    } catch {
      // arquivo ausente: segue para o próximo
    }
  }
  return out;
}

export async function checkRunbookDrift(opts: {
  repoRoot: string;
  docPath?: string;
}): Promise<CheckResult> {
  const root = path.resolve(opts.repoRoot);
  const docPath = opts.docPath ?? path.join(root, 'docs/como-rodar.md');

  let doc: string;
  try {
    doc = await fs.readFile(docPath, 'utf-8');
  } catch {
    // Template sem runbook não é erro — é ausência do que julgar. `skipped` COM
    // MOTIVO: verde por ausência é a classe 5 de guard-classes.md.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `runbook ausente: '${path.relative(root, docPath)}' — gate não tem o que comparar`,
    };
  }

  const errors: string[] = [];
  const scripts = await scriptsDoWorkspace(root);
  for (const s of extrairScriptsPnpm(doc)) {
    if (!scripts.has(s)) {
      errors.push(
        `runbook desatualizado: o doc manda rodar 'pnpm ${s}' mas nenhum package.json do ` +
          `workspace define o script '${s}' — corrija o runbook ou restaure o script`,
      );
    }
  }

  const envExamples = await chavesDeEnvExample(root);
  if (envExamples.size > 0) {
    for (const k of extrairChavesEnv(doc)) {
      if (!envExamples.has(k)) {
        errors.push(
          `runbook desatualizado: a tabela de variáveis cita '${k}' mas essa chave não está em ` +
            `nenhum .env.example do repo — corrija o runbook ou o exemplo`,
        );
      }
    }
  }

  // A terceira classe: o nome do container do banco local tem de ser o mesmo
  // nas 3 superfícies que o guardam (o runbook §1.1 é o dono).
  errors.push(...(await checkNomeDoContainer({ repoRoot: root, doc })));

  return { ok: errors.length === 0, errors };
}
