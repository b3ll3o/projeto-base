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
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
 * As 4 superfícies estão em unidades de build diferentes: o app (`apps/api` —
 * que o `Dockerfile` copia sozinho), o tooling (`.tooling/scripts/ci`), o
 * hook (`.husky/pre-push`) e o runbook (doc). Nenhuma importação pode ligar o
 * app ao tooling — é DESENHO, não acidente (o mesmo argumento do
 * `check-feature-flag-contract`). A duplicação do nome é, portanto,
 * NECESSÁRIA; o que era indefensável é ela não ter DONO NINGUÉM.
 *
 * MEDIDO em 2026-11-03 (grafo do `graphify`): as 3 primeiras vivem em 3
 * COMUNIDADES diferentes (386 / 133 / 39) e o caminho mais curto entre elas
 * passa por `ref_node_fs` — um nó genérico de filesystem, não uma dependência.
 * Nenhum import as liga, e nenhuma linguagem de programação impede que alguém
 * renomeie uma e não as outras.
 *
 * O DONO é o runbook §1.1: é a receita que CRIA o container. As outras três
 * cópias têm de concordar com ele.
 *
 * ⚠️ O `.husky/pre-push` é uma das cópias: a linha que o hook imprime quando
 * o push é barrado é um comando COPIÁVEL — é literalmente o que a pessoa
 * executa. Ela não é "consequência" de nada: é uma cópia autoral, e por isso
 * entra na comparação.
 */
export const SUPERFICIES_DO_CONTAINER = [
  { rotulo: 'runbook', caminho: 'docs/como-rodar.md', tipo: 'comandos' },
  {
    rotulo: 'app',
    caminho: 'apps/api/src/shared/infrastructure/prisma/traducao-de-falha-de-conexao.ts',
    tipo: 'codigo',
  },
  { rotulo: 'tooling', caminho: '.tooling/scripts/ci/ambiente-local.ts', tipo: 'codigo' },
  { rotulo: 'pre-push', caminho: '.husky/pre-push', tipo: 'comandos' },
] as const;

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

/**
 * TODOS os nomes de container citados em COMANDOS.
 *
 * Cobre as 3 formas em que o runbook e o hook citam o container: a receita
 * (`docker run --name X`), o reinício (`docker start X`) e o derrube
 * (`docker rm -f X`).
 *
 * ⚠️ As ASPAS contam: `--name "X"` é uma forma válida de `docker run` — e é
 * a mais natural de escrever. MEDIDO: a 1ª versão deste regex (`--name[= ]+`)
 * devolvia `undefined` para a forma com aspas, e aí o DONO (o runbook)
 * saía **silenciosamente** da comparação — o gate ficava verde com o
 * runbook renomeado e o código não. Um guard que depende da forma do texto é
 * um guard com uma classe 2 inteira de furo.
 *
 * ⚠️ O `docker compose stop <serviço>` NÃO casa: aqui só entram `start` e
 * `rm`, e `compose` não é nenhum dos dois.
 */
