// apps/web/e2e/support/api.ts
//
// Ciclo de vida do processo da API Nest durante a suíte e2e.
//
// pt-BR: a suíte sobe o `src/main.ts` de verdade, não um `app.init()` de
// teste. Motivo: `init()` não binda porta — o helper
// `apps/api/test/e2e/test-app.helper.ts` existe para `app.inject()`, que fala
// pelo Fastify sem TCP. Um browser não faz `inject`; ele abre socket. Logo o
// caminho fiel é o bootstrap de produção, que também exercita o que o
// `inject` não exercita: `enableCors`, `listen`, `enableShutdownHooks` e o
// wiring do Pino.
//
// Onde `tsx`: o binário vive na RAIZ do monorepo (`package.json` declara
// `tsx` como devDependency da raiz, não de `apps/api`). O wrapper `.bin/tsx`
// é um `sh` que termina em `exec`, então o PID que `spawn` devolve já é o do
// Node — matar esse PID derruba o servidor, sem processo órfão segurando a
// porta. Foi por isso que se usa o binário e não um `pnpm exec`: `pnpm exec`
// introduz um processo no meio e o `SIGTERM` nele deixa o Node vivo.
//
// MEDIDO em 2026-10-08, e este comentário é incompleto sem o dado: o `tsx` são
// DOIS processos. `spawn` devolve o pai (`node …/tsx/dist/cli.mjs src/main.ts`)
// e ele FORKA um filho (`node --require …/tsx/dist/preflight.cjs …`) que é quem
// de fato executa `main.ts` e segura a porta. A boa notícia é que o pai
// encaminha o `SIGTERM`: matar o pai derruba o filho junto, medido. A
// consequência prática é outra — `filho.pid` NÃO identifica o processo que
// está com a porta, e é por isso que cada instância tem log próprio (ver `anexarLog`)
// e que a suíte não pode confiar em "o processo com este PID é o servidor".

import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { API_ROOT, WEB_ROOT, exigirEstado, gravarEstado } from './estado';
import { derrubarFilho, derrubarGrupo } from './processos';
import { esperarTcpAberta, portaFechouDentroDe } from './portas';
import { abrirSaidaEmArquivo } from './saida';

const REPO_ROOT = join(API_ROOT, '..', '..');
const BIN_TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

/**
 * Onde a saída da API é gravada, por processo.
 *
 * pt-BR: MEDIDO em 2026-10-08 — a API morria no meio da suíte (todos os specs
 * seguintes levavam `ECONNREFUSED`) e o sintoma, sozinho, não dizia nada: o
 * processo podia ter sido sinalizado, ter estourado, ou o drain do Prisma
 * poderia ter derrubado o socket. A causa estava no `stdio` — ver `saida.ts`.
 *
 * O log por PID é o que torna a morte observável: o nome do arquivo diz qual
 * instância morreu, e a última linha antes do fim diz por quê.
 *
 * ⚠️ `LOG_LEVEL: silent` no `subirApi` NÃO silencia nada: `LoggerModule.forRoot`
 * em `apps/api/src/app.module.ts` só ramifica em `NODE_ENV === 'production'` e
 * o Pino fica no default `info`. Medido: com a variável no ambiente, os logs
 * saíam em INFO do mesmo jeito (o `.env` da api põe `LOG_LEVEL=info` e nenhuma
 * linha do código lê a variável). A variável fica ali porque removê-la seria
 * uma afirmação falsa — o silêncio que ela promete não existe.
 */
const DIR_LOG = join(WEB_ROOT, 'node_modules', '.cache', 'e2e-playwright');

/**
 * Acrescenta uma linha ao log DESTA instância.
 *
 * ⚠️ `caminho` vem de `saida.vincular(pid)`, e não é reconstruído aqui a partir
 * do PID. LIDO 2026-10-08 (revisão da branch): quando o `linkSync` falha
 * (disco cheio e `node_modules/.cache` num mount sem hardlink são cenários
 * plausíveis; **não reproduzidos aqui**), `vincular` devolve o `.parcial`, mas um
 * `anexarLog` que montasse o nome por conta própria criaria um `api-<pid>.log`
 * NOVO contendo só a linha `[saida]`. O `cauda` tenta o nomeado primeiro,
 * acharia esse arquivo — uma linha, sem o stack trace do Nest, que está no
 * `.parcial` — e a mensagem de erro subiria apontando para o log errado. Era o
 * mesmo defeito que o `saida.spec.ts` existe para impedir, entrando por outra
 * porta. Quem decide o nome do arquivo é quem o criou.
 */
