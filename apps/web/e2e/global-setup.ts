// apps/web/e2e/global-setup.ts
//
// Bootstrap da suíte e2e: Postgres efêmero → API Nest → build do Next →
// servidor Next. Roda UMA vez, antes de qualquer spec.
//
// ── Por que tudo isso ───────────────────────────────────────────────────────
//
// Um e2e de frontend precisa que browser, Next, Server Action, HTTP e Postgres
// participem do MESMO evento. As suítes que já existiam no repo param antes
// disso: a de componente injeta a Action por prop (nunca fala com a API) e a
// de API fala por `app.inject` (nunca renderiza uma tela). Cada uma é verde
// com uma classe inteira de defeito invisível — o `POST` responde 201, a
// Action mapeia o erro certo, e ainda assim o cadastro não aparece na tela.
//
// ── Por que `next build` e não `next dev` ───────────────────────────────────
//
// `next dev` economiza ~40s (medido) e traz três coisas que esta suíte não
// quer: overlay de erro sobre a tela, avisos de StrictMode, e effects
// duplicados. Esta suíte afirma justamente sobre `startTransition`/`pendente`
// (o botão `Cadastrando…` e os campos travados durante o envio), que é
// exatamente onde StrictMode mora. Fidelidade vale os 40s.
//
// E o build roda em `.next-e2e/`, não em `.next/` — ver o comentário de
// `distDir` em `apps/web/next.config.mjs`. Sem isso, rodar a suíte com o
// `pnpm dev` aberto quebra a app local.
//
// ── Isolamento ──────────────────────────────────────────────────────────────
//
// O Postgres é um container efêmero (Testcontainers), NÃO o banco de dev. O
// banco de desenvolvimento tem dados reais e derrubar/reconstruir por conta
// própria de uma suíte de teste não é uma decisão que um `test:e2e` toma
// sozinho.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// Reuso direto do helper que o e2e de API já usa — o Postgres efêmero, as
// migrations e o prune entre testes. `apps/web` não declara
// `@testcontainers/postgresql` no próprio `package.json`: o import resolve a
// partir do arquivo, dentro de `apps/api`, que tem a dependência. Verificado
// com `pnpm --filter @projeto/web typecheck`.
import { setupTestDatabase, type TestContext } from '../../api/test/testcontainers-helper.js';
import { API_ROOT, WEB_ROOT, apagarEstado, gravarEstado, type EstadoE2E } from './support/estado';
import { portaLivre, esperarTcpAberta } from './support/portas';
import { derrubarFilho } from './support/processos';
import { subirApi } from './support/api';
import { abrirSaidaEmArquivo } from './support/saida';

/** `distDir` do build exclusivo da suíte. Precisa casar com `next.config.mjs`. */
const DIST_DIR_E2E = '.next-e2e';

/** Log por processo — mesmo diretório que a API usa. Ver `support/saida.ts`. */
const DIR_LOG = join(WEB_ROOT, 'node_modules', '.cache', 'e2e-playwright');

/**
 * O contexto fica num global, não no arquivo de estado, porque só este
 * processo tem o `PrismaClient` e o handle do container — os workers da
 * Playwright são processos separados e não enxergam este objeto.
 */
const CHAVE_GLOBAL = '__e2ePlaywrightContexto';

