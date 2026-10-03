import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkPackageJsonDrift, extractTurboRunTasks } from './check-package-json-drift';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('checkPackageJsonDrift', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pkg-drift-test-'));
  });

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  /**
   * Cria um workspace mínimo: `pnpm-workspace.yaml` + `turbo.json` + 1 pacote.
   *
   * Sem isso o check se declara `skipped` e volta `ok: true` **sem verificar
   * nada** — foi exatamente assim que o fixture `valid` passou carregando duas
   * tasks fantasma. Todo teste positivo precisa de workspace, e precisa
   * afirmar `skipped` falsy, senão "verde" volta a significar "não olhei".
   */
  async function makeWorkspace(
    dir: string,
    opts: { turboTasks: string[]; packageScripts: string[] },
  ): Promise<void> {
    await fs.mkdir(path.join(dir, 'apps', 'api'), { recursive: true });
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    await fs.writeFile(
      path.join(dir, 'turbo.json'),
      JSON.stringify({ tasks: Object.fromEntries(opts.turboTasks.map((t) => [t, {}])) }),
    );
    await fs.writeFile(
      path.join(dir, 'apps', 'api', 'package.json'),
      JSON.stringify({
        name: '@projeto/api',
        scripts: Object.fromEntries(opts.packageScripts.map((s) => [s, 'echo ok'])),
      }),
    );
  }

  it('deve passar quando package.json tem todos os scripts canônicos', async () => {
    const dir = path.join(tmpRoot, 'valid');
    await fs.mkdir(dir, { recursive: true });
    // Toda task referenciada aparece nos dois lados: declarada em turbo.json E
    // implementada por um pacote. É o formato do repo real.
    await makeWorkspace(dir, {
      turboTasks: ['build', 'dev', 'lint', 'typecheck', 'test'],
      packageScripts: ['build', 'dev', 'lint', 'typecheck', 'test'],
    });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'turbo run dev',
          lint: 'turbo run lint',
          typecheck: 'turbo run typecheck',
          test: 'turbo run test',
          'ci:preflight': 'echo ok',
          'ci:local': 'pnpm ci:preflight && pnpm stack:review && turbo run lint typecheck',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    // O ponto do assert: `ok: true` aqui significa "verifiquei e passou",
    // não "não tinha o que verificar".
    expect(result.skipped).toBeFalsy();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('deve falhar se faltar script canônico crítico (ci:preflight)', async () => {
    const dir = path.join(tmpRoot, 'missing');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          'ci:local': 'echo local',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('ci:preflight'))).toBe(true);
  });

  it('deve falhar se package.json for JSON inválido', async () => {
    const dir = path.join(tmpRoot, 'bad-json');
    await fs.mkdir(dir, { recursive: true });
    const p = path.join(dir, 'package.json');
    await fs.writeFile(p, '{ broken: }');

    const result = await checkPackageJsonDrift({ packageJsonPath: p });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('json'))).toBe(true);
  });

  it('deve falhar se um script referenciar um arquivo inexistente (script fantasma)', async () => {
    const dir = path.join(tmpRoot, 'phantom');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          'ci:preflight': 'tsx .tooling/scripts/ci/preflight.ts',
          'ci:local': 'echo local',
          'tdd:check': 'tsx tooling/scripts/this-file-does-not-exist.ts',
        },
      }),
    );

    const result = await checkPackageJsonDrift({
      packageJsonPath: path.join(dir, 'package.json'),
      projectRoot: dir,
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes('script fantasma') && e.includes('this-file-does-not-exist.ts'),
      ),
    ).toBe(true);
  });

  it('deve falhar se um script `turbo run <task>` apontar para task inexistente', async () => {
    const dir = path.join(tmpRoot, 'turbo-phantom');
    await fs.mkdir(dir, { recursive: true });
    await makeWorkspace(dir, { turboTasks: ['build', 'lint'], packageScripts: ['build'] });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'echo dev',
          lint: 'echo lint',
          typecheck: 'echo tc',
          test: 'echo test',
          'ci:preflight': 'echo ok',
          'ci:local': 'echo local',
          'tdd:check': 'turbo run tdd:check',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.skipped).toBeFalsy();
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("'tdd:check'") && e.includes('turbo'))).toBe(true);
  });

  it('deve falhar se a task estiver no turbo.json mas nenhum pacote a implementar', async () => {
    // Este é o bug real que o check existe para pegar: no `main`, `tdd:check`
    // ESTAVA declarada em turbo.json — mas nenhum dos 6 pacotes tinha um script
    // com esse nome, e o turbo responde "Could not find task in project".
    // Declarar a task não é o bastante: o turbo precisa de alguém que a
    // implemente. Um check que aceitasse só a declaração passaria no estado
    // quebrado.
    const dir = path.join(tmpRoot, 'turbo-declarada-sem-dono');
    await fs.mkdir(dir, { recursive: true });
    await makeWorkspace(dir, {
      turboTasks: ['build', 'lint', 'tdd:check'],
      packageScripts: ['build', 'lint'],
    });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'echo dev',
          lint: 'turbo run lint',
          typecheck: 'echo tc',
          test: 'echo test',
          'ci:preflight': 'echo ok',
          'ci:local': 'turbo run tdd:check',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.skipped).toBeFalsy();
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("'tdd:check'") && e.includes('turbo'))).toBe(true);
  });

  it('deve falhar se a task fantasma vier com redirect COLADO no script', async () => {
    // End-to-end do achado da rodada 4. Mesmo estado quebrado do spec acima
    // (`tdd:check` declarada no turbo.json, sem pacote que a implemente), mas
    // escrito como `turbo run tdd:check>out.log`. Com o guard antigo, o token
    // inteiro era lido como redirect: `extractTurboRunTasks` devolvia `[]`, o
    // caller caía em `referenced.length === 0` e **pulia o script inteiro**,
    // sem erro e sem marcador de `skipped`. O gate ficava verde sobre uma task
    // fantasma — silenciosamente, que é o pior jeito.
    const dir = path.join(tmpRoot, 'turbo-fantasma-com-redirect');
    await fs.mkdir(dir, { recursive: true });
    await makeWorkspace(dir, {
      turboTasks: ['build', 'lint', 'tdd:check'],
      packageScripts: ['build', 'lint'],
    });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'echo dev',
          lint: 'turbo run lint',
          typecheck: 'echo tc',
          test: 'echo test',
          'ci:preflight': 'echo ok',
          'ci:local': 'turbo run tdd:check>out.log',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.skipped).toBeFalsy();
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("'tdd:check'") && e.includes('turbo'))).toBe(true);
  });

  it('deve falhar se a task for script de pacote mas não estiver no turbo.json', async () => {
    // O erro simétrico — e o que a versão anterior deste check cometia: ela
    // aceitava QUALQUER script de pacote como resolvível. Medido no repo real:
    // `openapi:export` é script de `apps/api`, não está no `turbo.json`, e
    // `npx turbo run openapi:export` responde "Could not find task in project".
    // A chave `tasks` é a porta de entrada; o turbo não adivinha script.
    const dir = path.join(tmpRoot, 'turbo-implicit');
    await fs.mkdir(dir, { recursive: true });
    await makeWorkspace(dir, {
      turboTasks: ['build', 'lint'],
      packageScripts: ['build', 'lint', 'openapi:export'],
    });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'echo dev',
          lint: 'turbo run lint',
          typecheck: 'echo tc',
          test: 'echo test',
          'ci:preflight': 'echo ok',
          'ci:local': 'turbo run openapi:export',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.skipped).toBeFalsy();
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("'openapi:export'"))).toBe(true);
  });

  it('deve extrair todas as tasks de `turbo run a b c --filter=x` e parar em &&', async () => {
    const dir = path.join(tmpRoot, 'turbo-multi');
    await fs.mkdir(dir, { recursive: true });
    await makeWorkspace(dir, {
      turboTasks: ['build', 'lint', 'typecheck'],
      packageScripts: ['build', 'lint', 'typecheck'],
    });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'echo dev',
          lint: 'turbo run lint',
          typecheck: 'echo tc',
          test: 'echo test',
          'ci:preflight': 'echo ok',
          // `typecheck` existe, `nao-existe` nao -> erro. O `&& rm -rf` depois
          // nao deve ser lido como task.
          'ci:local': 'pnpm turbo run build typecheck nao-existe --filter=@x && rm -rf dist',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.skipped).toBeFalsy();
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("'nao-existe'"))).toBe(true);
    expect(result.errors.some((e) => e.includes('rm -rf'))).toBe(false);
  });

  it('deve declarar skipped quando o workspace não tem pnpm-workspace.yaml', async () => {
    // Sem lista de pacotes não dá para resolver task implícita. Falhar aqui
    // seria erro falso; passar em silêncio seria gate que não pode falhar.
    const dir = path.join(tmpRoot, 'turbo-no-workspace');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'echo dev',
          lint: 'echo lint',
          typecheck: 'echo tc',
          test: 'echo test',
          'ci:preflight': 'echo ok',
          'ci:local': 'echo local',
          'tdd:check': 'turbo run tdd:check',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/pnpm-workspace\.yaml/);
  });

  it('deve aceitar scripts não-arquivo (comandos compostos via pnpm/&&)', async () => {
    const dir = path.join(tmpRoot, 'composite');
    await fs.mkdir(dir, { recursive: true });
    await makeWorkspace(dir, {
      turboTasks: ['build', 'dev', 'lint', 'typecheck', 'test'],
      packageScripts: ['build', 'dev', 'lint', 'typecheck', 'test'],
    });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'turbo run dev',
          lint: 'turbo run lint',
          typecheck: 'turbo run typecheck',
          test: 'turbo run test',
          'ci:local': 'pnpm ci:preflight && pnpm stack:review && turbo run build',
          'ci:preflight': 'echo ok',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.skipped).toBeFalsy();
    expect(result.ok).toBe(true);
  });
});

