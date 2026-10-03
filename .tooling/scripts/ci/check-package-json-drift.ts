import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/**
 * Scripts canônicos que devem existir no `package.json` raiz do template.
 *
 * Mantido sincronizado com o objeto `scripts` canônico definido em
 * `package.json` raiz + convenção `ci-defense-in-depth.md`. Se algum
 * desses for removido/renomeado sem atualizar o array, o CI pega.
 */
const REQUIRED_SCRIPTS = [
  'build',
  'dev',
  'lint',
  'typecheck',
  'test',
  'ci:preflight',
  'ci:local',
] as const;

/**
 * Detecta drift no `package.json` raiz do template/monorepo.
 *
 * Drifts capturados:
 * 1. Arquivo inexistente
 * 2. JSON inválido
 * 3. Scripts canônicos faltando (removidos sem sincronizar a convenção)
 * 4. Scripts "fantasma": comandos que começam com `tsx <path>` apontando
 *    para um arquivo que não existe no `projectRoot`.
 *    (Detecta typos em paths muito comuns — `tooling/scripts/...`,
 *    `.tooling/scripts/...`, etc.)
 * 5. Tasks "fantasma": `turbo run <task>` onde `<task>` não é resolvível
 *    pelo turbo — nem declarada em `turbo.json`, nem presente como script em
 *    algum pacote do workspace.
 *
 * Limitações:
 * - Apenas detecta scripts `tsx <path>` — não cobre `node <path>`,
 *   `sh <path>` ou scripts compostos por `&&`. O escopo cobre os
 *   scripts canônicos que o template usa via `tsx` (preflight,
 *   stack:review, docs:sync).
 * - Não valida que o script tem conteúdo válido além de referenciar
 *   o arquivo — assume shell válido.
 * - A checagem de tasks turbo (5) exige `pnpm-workspace.yaml` legível. Sem
 *   ele, o sub-check é marcado `skipped` em vez de passar em silêncio.
 * - **Só varre o `package.json` raiz.** Task turbo fantasma declarada no
 *   `package.json` de um app (ex.: `apps/web`) escapa:
 *   `pnpm --filter @projeto/web e2e:typo` quebra com o preflight verde.
 *   Os 4 call-sites `pnpm turbo run` do `ci.yml` também não são varridos.
 *   Fechar isso é change próprio.
 */
export async function checkPackageJsonDrift(opts: {
  packageJsonPath: string;
  projectRoot?: string;
}): Promise<CheckResult> {
  const errors: string[] = [];
  const fullPath = path.resolve(opts.packageJsonPath);
  const projectRoot = path.resolve(opts.projectRoot ?? path.dirname(fullPath));

  let raw: string;
  try {
    raw = await fs.readFile(fullPath, 'utf-8');
  } catch (err) {
    return {
      ok: false,
      errors: [`package.json não encontrado em '${fullPath}': ${err}`],
    };
  }

  let parsed: { scripts?: Record<string, string> };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      errors: [`package.json não é JSON válido: ${err}`],
    };
  }

  if (!parsed.scripts || typeof parsed.scripts !== 'object') {
    return {
      ok: false,
      errors: [
        `drift detectado: package.json sem bloco 'scripts' (npm/pnpm não consegue executar tarefas)`,
      ],
    };
  }

  for (const required of REQUIRED_SCRIPTS) {
    if (!(required in parsed.scripts)) {
      errors.push(
        `drift detectado: script canônico '${required}' ausente do package.json (ver convenção ci-defense-in-depth.md)`,
      );
    }
  }

  for (const [name, command] of Object.entries(parsed.scripts)) {
    const tsxPath = extractTsxPath(command);
    if (!tsxPath) continue;
    const resolved = path.resolve(projectRoot, tsxPath);
    try {
      await fs.access(resolved);
    } catch {
      errors.push(
        `drift detectado: script '${name}' referencia 'tsx ${tsxPath}' mas o arquivo não existe em '${resolved}' (script fantasma)`,
      );
    }
  }

  // Drift #5: `turbo run <task>` apontando para task que o turbo não resolve.
  //
  // A §F2-T7 removeu `tdd:check` do `turbo.json` mas deixou o script
  // `"tdd:check": "turbo run tdd:check"` no package.json — e o comando
  // passou a falhar com EXIT=1 enquanto todo o resto reportava verde. O
  // check acima não via nada disso: ele só valida `tsx <path>`.
  //
  // Invariante: `turbo run <task>` só resolve se a task **estiver declarada em
  // `turbo.json` E algum pacote do workspace tiver um script com esse nome**.
  // As duas metades são medidas em turbo 2.11.2, e as duas já falharam aqui:
  //
  // - `openapi:export` é script de `apps/api` e não está no `turbo.json` →
  //   "Could not find task `openapi:export` in project". Declarar não basta.
  // - `tdd:check` no `main` **estava** no `turbo.json` e nenhum dos 6 pacotes a
  //   implementava → a mesma resposta. Estar declarada não basta.
  //
  // Erro nas duas direções custa caro: aceitar a task órfã é o gate que
  // reporta verde; acusar uma task legítima é o gate que trava o push errado.
  const turboSkip = await collectUnresolvableTurboTasks(projectRoot, parsed.scripts);
  if (turboSkip.reason) {
    return {
      ok: errors.length === 0,
      errors,
      skipped: true,
      reason: turboSkip.reason,
    };
  }
  errors.push(...turboSkip.unresolvable.map((t) => t.error));

  return { ok: errors.length === 0, errors };
}