export default async function globalSetup(): Promise<void> {
  const inicio = Date.now();
  const log = (mensagem: string): void => {
    process.stdout.write(`[e2e:setup] ${mensagem}\n`);
  };

  // ── 0. Apagar o estado da execução anterior ───────────────────────────────
  //
  // ⚠️ LIDO 2026-10-08 (revisão da branch): o arquivo era só gravado, nunca
  // removido, e o `globalTeardown` confia nele cegamente — é o que dá no código,
  // não uma medição. O cenário que daí decorre é o `SIGKILL` no processo
  // errado: a execução #1 deixa `apiPid: 4821`; aquele processo morre; semanas
  // depois o PID 4821 pertence ao `pnpm dev` da pessoa. Ela roda `test:e2e`, o
  // setup falha ANTES de gravar o estado novo (basta o `prepararstandalone()` não
  // achar o `server.js`), e o teardown lê o estado VELHO e derruba o grupo
  // `-4821` — derrubando o trabalho de quem está trabalhando.
  //
  // Apagar primeiro transforma esse caminho no mesmo que já é o normal: sem
  // arquivo, o teardown não tem PIDs e não sinaliza ninguém. Precisa ser o
  // PRIMEIRO passo — se viesse depois de `subirApi()`, a janela entre as duas
  // continua aberta.
  apagarEstado();

  // ── 1. Postgres efêmero ────────────────────────────────────────────────────
  //
  // `setupTestDatabase()` roda `prisma migrate deploy` com `cwd:
  // process.cwd()`, e a Playwright roda com cwd em `apps/web` — onde não há
  // `schema.prisma`. O chdir é temporário de propósito: mudar o diretório
  // do processo principal da Playwright pode afetar a resolução de caminhos
  // de specs e reporters.
  log('subindo Postgres efêmero (Testcontainers) e aplicando migrations…');
  const cwdOriginal = process.cwd();
  process.chdir(API_ROOT);
  let ctx: TestContext;
  try {
    ctx = await setupTestDatabase();
  } finally {
    process.chdir(cwdOriginal);
  }
  (globalThis as Record<string, unknown>)[CHAVE_GLOBAL] = ctx;
  const databaseUrl = process.env.DATABASE_URL ?? '';
  log(`Postgres pronto em ${databaseUrl.replace(/:[^:@/]*@/, ':***@')}`);

  // ── 2. API Nest ───────────────────────────────────────────────────────────
  const apiPorta = await portaLivre();
  const apiOrigem = `http://127.0.0.1:${apiPorta}`;
  const apiBaseUrl = `${apiOrigem}/api/v1`;
  log(`subindo API Nest em ${apiOrigem}…`);
  // ⚠️ Este `await` estava fora de QUALQUER `try`, e era a assimetria que o
  // `catch` do `next build` (mais abaixo) não cobre. LIDO 2026-10-08 (revisão
  // da branch): `subirApi` lança em dois casos — a API não fica sadia em 45 s, e
  // o pai `tsx` morre antes disso. O processo da API ela própria já derruba nos
  // dois (`api.ts`), então o que escapa é o resto: o Postgres de pé, e o
  // `estado.json` **não gravado** — o teardown não tem PIDs e o `ctx` global
  // vale num processo que já vai morrer. Um container Postgres por execução que
  // falha.
  const apiFilho = await subirApi({ porta: apiPorta, databaseUrl }).catch(async (erro: unknown) => {
    await encerrar(ctx);
    throw erro;
  });
  log('API respondendo /health.');

  // ── 3. Build do Next ──────────────────────────────────────────────────────
  //
  // `API_BASE_URL` entra no ambiente do build de propósito. A página de
  // listagem lê `process.env.API_BASE_URL` em tempo de REQUEST, então em
  // teoria só o runtime bastaria — mas o Next substitui `process.env.X` por
  // texto no bundle do servidor, e depender dessa semântica para escolher
  // a porta seria descobrir por tentativa e erro. Passar no build funciona
  // nos dois casos.
  log(`rodando \`next build\` em ${DIST_DIR_E2E}/ (≈40s)…`);
  const inicioBuild = Date.now();
  try {
    execFileSync('pnpm', ['exec', 'next', 'build'], {
      cwd: WEB_ROOT,
      stdio: 'inherit',
      env: ambienteDeBuild(apiBaseUrl),
    });
  } catch (erro) {
    // pt-BR: derruba o que já subiu. Um `throw` aqui deixaria o Postgres e a
    // API vivos até o próximo `docker ps` do usuário, sem nenhuma pista de
    // que foram eles.
    await encerrar(apiFilho, ctx);
    throw erro;
  }
  log(`build concluído em ${((Date.now() - inicioBuild) / 1000).toFixed(1)}s.`);

  // ── 4. Servidor Next ──────────────────────────────────────────────────────
  //
  // `node <distDir>/standalone/server.js`, e NÃO `next start`: o `next.config.mjs`
  // declara `output: 'standalone'`, e o Next 15.5 avisa que `next start` não
  // funciona nessa configuração. O caminho standalone é o mesmo que o
  // Dockerfile de produção copia.
  // ⚠️ Este era o ÚNICO ponto do arquivo que lançava FORA de qualquer `try`: o
  // `catch` do `next build` (linhas acima) terminava antes dele, e o `catch` da
  // espera do Next (mais abaixo) começa depois. LIDO 2026-10-08 (revisão da
  // branch): `prepararstandalone()` lança em três casos que nenhuma outra
  // camada pega — `server.js` ausente ou duplicado (mudança de layout do Next) e
  // `distDir` não embutido. Nesse instante: Postgres de pé, API Nest de pé, e
  // `estado.json` não gravado — o teardown retorna cedo em `lerEstado()` e
  // ninguém alcança esses PIDs. Deixava um `src/main.ts` órfão segurando a
  // porta e um container por execução falha.
  const standalone = await prepararComEncerramento(apiFilho, ctx);
  const webPorta = await portaLivre();
  const webUrl = `http://127.0.0.1:${webPorta}`;
  log(`subindo Next standalone em ${webUrl} (${standalone.servidor})…`);
  // pt-BR (2026-10-08): a saída do Next vai para um ARQUIVO, pelo mesmo motivo
  // da API — `saida.ts` traz a medida. Como pipe, o processo morre de `EPIPE`
  // no instante em que o leitor (este `globalSetup`) deixa de existir; como
  // arquivo, ele sobrevive e ainda deixa rastro depois disso.
  const saidaWeb = abrirSaidaEmArquivo(DIR_LOG, 'web');
  const webFilho = spawn(process.execPath, [standalone.servidor], {
    cwd: standalone.raiz,
    // pt-BR (2026-10-08): `detached: true` dá ao servidor Next um PROCESS
    // GROUP próprio, que é o que o `derrubarFilho` sinaliza (`-pid`). Sem isto,
    // `webFilho.pid` NÃO é o id de grupo de ninguém: o `kill(-pid, …)` dava
    // `ESRCH` e caía no `kill(pid, …)` por sorte, não por desenho. A correção
    // certa é tornar o PID o líder — o mesmo que a API já fazia.
    detached: true,
    env: {
      ...process.env,
      PORT: String(webPorta),
      HOSTNAME: '127.0.0.1',
      API_BASE_URL: apiBaseUrl,
      OTEL_SDK_DISABLED: 'true',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', saidaWeb.descritor, saidaWeb.descritor],
  });
  const webPid = webFilho.pid ?? -1;
  saidaWeb.vincular(webPid);
  // pt-BR: o output do servidor é LIDO, e não descartado. Um servidor
  // standalone que morre no boot say nada e deixa a espera estourar por
  // timeout — o sintoma (porta fechada) fica a três passos da causa (a exceção
  // que o Next imprimiu). A leitura é anexada à mensagem de erro por isso.
  const lerSaidaWeb = (): string => saidaWeb.cauda(webPid, 8000);

  try {
    await esperarTcpAberta(webPorta);
    await esperarHttp(`${webUrl}/users`);
  } catch (erro) {
    const causa = erro instanceof Error ? erro.message : String(erro);
    await encerrar(webFilho, apiFilho, ctx);
    throw new Error(
      `O servidor Next (standalone) não respondeu.\n` +
        `Saída do processo (cauda de ${webPid}.log):\n${lerSaidaWeb()}\n` +
        `Erro da espera: ${causa}`,
    );
  }

  // ── 5. Contrato com os workers ────────────────────────────────────────────
  const estado: EstadoE2E = {
    webPorta,
    webUrl,
    apiPorta,
    apiOrigem,
    apiBaseUrl,
    apiPid: apiFilho.pid ?? null,
    webPid: webFilho.pid ?? null,
    databaseUrl,
  };
  gravarEstado(estado);
  log(`pronto em ${((Date.now() - inicio) / 1000).toFixed(1)}s — web ${webUrl}, api ${apiBaseUrl}`);
}

async function esperarHttp(url: string, limiteMs = 60_000): Promise<void> {
  const fim = Date.now() + limiteMs;
  let ultimoErro = 'sem tentativa';
  while (Date.now() < fim) {
    try {
      const resposta = await fetch(url);
      // Qualquer status HTTP serve: o que interessa é que o Next respondeu.
      // Um 500 aqui é defeito da aplicação sob teste e o spec precisa vê-lo.
      if (resposta.status > 0) return;
    } catch (erro) {
      ultimoErro = erro instanceof Error ? erro.message : String(erro);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`esperarHttp(${url}): sem resposta em ${limiteMs}ms — ${ultimoErro}`);
}

/**
 * Derruba o que já subiu, na ordem inversa.
 *
 * pt-BR (2026-10-08): sinaliza o GRUPO, com escalada, e não `kill('SIGKILL')`
 * num PID cru. O `SIGKILL` direto matava o pai e deixava o filho — que é quem
 * segura a porta — vivo e órfão. E `tsx` é justamente isso, dois processos.
 * Ver `e2e/support/processos.ts` para a medição.
 *
 * Este caminho é o `catch` de `subirApi`, o do `next build`, o de
 * `prepararstandalone()` e o da espera do servidor Next — e é ele que roda em
 * TODOS eles QUANDO `estado.json` ainda não existe: `gravarEstado` só acontece
 * no fim, depois de tudo. Um `throw` que escapasse daqui sem derrubar deixaria
 * API e container vivos até o próximo `docker ps`, e o `globalTeardown` não
 * teria estado para ler — ele retorna cedo quando `lerEstado()` falha. Nada mais
 * no processo alcançaria esses PIDs.
 *
 * ⚠️ LIDO 2026-10-08 (revisão da branch): eram **dois** destes quatro que
 * faltavam, e a assimetria é o defeito — o `next build` e a espera do Next já
 * derrubavam, `subirApi` e `prepararstandalone()` não. Um arquivo que é
 * inconsistente entre caminhos de erro não tem "a garantia"; tem a estatística
 * de quantos deles a pessoa lembrou de escrever.
 */
async function encerrar(...processos: (ChildProcess | TestContext)[]): Promise<void> {
  for (const item of processos.reverse()) {
    if ('stop' in item) {
      await item.stop().catch(() => undefined);
    } else {
      await derrubarFilho(item).catch(() => undefined);
    }
  }
}

/**
 * `prepararstandalone()` com o mesmo contrato de `try/catch` dos outros
 * caminhos de erro — jogado para fora porque a função é SÍNCRONA e não aceita
 * `await`, mas a garantia é a mesma: se ela lançar, derruba a API e o Postgres
 * antes de propagar.
 *
 * ⚠️ MEDIDO 2026-10-08: `pnpm turbo run typecheck --filter=@projeto/web` com a
 * primeira tentativa (`prepararstandalone().catch(…)`) devolveu
 * `e2e/global-setup.ts(164,43): error TS2339: Property 'catch' does not exist
 * on type '{ raiz: string; servidor: string; }'`. O sintoma nomeia a linha em
 * segundos; o que ele **não** diz é que o caminho original era um vazamento — e
 * é por isso que o `tsc` é uma barreira e não um detalhe.
 */
async function prepararComEncerramento(
  apiFilho: ChildProcess,
  ctx: TestContext,
): Promise<{ raiz: string; servidor: string }> {
  try {
    return prepararstandalone();
  } catch (erro) {
    await encerrar(apiFilho, ctx);
    throw erro;
  }
}

/**
 * Localiza o `server.js` do output standalone e monta a árvore servível.
 *
 * MEDIDO em 2026-10-08: o caminho NÃO é `.next-e2e/standalone/server.js`, que é
 * onde a documentação e a intuição apontam. Em monorepo, o Next grava o
 * standalone espelhando a partir do `outputFileTracingRoot` — a raiz do repo —
 * então o entrypoint real é `.next-e2e/standalone/apps/web/server.js`. Um `cd`
 * a menos e a suíte morre com `MODULE_NOT_FOUND`, que não nomeia o monorepo.
 *
 * Por isso o caminho é **descoberto** (e a contagem é exigida), nunca escrito.
 * E o `distDir` é lido do próprio `server.js`, porque é lá que o Next o assa
 * (`__NEXT_PRIVATE_STANDALONE_CONFIG`): static e public são procurados em
 * `<raiz>/<distDir>/static` e `<raiz>/public`. O `standalone` não traz esses
 * dois — o Dockerfile de produção os copia por fora, e o mesmo é feito aqui.
 */
function prepararstandalone(): { raiz: string; servidor: string } {
  const base = join(WEB_ROOT, DIST_DIR_E2E, 'standalone');
  const candidatos: string[] = [];
  const varrer = (dir: string, profundidade: number): void => {
    if (profundidade > 3 || candidatos.length > 1) return;
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name === 'server.js') candidatos.push(join(dir, entrada.name));
      // `node_modules` do standalone é a cópia rastreada das dependências: nele
      // há `server.js` de outros pacotes, e um deles seria aceito por engano.
      else if (entrada.isDirectory() && entrada.name !== 'node_modules') {
        varrer(join(dir, entrada.name), profundidade + 1);
      }
    }
  };
  varrer(base, 0);

  if (candidatos.length !== 1) {
    throw new Error(
      `Esperado exatamente 1 server.js em ${base}/ (até 3 níveis, fora de ` +
        `node_modules); encontrados ${candidatos.length}: ` +
        `${candidatos.join(', ') || '(nenhum)'}. ` +
        'Se o Next mudou o layout do output standalone, é aqui que o contrato muda.',
    );
  }

  const servidor = candidatos[0]!;
  const raiz = dirname(servidor);

  const fonte = readFileSync(servidor, 'utf8');
  const distDir = fonte.match(/"distDir":"([^"]*)"/)?.[1]?.replace(/^\.\//, '');
  if (distDir === undefined || distDir === '') {
    throw new Error(
      `Não achei "distDir" na config embutida de ${servidor}. O Next grava ` +
        '`__NEXT_PRIVATE_STANDALONE_CONFIG` no topo do server.js; sem esse campo ' +
        'não há como saber onde o servidor vai procurar `static`.',
    );
  }

  const estatico = join(WEB_ROOT, DIST_DIR_E2E, 'static');
  const destinoEstatico = join(raiz, distDir, 'static');
  cpSync(estatico, destinoEstatico, { recursive: true });

  const publico = join(WEB_ROOT, 'public');
  if (existsSync(publico)) cpSync(publico, join(raiz, 'public'), { recursive: true });

  return { raiz: base, servidor };
}