export function nomesDoContainerEmComandos(texto: string): string[] {
  const out: string[] = [];
  const re =
    /--name[= ]+["']?([A-Za-z0-9][A-Za-z0-9_.-]*)["']?|docker\s+(?:start|rm)\s+(?:-f\s+)?([A-Za-z0-9][A-Za-z0-9_.-]*)/g;
  for (const m of texto.matchAll(re)) {
    const nome = m[1] ?? m[2];
    if (nome !== undefined && !out.includes(nome)) out.push(nome);
  }
  return out;
}

/** Uma superfície do nome do container, já lida. */
export interface SuperficieDoContainer {
  rotulo: string;
  caminho: string;
  /** TODOS os nomes que a superfície cita (a receita E as referências). */
  nomes: string[];
  /**
   * A superfície é EXIGIDA — ela tem que citar o nome.
   *
   * ⚠️ As duas superfícies de CÓDIGO são exigidas: elas são parte do
   * template, e a ausência da constante significa que o template mudou (e o
   * gate, que não pode mais ler o nome, tem de ser atualizado).
   *
   * ⚠️ O runbook e o hook NÃO são exigidos: um repo que aponte o banco para
   * um Postgres local (sem container) não tem receita de `docker run --name`
   * — e acusar esse repo seria um falso positivo. Quando eles citam um
   * container, ele entra na comparação; quando não citam, não há o que
   * comparar.
   */
  exigida: boolean;
}

/**
 * As superfícies têm de nomear o MESMO container.
 *
 * ⚠️ Anti-vacuuidade: uma superfície EXIGIDA que não nomeia nada é **erro**,
 * nunca verde. Um gate que não mediu nada não pode reportar sucesso — é a
 * classe 5 de `guard-classes.md` ("classe ausente do dado") aplicada a si
 * próprio.
 */
export function comparaNomesDoContainer(superficies: SuperficieDoContainer[]): string[] {
  const errors: string[] = [];

  const ausentes = superficies.filter((s) => s.exigida && s.nomes.length === 0);
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

  // ⚠️ A comparação é entre TODOS os nomes citados, e não entre as
  // superfícies "que declaram": o DONO (o `--name` da receita) e as
  // REFERÊNCIAS (`docker start`, `docker rm`) têm de ser o mesmo nome, e as
  // cópias de código também. Uma citação com o nome velho — a forma mais
  // natural de escrever (`--name "X"`) — não pode sumir da comparação.
  const citados = superficies.flatMap((s) => s.nomes);
  const distintos = [...new Set(citados)];
  if (distintos.length > 1) {
    errors.push(
      'o nome do container do banco local diverge entre as superfícies que o guardam: ' +
        superficies
          .map((s) => `${s.rotulo}=${s.nomes.length === 0 ? '(nenhum)' : s.nomes.join(', ')}`)
          .join(' · ') +
        '. O runbook §1.1 é o DONO (a receita que cria o container) — renomeou num ' +
        'lugar, renomeou em todos, senão o `pnpm dev` manda `docker start` de um ' +
        'nome que não existe.',
    );
  }

  return errors;
}

/** Lê as superfícies do nome do container e compara. */
export async function checkNomeDoContainer(opts: {
  repoRoot: string;
  doc: string;
}): Promise<string[]> {
  const root = path.resolve(opts.repoRoot);
  const superficies: SuperficieDoContainer[] = [];

  for (const s of SUPERFICIES_DO_CONTAINER) {
    let texto = '';
    if (s.caminho === 'docs/como-rodar.md') {
      texto = opts.doc;
    } else {
      try {
        texto = await fs.readFile(path.join(root, s.caminho), 'utf-8');
      } catch {
        // arquivo ausente: a superfície não nomeia nada, e a comparação acusa.
        texto = '';
      }
    }
    superficies.push({
      rotulo: s.rotulo,
      caminho: s.caminho,
      nomes:
        s.tipo === 'codigo'
          ? [nomeDoContainerNoCodigo(texto)].filter((n): n is string => n !== undefined)
          : nomesDoContainerEmComandos(texto),
      exigida: s.tipo === 'codigo',
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

/** O nome de um arquivo de exemplo de ambiente. */
const EXEMPLO_DE_ENV = /^\.env(\.production)?\.example$/;

/** Diretórios que nunca contêm um `.env.example` versionado. */
const SKIP_DIRS_DE_ENV = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', '.turbo']);

/**
 * Os `.env.example` / `.env.production.example` do repo (relativos à raiz).
 *
 * ⚠️ A lista era ESCRITA À MÃO (achado M2 da 2ª revisão do #144): os 4
 * caminhos literais eram a varredura INTEIRA — um `.env.example` novo em
 * outro pacote não entrava, e a lista não estava em asserção de spec
 * nenhuma, então ninguém percebia o furo. Aqui a lista é **DERIVADA**: não
 * há lista para alguém encolher sem querer.
 *
 * A ordem é a de `check-doc-refs.ts`: `git ls-files` primeiro (a lista
 * VERSIONADA — e é o `.gitignore` do repo que exclui o `node_modules`, uma
 * fonte só), e a varredura do disco como reserva, **avisando**: um gate
 * cujo escopo encolhe em silêncio é exatamente a falha que este gate existe
 * para eliminar.
 *
 * ⚠️ O `git ls-files` leva `--others --exclude-standard`: um `.env.example`
 * **novo, ainda não versionado** tem de contar. MEDIDO (achado I-02 da
 * revisão do #144): com o índice apenas, o gate acusava uma chave que ESTAVA
 * no disco — um falso positivo que barra o pre-push e aponta para um arquivo
 * que já está certo. O `--exclude-standard` mantém o `.gitignore` como a
 * fonte única do que fica de fora.
 */
export function arquivosDeEnvExample(repoRoot: string): {
  arquivos: string[];
  aviso?: string;
} {
  const versionados = arquivosVersionadosDeEnv(repoRoot);
  if (versionados !== undefined) return { arquivos: versionados };
  return {
    arquivos: varreduraDeEnvExample(repoRoot),
    aviso:
      'git indisponível: a varredura de `.env.example` caiu no filesystem — ' +
      'o escopo medido pode ser menor que o do repo versionado',
  };
}

/** Os `.env.example` versionados — `undefined` quando o git não responde. */
function arquivosVersionadosDeEnv(repoRoot: string): string[] | undefined {
  try {
    const saida = execFileSync(
      'git',
      [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        '*.env.example',
        '*.env.production.example',
      ],
      { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return saida
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
  } catch {
    return undefined;
  }
}

/** A varredura do disco — a reserva, para quando o git não responde. */
function varreduraDeEnvExample(repoRoot: string): string[] {
  const achados: string[] = [];

  const andar = (dir: string): void => {
    let entradas: import('node:fs').Dirent[];
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      if (SKIP_DIRS_DE_ENV.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        andar(full);
        continue;
      }
      if (EXEMPLO_DE_ENV.test(e.name)) {
        achados.push(path.relative(repoRoot, full).split(path.sep).join('/'));
      }
    }
  };

  andar(repoRoot);
  return achados.sort();
}

/** Chaves declaradas em qualquer `.env.example` / `.env.production.example` do repo. */
async function chavesDeEnvExample(
  repoRoot: string,
): Promise<{ chaves: Set<string>; aviso?: string }> {
  const { arquivos, aviso } = arquivosDeEnvExample(repoRoot);
  const out = new Set<string>();
  for (const rel of arquivos) {
    try {
      const raw = await fs.readFile(path.join(repoRoot, rel), 'utf-8');
      for (const linha of raw.split('\n')) {
        const m = linha.match(/^([A-Z][A-Z0-9_]*)=/);
        if (m) out.add(m[1]!);
      }
    } catch {
      // arquivo ilegível: segue para o próximo
    }
  }
  return aviso === undefined ? { chaves: out } : { chaves: out, aviso };
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
    //
    // ⚠️ MAS A 3ª CLASSE NÃO PRECISA DO RUNBOOK: o app e o tooling são CÓDIGO,
    // e a divergência entre eles não depende de nenhum doc. Carregar o skip
    // junto com a 3ª classe seria verde por ausência — MEDIDO: com o runbook
    // ausente e o app e o tooling divergentes, o gate devolvia `ok=true`.
    const errosDoContainer = await checkNomeDoContainer({ repoRoot: root, doc: '' });
    return {
      ok: errosDoContainer.length === 0,
      errors: errosDoContainer,
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
  if (envExamples.chaves.size > 0) {
    for (const k of extrairChavesEnv(doc)) {
      if (!envExamples.chaves.has(k)) {
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

  const advisories = envExamples.aviso === undefined ? [] : [envExamples.aviso];

  return { ok: errors.length === 0, errors, advisories };
}