/**
 * Varre os scripts à procura de `turbo run <tasks…>` e devolve as tasks que o
 * turbo não conseguiria resolver.
 *
 * Retorna `{ reason }` (e nenhuma task) quando o check não tem como rodar —
 * hoje, quando `pnpm-workspace.yaml` está ausente ou tem formato inesperado.
 */
async function collectUnresolvableTurboTasks(
  projectRoot: string,
  scripts: Record<string, string>,
): Promise<{ unresolvable: { task: string; error: string }[]; reason?: string }> {
  const referenced: { script: string; task: string }[] = [];
  for (const [name, command] of Object.entries(scripts)) {
    for (const task of extractTurboRunTasks(command)) {
      referenced.push({ script: name, task });
    }
  }
  if (referenced.length === 0) return { unresolvable: [] };

  const packageScripts = await readWorkspaceScriptNames(projectRoot);
  if (!packageScripts) {
    return {
      unresolvable: [],
      reason:
        'validação de `turbo run <task>` não rodou: pnpm-workspace.yaml ausente ou com formato não suportado — tasks implícitas de pacote não puderam ser resolvidas',
    };
  }

  const declared = await readTurboTaskNames(projectRoot);
  const declaredSet = new Set(declared);

  const unresolvable: { task: string; error: string }[] = [];
  for (const { script, task } of referenced) {
    // Conjunção, e não disjunção. Medido em turbo 2.11.2:
    //   - `openapi:export` é script de `apps/api` e NÃO está no turbo.json →
    //     `turbo run openapi:export` responde "Could not find task in project".
    //     Estar em `turbo.json` é condição necessária.
    //   - `tdd:check` no `main` ESTAVA no turbo.json e nenhum pacote a tinha →
    //     mesma resposta. Estar em `turbo.json` não é condição suficiente.
    // A chave `tasks` é a porta de entrada do `turbo run`; o turbo então
    // procura nos pacotes do workspace um script com aquele nome. Faltando um
    // dos dois lados, o comando quebra.
    if (declaredSet.has(task) && packageScripts.has(task)) continue;
    const falta = !declaredSet.has(task)
      ? 'não está declarada em turbo.json'
      : 'está declarada em turbo.json mas nenhum pacote do workspace a implementa';
    unresolvable.push({
      task,
      error: `drift detectado: script '${script}' roda 'turbo run ${task}' mas a task '${task}' ${falta} (task fantasma)`,
    });
  }
  return { unresolvable };
}

/** Nomes das tasks declaradas em `turbo.json` (vazio se o arquivo não existir). */
async function readTurboTaskNames(projectRoot: string): Promise<string[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(projectRoot, 'turbo.json'), 'utf-8');
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as { tasks?: Record<string, unknown> };
    return Object.keys(parsed.tasks ?? {});
  } catch {
    return [];
  }
}

/**
 * Union dos nomes de script de todos os pacotes do workspace.
 *
 * Devolve `null` — nunca um conjunto vazio — quando os pacotes não podem ser
 * enumerados. Um `Set` vazio seria indistinguível de "workspace sem scripts",
 * que é a condição em que todo `turbo run` acusaria drift.
 */