export { CHAVE_GLOBAL };

/**
 * Ambiente do `next build` — derivado, nunca `...process.env` cru.
 *
 * MEDIDO em 2026-10-08: o build falhava quando era disparado de dentro do
 * `globalSetup` e passava quando o mesmo comando rodava no shell, com as
 * mesmas flags e no mesmo `distDir`. A diferença era o ambiente herdado do
 * processo da Playwright, e o sintoma era
 * `<Html> should not be imported outside of pages/_document` na hora de
 * exportar `/404` — que é o `pages/_document` do próprio Next sendo
 * renderizado sem contexto, num processo que se acredita em modo de
 * desenvolvimento.
 *
 * O que se remove é deliberado e nomeado, não uma lista de bloqueio:
 * `NODE_ENV` (o `next build` decide o próprio modo) e `NODE_PATH` /
 * `npm_*` (configuração de resolução de módulo do launcher do pnpm, que não
 * descreve o build). Um build que só funciona com o ambiente do runner é um
 * build que falha no CI, que roda em outro processo.
 */
function ambienteDeBuild(apiBaseUrl: string): NodeJS.ProcessEnv {
  const ambiente: Record<string, string | undefined> = { ...process.env };
  for (const chave of Object.keys(ambiente)) {
    if (chave === 'NODE_ENV' || chave === 'NODE_PATH' || chave.startsWith('npm_')) {
      delete ambiente[chave];
    }
  }
  return {
    ...ambiente,
    NEXT_DIST_DIR: DIST_DIR_E2E,
    API_BASE_URL: apiBaseUrl,
    // pt-BR: sem isto o `tracing.ts` do web tenta postar web-vitals para
    // um collector inexistente durante o build e em runtime.
    OTEL_SDK_DISABLED: 'true',
    // pt-BR: o tipo declara `NODE_ENV` como obrigatório porque o Next o
    // augmentou; o campo é omitido de propósito, e é esse cast que diz isso
    // em vez de repor a variável que a correção remove.
  } as unknown as NodeJS.ProcessEnv;
}