describe('extractTurboRunTasks', () => {
  it('redirect nomeia arquivo sem encerrar a lista de tasks', () => {
    // Mesmo defeito do separador colado, outra classe: `>` e `log.txt` viravam
    // tasks fantasma e bloqueavam o push com erro falso. O reviewer mediu que
    // nenhum `package.json` do repo usa isso hoje — risco latente, nao ativo.
    expect(extractTurboRunTasks('turbo run build > build.log')).toEqual(['build']);
    expect(extractTurboRunTasks('turbo run build >> out/build.log')).toEqual(['build']);
    expect(extractTurboRunTasks('turbo run lint 2>&1')).toEqual(['lint']);
    expect(extractTurboRunTasks('turbo run a b > x.log && turbo run c')).toEqual(['a', 'b', 'c']);
  });

  it('cobre a forma comum do redirect, não só a forma nua', () => {
    // O guard anterior exigia token composto SÓ de dígito/`<`/`>`/`&`. No
    // instante em que o redirect nomeia o alvo — que é a forma mais comum em
    // script real — o token ganha `/` e letras, o anchor falha, e o nome do
    // arquivo vira task fantasma. `2>/dev/null` é shell válido: o turbo
    // resolve os pacotes normalmente e o shell consome o redirect.
    expect(extractTurboRunTasks('turbo run build 2>/dev/null')).toEqual(['build']);
    expect(extractTurboRunTasks('turbo run build 1>/dev/null')).toEqual(['build']);
    expect(extractTurboRunTasks('turbo run build >/dev/null')).toEqual(['build']);
    expect(extractTurboRunTasks('turbo run build >/dev/null 2>&1')).toEqual(['build']);
    expect(extractTurboRunTasks('turbo run build >log.txt')).toEqual(['build']);
    expect(extractTurboRunTasks('turbo run build 2>errors.log')).toEqual(['build']);
    // Esta asserção sozinha NÃO prova o guard de `&>`: sem ele, o segmentador
    // corta no `&` e o resultado ainda é `['build']` — verde pelo motivo
    // errado. O guard é provado pelo caso `&>a.log ALVO`, em que sem ele a
    // task `ALVO` se perde. Medido por mutação: remover o guard deixa
    // vermelho só a spec 'palavra depois de redirect ESPACADO continua
    // sendo task', e esta linha continua verde.
    expect(extractTurboRunTasks('turbo run build &>all.log')).toEqual(['build']);
    // Composto: o `&&` seguinte segue como comando, e a lista não foi truncada.
    expect(extractTurboRunTasks('turbo run build 2>/dev/null && echo done')).toEqual(['build']);
  });

  it('não corta task legítima que por acaso carrega pontuação de nome', () => {
    // O guard broadened precisa rejeitar o redirect sem criar o erro oposto:
    // nome de task real contém `:`, `.`, `/`, `@` e `+`, nunca `<` ou `>`.
    for (const task of [
      'build',
      'test:coverage',
      'db:generate',
      'build:prod',
      'a.b',
      'ci:quality',
      'test:e2e',
    ]) {
      expect(extractTurboRunTasks(`turbo run ${task}`)).toEqual([task]);
    }
  });

  it('não perde a task quando o redirect vem COLADO nela, sem espaço', () => {
    // `turbo run build>log.txt` é shell válido: a task é `build`, o redirect
    // é `>log.txt`. O guard via o token inteiro e quebra antes de registrar
    // `build`, devolvendo `[]` — e lista vazia faz o caller pular o script
    // inteiro em silêncio (`referenced.length === 0`), sem marcador de
    // `skipped`. Task fantasma escrita assim escaparia do check: gate que para
    // de gatear, e parece verde.
    expect(extractTurboRunTasks('turbo run build>log.txt')).toEqual(['build']);
    expect(extractTurboRunTasks('turbo run test>out')).toEqual(['test']);
    expect(extractTurboRunTasks('turbo run lint 2>err.log')).toEqual(['lint']);
    expect(extractTurboRunTasks('turbo run build>build.log 2>&1')).toEqual(['build']);
  });

  it('separa task colada de redirect puro pelo prefixo, não pelo token inteiro', () => {
    // O que distingue `build>log.txt` (task + redirect) de `2>/dev/null`
    // (redirect puro) é o PREFIXO antes do primeiro `<`/`>`: task real é
    // `build`; descriptor de file descriptor é `2`; o token `&` de `&>file`
    // é `&`. Os três precisam sair pelo caminho certo.
    for (const puro of [
      '>log.txt',
      '>>log.txt',
      '2>/dev/null',
      '1>/dev/null',
      '2>&1',
      '&>all.log',
    ]) {
      expect(extractTurboRunTasks(`turbo run build ${puro}`)).toEqual(['build']);
    }
  });

  it('palavra depois de redirect ESPACADO continua sendo task', () => {
    // Toda a primeira geração de specs cobriu a forma COLADA e parou nela. A
    // forma espacada — `turbo run build >out.log ALVO` — é a mais comum, e o
    // parser fazia `break` no redirect, descartando `ALVO` em silêncio.
    //
    // Estas expectativas NÃO saíram da imaginação: cada linha foi medida
    // contra o turbo 2.11.2 real, num workspace onde `turbo.json.tasks` é
    // `{}` — assim toda palavra que o turbo trata como task aparece em
    // "Could not find task". O script que produz a tabela está em
    // `.tooling/scripts/ci/turbo-redirect-differential.sh`.
    expect(extractTurboRunTasks('turbo run build >out.log ALVO')).toEqual(['build', 'ALVO']);
    expect(extractTurboRunTasks('turbo run build 2>err ALVO')).toEqual(['build', 'ALVO']);
    expect(extractTurboRunTasks('turbo run build 2>&1 ALVO')).toEqual(['build', 'ALVO']);
    expect(extractTurboRunTasks('turbo run build &>a.log ALVO')).toEqual(['build', 'ALVO']);
    expect(extractTurboRunTasks('turbo run build >>log ALVO')).toEqual(['build', 'ALVO']);
    expect(extractTurboRunTasks('turbo run build <in.txt ALVO')).toEqual(['build', 'ALVO']);
    expect(extractTurboRunTasks('turbo run build >out.log build2 ALVO')).toEqual([
      'build',
      'build2',
      'ALVO',
    ]);
  });

  it('operador NU consome a próxima palavra como alvo, e só ele', () => {
    // O complemento do spec anterior. Um operador sem alvo colado
    // (`>`, `2>`, `&>`) tem o operando na palavra seguinte — então essa
    // palavra é arquivo, não task. Medido nos dois sentidos:
    //   `build > ALVO`     -> turbo só viu `build`; ALVO virou o arquivo
    //   `build 2> ALVO`    -> idem
    //   `build 2>err ALVO` -> turbo viu `build` E `ALVO`
    expect(extractTurboRunTasks('turbo run build > ALVO')).toEqual(['build']);
    expect(extractTurboRunTasks('turbo run build 2> ALVO')).toEqual(['build']);
    expect(extractTurboRunTasks('turbo run build > build.log')).toEqual(['build']);
  });

  it('cobre os três @example do JSDoc de extractTurboRunTasks', () => {
    // O JSDoc afirma estes três; sem spec, uma refatoração pode quebrá-los em
    // silêncio e o próximo leitor acredita no exemplo.
    expect(extractTurboRunTasks('turbo run build')).toEqual(['build']);
    expect(extractTurboRunTasks('pnpm turbo run lint typecheck --filter=@x')).toEqual([
      'lint',
      'typecheck',
    ]);
    expect(extractTurboRunTasks('turbo run clean && rm -rf dist')).toEqual(['clean']);
  });

  it('acha o `turbo run` de um segmento posterior, não só o primeiro', () => {
    // `exec` com regex sem /g para na 1ª ocorrência: a task fantasma do 2º
    // segmento nunca era vista, e o check ficava verde.
    expect(extractTurboRunTasks('turbo run lint && turbo run nao-existe')).toEqual([
      'lint',
      'nao-existe',
    ]);
  });

  it('para no separador colado, sem espaços', () => {
    // `clean&&rm` não é token exato de separador nem começa com `-`:
    // viraria "task fantasma" e bloquearia o push.
    expect(extractTurboRunTasks('turbo run clean&&rm -rf dist')).toEqual(['clean']);
  });

  it('ignora `turbo run` que está dentro de aspas', () => {
    expect(extractTurboRunTasks("echo 'turbo run nao-existe'")).toEqual([]);
    expect(extractTurboRunTasks('echo "turbo run nao-existe"')).toEqual([]);
  });

  it('trata argumento ENTRE aspas como task literal, não como redirect', () => {
    // Medido contra o turbo 2.11.2, com a task `a<b` declarada no turbo.json E
    // implementada por apps/p:
    //
    //   turbo run a<b      -> shell faz `<b` ser input redirect; turbo só vê `a`
    //   turbo run "a<b"    -> aspas protegem o operador; turbo EXECUTA `a<b`
    //
    // A remoção de aspas do comando inteiro apagava essa distinção e devolvia
    // `[]`: task real sumindo do gate. Falso negativo, que é o modo de falha
    // mais caro — o gate reporta que não há o que verificar.
    expect(extractTurboRunTasks('turbo run "a<b"')).toEqual(['a<b']);
    expect(extractTurboRunTasks("turbo run 'a<b'")).toEqual(['a<b']);
    // Sem aspas continua sendo redirect — a forma é a mesma, muda o quoting.
    expect(extractTurboRunTasks('turbo run a<b')).toEqual(['a']);
    // E o conteúdo entre aspas é UM argumento só, mesmo com espaço dentro.
    expect(extractTurboRunTasks('turbo run "lint typecheck"')).toEqual(['lint typecheck']);
  });
});