async function readWorkspaceScriptNames(projectRoot: string): Promise<Set<string> | null> {
  let yaml: string;
  try {
    yaml = await fs.readFile(path.join(projectRoot, 'pnpm-workspace.yaml'), 'utf-8');
  } catch {
    return null;
  }
  const globs = parseWorkspaceGlobs(yaml);
  if (!globs) return null;

  const names = new Set<string>();
  for (const glob of globs) {
    // Só a forma `dir/*` é suportada. Qualquer outra (nested, negação,
    // variável) devolve null em vez de ser interpretada pela metade.
    const match = /^(.+)\/\*$/.exec(glob);
    if (!match) return null;
    const parentDir = path.join(projectRoot, match[1]);
    let entries;
    try {
      entries = await fs.readdir(parentDir, { withFileTypes: true });
    } catch {
      continue; // glob sem correspondência é normal; o turbo também ignora.
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const pkgRaw = await fs.readFile(path.join(parentDir, entry.name, 'package.json'), 'utf-8');
        const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
        for (const scriptName of Object.keys(pkg.scripts ?? {})) names.add(scriptName);
      } catch {
        // Diretório sem package.json legível não é pacote.
      }
    }
  }
  return names;
}

/**
 * Lê a lista `packages:` do `pnpm-workspace.yaml` sem depender de parser YAML.
 *
 * Aceita **apenas** o formato de lista simples sob a chave `packages:` e
 * devolve `null` em qualquer outra forma. Um parser parcial que "funciona" na
 * maioria dos casos é pior que nenhum: passa a falhar em silêncio quando o
 * formato muda.
 */
function parseWorkspaceGlobs(yaml: string): string[] | null {
  const globs: string[] = [];
  let insidePackages = false;
  let sawPackagesKey = false;

  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').replace(/\s+$/, '');
    if (line.trim() === '') continue;

    if (!/^\s/.test(line)) {
      // Chave de topo. Só `packages:` interessa; qualquer outra invalida.
      if (/^packages:\s*$/.test(line)) {
        insidePackages = true;
        sawPackagesKey = true;
      } else {
        if (sawPackagesKey && !insidePackages) return null;
        insidePackages = false;
      }
      continue;
    }

    if (!insidePackages) continue;
    const item = /^\s+-\s*['"]?([^'"]+?)['"]?\s*$/.exec(line);
    if (!item) return null;
    globs.push(item[1]);
  }

  return globs.length > 0 ? globs : null;
}

/**
 * Extrai o primeiro path após `tsx` ou `pnpm tsx` em uma string de
 * comando. Retorna `null` se o comando não casa esses padrões.
 *
 * @example extractTsxPath('tsx .tooling/scripts/foo.ts') → '.tooling/scripts/foo.ts'
 * @example extractTsxPath('pnpm tsx tooling/scripts/foo.ts') → 'tooling/scripts/foo.ts'
 * @example extractTsxPath('echo hello && pnpm tsx tooling/x.ts') → 'tooling/x.ts'
 */
function extractTsxPath(command: string): string | null {
  const tsxRegex = /tsx\s+([^\s|&;]+)/;
  const match = tsxRegex.exec(command);
  return match ? match[1] : null;
}

/**
 * Extrai as tasks de **todos** os `turbo run` de um comando.
 *
 * Quatro armadilhas que o parser anterior caiu, todas cobertas por spec:
 *
 * 1. `exec` sem `/g` só acha a **primeira** ocorrência — em
 *    `turbo run lint && turbo run nao-existe` a task fantasma do segundo
 *    segmento nunca era vista.
 * 2. Separadores **colados** (`clean&&rm`) não casam com o token exato
 *    `&&` e não começam com `-`, então viravam task — e bloqueavam o push
 *    com um erro falso.
 * 3. `turbo run` **dentro de aspas** (`echo 'turbo run lint'`) não é
 *    invocação; sem remover aspas antes, vira task.
 * 4. **Redirect de shell** (`turbo run build > build.log`): `>` e `build.log`
 *    viravam tasks fantasma. Mesmo modo de falha do item 2 — erro falso
 *    bloqueando push — e preexistente nas duas versões do parser.
 *
 * A estratégia é segmentar por separador de shell, achar `turbo run` dentro
 * de cada segmento e tomar os tokens não-flag até o fim do segmento ou até o
 * primeiro redirect, o que vier antes.
 *
 * @example extractTurboRunTasks('turbo run build') → ['build']
 * @example extractTurboRunTasks('pnpm turbo run lint typecheck --filter=@x') → ['lint', 'typecheck']
 * @example extractTurboRunTasks('turbo run clean && rm -rf dist') → ['clean']
 */
