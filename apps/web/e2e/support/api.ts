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
import { join } from 'node:path';
import { API_ROOT, WEB_ROOT, exigirEstado, gravarEstado } from './estado';
import { esperarTcpAberta, esperarTcpFechada } from './portas';

const REPO_ROOT = join(API_ROOT, '..', '..');
const BIN_TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

/**
 * Onde a saída da API é gravada, por processo.
 *
 * pt-BR: MEDIDO em 2026-10-08 — a API morria no meio da suíte (todos os specs
 * seguintes levavam `ECONNREFUSED`) e o sintoma, sozinho, não dizia nada: o
 * processo podia ter sido sinalizado, ter estourado, ou o drain do Prisma
 * poderia ter derrubado o socket. Com `LOG_LEVEL: silent` e `stdio` herdado
 * pelo pai que morre, a causa não tinha para onde aparecer.
 *
 * O log por PID é o que torna a morte observável: o nome do arquivo diz qual
 * instância morreu, e a última linha antes do fim diz por quê.
 */
const DIR_LOG = join(WEB_ROOT, 'node_modules', '.cache', 'e2e-playwright');

function anexarLog(pid: number, texto: string): void {
  try {
    mkdirSync(DIR_LOG, { recursive: true });
    appendFileSync(join(DIR_LOG, `api-${pid}.log`), texto, 'utf8');
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
  const filho = spawn(BIN_TSX, ['src/main.ts'], {
    cwd: API_ROOT,
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
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const pid = filho.pid ?? -1;
  let stderr = '';
  for (const [nome, fluxo] of [
    ['stdout', filho.stdout],
    ['stderr', filho.stderr],
  ] as const) {
    fluxo?.setEncoding('utf8');
    fluxo?.on('data', (pedaco: string) => {
      stderr += pedaco;
      anexarLog(pid, `[${nome}] ${pedaco}`);
    });
  }
  filho.on('error', (erro) => {
    stderr += `\nspawn falhou: ${erro.message}`;
    anexarLog(pid, `[erro] spawn falhou: ${erro.message}\n`);
  });
  // A linha que responde "quem matou o processo": sai por conta própria
  // (código), ou foi sinal (SIGTERM do teardown, SIGSEGV, OOM).
  filho.on('exit', (codigo, sinal) => {
    anexarLog(pid, `[saida] codigo=${String(codigo)} sinal=${String(sinal)}\n`);
  });

  await esperarTcpAberta(porta);

  const fim = Date.now() + 45_000;
  while (Date.now() < fim) {
    if (filho.exitCode !== null) {
      throw new Error(
        `A API saiu com código ${filho.exitCode} antes de ficar saudável.\n${stderr.slice(-2000)}`,
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
  throw new Error(`A API não respondeu /health em 45s.\n${stderr.slice(-2000)}`);
}

/**
 * Derruba o processo e espera a porta ficar livre.
 *
 * pt-BR: o `SIGTERM` sozinho não basta. O Nest tem `enableShutdownHooks`, mas
 * o drain do Prisma leva alguns ms, e voltar a subir em cima de uma porta
 * ainda bindada produz `EADDRINUSE` — flake que só aparece na segunda
 * execução do spec. `esperarTcpFechada` é o que fecha a janela.
 */
export async function derrubarApi(filho: ChildProcess): Promise<void> {
  if (filho.exitCode !== null || filho.signalCode !== null) return;
  filho.kill('SIGTERM');
  // Se o SIGTERM não bastar (processo travado no drain), SIGKILL — mas só
  // depois de um prazo, para não matar um processo que já estava saindo.
  if (!(await esperarSaida(filho, 10_000))) filho.kill('SIGKILL');
}

function esperarSaida(filho: ChildProcess, ms: number): Promise<boolean> {
  if (filho.exitCode !== null || filho.signalCode !== null) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const temporizador = setTimeout(() => resolve(false), ms);
    filho.once('exit', () => {
      clearTimeout(temporizador);
      resolve(true);
    });
  });
}

// ── Controlling a API de dentro de um spec ──────────────────────────────────
//
// Dois fluxos exigem a API FORA DO AR: o estado de erro da listagem (F1) e o
// de erro de rede do formulário (F5). A alternativa seria simular a falha com
// uma resposta HTTP manufactured — e aí o teste passaria a medir o que a
// resposta fabricada diz, não o que a aplicação faz quando a API não responde.
//
// Derrubar de verdade tem um custo: derruba para todo mundo. Como a suíte roda
// com `workers: 1` e cada arquivo que precisa disso o levanta de volta no seu
// próprio `afterAll`, a janela em que a API está fora é confinada ao arquivo.

/** Derruba a API e espera a porta ficar livre. Idempotente. */
export async function derrubarApiDoTeste(): Promise<void> {
  const estado = exigirEstado();
  if (estado.apiPid === null) return;
  try {
    process.kill(estado.apiPid, 'SIGTERM');
  } catch {
    // Já estava fora. Segue para a espera de porta, que é o que interessa.
  }
  await esperarTcpFechada(estado.apiPorta, 20_000);
  gravarEstado({ ...estado, apiPid: null });
}

/** Levanta a API de volta na MESMA porta e registra o novo PID. */
export async function subirApiDoTeste(): Promise<void> {
  const estado = exigirEstado();
  if (estado.apiPid !== null) return;
  const filho = await subirApi({ porta: estado.apiPorta, databaseUrl: estado.databaseUrl });
  gravarEstado({ ...estado, apiPid: filho.pid ?? null });
}

export { esperarTcpFechada };