function anexarLog(caminho: string, texto: string): void {
  try {
    mkdirSync(dirname(caminho), { recursive: true });
    appendFileSync(caminho, texto, 'utf8');
  } catch {
    // Log é diagnóstico, nunca controle: falhar em gravar não pode derrubar
    // a suíte — seria trocar um sintoma difícil de ler por um fácil de ler e
    // impossível de investigar.
  }
}

export interface OpcoesSubirApi {
  porta: number;
  databaseUrl: string;
}

/**
 * Sobe o `src/main.ts` da API e resolve quando ela responde `/health`.
 *
 * pt-BR: esperar porta TCP **não** basta. O Nest começa a bindar antes de o
 * `GlobalExceptionFilter` estar montado, e uma requisição que chega nessa
 * janela volta sem o header de problem-details. O `/health` só responde 200
 * depois que o bootstrap inteiro rodou — é o sinal certo.
 */
export async function subirApi({ porta, databaseUrl }: OpcoesSubirApi): Promise<ChildProcess> {
  // pt-BR (2026-10-08) — a causa do flake sob `--repeat-each 2`.
  //
  // `stdout` da API era um PIPE do worker do Playwright. O worker recicla no meio
  // da suíte (medido: o PPID da API passou a 1719, systemd --user, ou seja o pai
  // morreu) e, ao morrer, fecha a ponta leitora. A próxima linha de log é um
  // `EPIPE`, o Node derruba o processo, e a API morre com a porta ainda aberta
  // — e o repeat seguinte inteiro leva `ECONNREFUSED`.
  //
  // MEDIDO, isolando UMA variável fora da suíte (mesmo spawn, mesmo `detached:
  // true`, mesmos pipes): filho que não escreve em stdout sobrevive com PPID
  // 1719 por 6+ s e mantém a porta; filho que escreve morre em ~2 s. Um log de
  // 29 linhas sem nenhuma linha `[saida]` era a impressão digital disso — o
  // handler de `exit` mora no worker, e o worker já tinha morrido.
  //
  // O conserto é dar à API um ARQUIVO. Arquivo não tem ponta leitora viva, logo
  // não tem `EPIPE` — e o log passa a sobreviver à morte do worker, que é
  // justamente quando ele é mais necessário. A mecânica está em `saida.ts`.
  const saida = abrirSaidaEmArquivo(DIR_LOG, 'api');

  const filho = spawn(BIN_TSX, ['src/main.ts'], {
    cwd: API_ROOT,
    // pt-BR (2026-10-08): `detached: true` cria um PROCESS GROUP próprio, e é
    // o que fecha a janela do órfão — ver `derrubarApi`, que sinaliza o grupo.
    //
    // MEDIDO: sem isto, `SIGTERM` no pai deixava o filho vivo e segurando a
    // porta. Reproduzido fora da suíte (node forka um filho que faz `listen`):
    // pai `MORREU`, filho `SEGUE com a porta`, órfão reparentado para o systemd
    // --user. Na suíte isso aparecia como flake sob `--repeat-each 2`: a API
    // "nova" subia, o `/health` respondia — do processo VELHO —, e todo request
    // seguinte ia para a instância anterior. Foi a MEDIDA, não a hipótese, que
    // amostras: `pgrep -fc src/main.ts` devolveu **16** com 12 órfãos de
    // execuções anteriores, quase todos com PPID 1719 (systemd --user).
    detached: true,
    env: {
      ...process.env,
      PORT: String(porta),
      DATABASE_URL: databaseUrl,
      // pt-BR: sem isso o `tracing.ts` tenta exportar para um
      // `otel-collector` que não existe neste ambiente, e cada spec paga um
      // timeout de conexão que não é dele.
      OTEL_SDK_DISABLED: 'true',
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', saida.descritor, saida.descritor],
  });

  const pid = filho.pid ?? -1;
  const caminhoDoLog = saida.vincular(pid);

  filho.on('error', (erro) => {
    anexarLog(caminhoDoLog, `[erro] spawn falhou: ${erro.message}\n`);
  });
  // A linha que responde "quem matou o processo": sai por conta própria
  // (código), ou foi sinal (SIGTERM do teardown, SIGSEGV, OOM).
  filho.on('exit', (codigo, sinal) => {
    anexarLog(caminhoDoLog, `[saida] codigo=${String(codigo)} sinal=${String(sinal)}\n`);
  });

  await esperarTcpAberta(porta);

  const fim = Date.now() + 45_000;
  while (Date.now() < fim) {
    if (filho.exitCode !== null) {
      // ⚠️ Este caminho NÃO chamava `derrubarApi` — só o de timeout (o
      // `throw` de logo abaixo) chamava, e essa era a assimetria. LIDO
      // 2026-10-08 (revisão da branch): o pai `tsx` pode morrer sem passar pelo
      // encaminhamento de `SIGTERM` que o cabeçalho mediu — OOM dele, exceção
      // não tratada no CLI; **não reproduzido aqui**, é o que a assimetria
      // acima presume. Aí o filho que faz o `listen` continua vivo, órfão, com a
      // porta em mãos, e o `globalSetup` aborta sem estado para o teardown
      // alcançar. Chamar `derrubarApi` nos DOIS caminhos de erro é o que fecha
      // isso — e fecha sem depender de o cenário ocorrer.
      await derrubarApi(filho);
      throw new Error(
        `A API saiu com código ${filho.exitCode} antes de ficar saudável.\n${saida.cauda(pid)}`,
      );
    }
    try {
      const resposta = await fetch(`http://127.0.0.1:${porta}/api/v1/health`);
      if (resposta.ok) return filho;
    } catch {
      // ainda subindo — tenta de novo
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  await derrubarApi(filho);
  throw new Error(`A API não respondeu /health em 45s.\n${saida.cauda(pid)}`);
}

/**
 * Derruba o processo e espera a porta ficar livre.
 *
 * pt-BR (2026-10-08): o sinal vai para o **GRUPO**, não para o PID.
 *
 * `filho.kill('SIGTERM')` mata o `tsx` pai — e só ele. O filho que faz o
 * `listen` continua vivo, órfão, com a porta em mãos. Isso foi medido em duas
 * direções: (1) fora da suíte, um pai que forca um filho com `listen` — pai
 * `MORREU`, filho `SEGUE com a porta`; (2) na máquina, 12 processos
 * `src/main.ts` órfãos de execuções passadas, com PPID 1719 (systemd --user),
 * nenhum deles na porta que o `estado.json` aponta.
 *
 * O sintoma é a parte que enganava: `esperarTcpFechada` estourava o prazo de
 * 20s, a `subirApiDoTeste` subia o processo novo, e o `/health` respondia — do
 * órfão. A suíte ficava verde num teste e vermelha em todos os seguintes, com
 * `ECONNREFUSED` aparecendo só depois, quando o órfão finalmente saía. Um
 * health check que responde não prova que quem respondeu é o processo que
 * acabou de subir; é a mesma classe do "verde que não mediu".
 *
 * `process.kill(-pid, sinal)` é o que cobre os dois: `-pid` é o grupo, criado
 * por `detached: true`. O sinal chega ao pai E ao filho.
 *
 * A escalada (`SIGTERM` → espera → `SIGKILL`) fica em `processos.ts`, e é a
 * MESMA que o teardown usa. Ela existia aqui duplicada, e só que observando o
 * pai: o `tsx` pai morre no `SIGTERM` e ainda deixa o filho de pé, então esperar
 * pela saída do pai dava "saiu" com a porta presa. Ver `derrubarPorPid`.
 */
export async function derrubarApi(filho: ChildProcess): Promise<void> {
  await derrubarFilho(filho, 10_000);
}

// ── Controlling a API de dentro de um spec ──────────────────────────────────
//
// Dois fluxos exigem a API FORA DO AR: o estado de erro da listagem (F1) e o
// de erro de rede do formulário (F5). A alternativa seria simular a falha com
// uma resposta HTTP manufactured — e aí o teste passaria a medir o que a
// resposta fabricada diz, não o que a aplicação faz quando a API não responde.
//
// Derrubar de verdade tem um custo: derruba para todo mundo. Como a suíte roda
// com `workers: 1`, e cada arquivo que precisa disso levanta a API de volta no
// `finally` do próprio teste (`subirApiDoTeste()`), a janela em que a API está
// fora é confinada ao teste.
//
// ⚠️ MEDIDO 2026-10-08: `grep -cn "afterAll" e2e/f1-listagem.spec.ts
// e2e/f5-cadastro-erro-generico.spec.ts` devolve **0** e **0** — esta frase
// dizia "cada arquivo que precisa disso o levanta de volta no seu próprio
// `afterAll`", e **não existe `afterAll` em nenhum dos dois arquivos**. O
// mecanismo real é o
// `try/finally` dentro do teste. A diferença importa porque o `finally` só roda
// por caminhos que passam por ele: um worker morto, um `SIGINT` ou um abort do
// run deixam a API fora para o resto da execução, e os specs seguintes falham
// todos dentro de `baseLimpa` com um erro que não é do teste deles. Registrado
// aqui em vez de eliminado do comentário porque ele é o que a frase precisa
// dizer para quem for mexer no teardown.

/**
 * Derruba a API e espera a porta ficar livre. Idempotente.
 *
 * pt-BR (2026-10-08): sinaliza o GRUPO (`-pid`), pelo mesmo motivo de
 * `derrubarApi` — `apiPid` é o do pai `tsx`, e matar só ele deixa o filho
 * segurando a porta. O `estado.json` guarda o PID do pai justamente porque é
 * o que `spawn` devolve; o grupo sai de graça desse mesmo número.
 *
 * ── Por que a escalada vem ANTES do fim, e por que o `finally` ─────────────
 *
 * A primeira versão esperava a porta fechar, escalava para `SIGKILL` se ainda
 * estivesse aberta, e só então gravava `apiPid: null`. Duas coisas davam errado,
 * e as duas caminhavam na mesma direção:
 *
 *  1. A escalada era inalcançável na única situação em que existia. A espera
 *     era feita por `esperarTcpFechada`, que LANÇA no estouro; e a checagem
 *     `tcpAberta` ficava DEPOIS dela. Quando a porta não fechava — o caso
 *     inteiro em que a escalada importa — a função já tinha acabado, num throw.
 *     Era código morto.
 *  2. O mesmo throw pulava o `gravarEstado({apiPid: null})`. O `apiPid` ficava
 *     apontando para um processo morto, e a `subirApiDoTeste` do `afterAll` do
 *     spec voltava cedo por `apiPid !== null` e NÃO levantava a API de novo.
 *     Ou seja: a falha de teardown produzia o flake inteiro que o arquivo
 *     existe para matar, e o sufixo era uma suíte vermelha a specs adiante,
 *     longe da causa.
 *
 * A ordem certa é: sinaliza, espera sem lançar, escala se preciso, e grava o
 * estado no `finally` para que nenhuma saída deixe o estado mentindo.
 */
export async function derrubarApiDoTeste(): Promise<void> {
  const estado = exigirEstado();
  if (estado.apiPid === null) return;
  const pid = estado.apiPid;

  try {
    derrubarGrupo(pid, 'SIGTERM');
    if (!(await portaFechouDentroDe(estado.apiPorta, 20_000))) {
      derrubarGrupo(pid, 'SIGKILL');
      if (!(await portaFechouDentroDe(estado.apiPorta, 10_000))) {
        throw new Error(
          `A porta ${estado.apiPorta} continua ocupada depois de SIGTERM e SIGKILL no ` +
            `grupo ${pid}. Algum processo fora do grupo a segura. Diagnóstico: ` +
            `\`ss -tlnp 'sport = :${estado.apiPorta}'\` — o que aparecer ali é quem ` +
            'segura a porta, e o teardown deste arquivo não alcança esse PID.',
        );
      }
    }
  } finally {
    // O `finally` roda mesmo no throw acima, e é ele que impede o
    // `apiPid` de sobreviver a uma falha. O `afterAll` do spec depende do
    // `apiPid: null` para levantar a API de volta; sem isto, ele sai cedo e
    // todos os specs seguintes levarem `ECONNREFUSED` sem causa visível.
    gravarEstado({ ...estado, apiPid: null });
  }
}

/** Levanta a API de volta na MESMA porta e registra o novo PID. */
export async function subirApiDoTeste(): Promise<void> {
  const estado = exigirEstado();
  if (estado.apiPid !== null) return;
  const filho = await subirApi({ porta: estado.apiPorta, databaseUrl: estado.databaseUrl });
  gravarEstado({ ...estado, apiPid: filho.pid ?? null });
}