/**
 * `&>` é operador de redirect (bash/ksh), não separador de comandos.
 *
 * O segmentador abaixo quebra em `&`, o que faz `turbo run build &>a.log ALVO`
 * virar dois segmentos e perder `ALVO` — que o turbo real trata como task.
 * Substituído por um sentinela antes de segmentar, e o sentinela volta a ser
 * lido como operador em `classifyToken`. Medido: com `&` solto, turbo vê
 * `build` e `ALVO`; com `&>` solto, idem.
 */
const BOTH_STREAMS = '\u0000';

export function extractTurboRunTasks(command: string): string[] {
  // Remove o conteúdo entre aspas antes de procurar `turbo run`.
  const unquoted = command.replace(/'[^']*'|"[^"]*"/g, ' ');
  // `&` que é parte de um operador de redirect deixa de parecer separador.
  // São duas formas: `&>file` / `&>>file` (o `&` antecede `>`) e `2>&1` /
  // `2>&-` (o `&` segue `>`). Precisa vir ANTES da segmentação, senão o
  // segmentador corta no `&` e perde as tasks seguintes — medido: o turbo
  // real trata `ALVO` como task em `turbo run build 2>&1 ALVO`.
  const protectedCmd = unquoted.replace(/&>/g, BOTH_STREAMS).replace(/>&/g, `>${BOTH_STREAMS}`);

  const tasks: string[] = [];
  const segment = /(?:^|[|&;])[^|&;]*?\bturbo\s+run\s+([^|&;]*)/g;
  for (const match of protectedCmd.matchAll(segment)) {
    // Operador sem alvo colado consome a PRÓXIMA palavra como arquivo.
    let nextIsRedirectTarget = false;
    for (const token of (match[1] ?? '').trim().split(/\s+/)) {
      if (token === '') continue;
      if (nextIsRedirectTarget) {
        nextIsRedirectTarget = false;
        continue;
      }
      if (token.startsWith('-')) continue;
      const { task, bare } = classifyToken(token);
      if (task !== null) tasks.push(task);
      if (bare) nextIsRedirectTarget = true;
    }
  }
  return tasks;
}

/**
 * Classifica um token: ele é task, redirect completo, ou operador nu?
 *
 * A regra real, medida contra o turbo 2.11.2: **redirect nunca encerra a lista
 * de tasks.** O que encerra a lista é o operador, e só porque ele é a coisa
 * inteira — em `turbo run build >out.log ALVO`, o shell remove da lista de
 * palavras o operador e o seu operando, e as palavras em volta continuam
 * argumentos. `ALVO` é task, e o turbo de fato a rejeita.
 *
 * Três formas, e a distinção está no que vem **depois** do operador:
 *
 * | token          | prefixo  | depois do op | leitura                          |
 * |----------------|----------|--------------|----------------------------------|
 * | `build>log`    | `build`  | `log`        | task `build` + redirect completo |
 * | `2>/dev/null`  | `2` (fd) | `/dev/null`  | redirect completo, sem task      |
 * | `build > ALVO` | `build`  | (vazio)      | task `build`, `ALVO` é o alvo   |
 *
 * O sentinela de `&>` entra aqui como mais um operador.
 *
 * Histórico, porque as duas primeiras versões erraram e a forma do erro
 * importa: a original vazava `2>/dev/null` como task (exigia
 * `/^[\d<>&]+$/`, que pegava as formas raras e perdia as comuns). A segunda
 * corrigiu isso com `/[<>]/.test(token)` e passou a cortar a task colada ao
 * redirect. A terceira é esta. **Todas as três tinham spec verde** — o que
 * faltava era evidência vinda do sistema real, não mais spec escrito a partir
 * das formas que eu já tinha em mente. Ver `turbo-redirect-differential.sh`.
 */
function classifyToken(token: string): { task: string | null; bare: boolean } {
  const chars = [...token];
  const idx = chars.findIndex((c) => c === '<' || c === '>' || c === BOTH_STREAMS);
  if (idx === -1) return { task: token, bare: false };

  // O prefixo é task quando não é descriptor de arquivo, o `&` do `&>`, ou vazio.
  const prefix = token.slice(0, idx);
  const isTask = prefix !== '' && !/^\d+$/.test(prefix) && prefix !== '&';

  // O que sobra depois do operador é o alvo. `>>` tem o `>` duplo colado.
  let rest = token.slice(idx + 1);
  if (rest.startsWith('>')) rest = rest.slice(1);

  // Alvo vazio = operador nu: o operando é a PRÓXIMA palavra, não a atual.
  return { task: isTask ? prefix : null, bare: rest === '' };
}
