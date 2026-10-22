#!/usr/bin/env tsx
/**
 * A etapa "sobe a aplicação localmente" do `ci:local`.
 *
 * MEDIDO 2026-10-21: o `ci:local` rodava lint, tipos, unit, cobertura,
 * integração, e2e e o tooling — e NADA subia a aplicação. A suíte e2e sobe a
 * API em `tsx` e o web no BUILD de produção (`next build` + standalone); o
 * `pnpm dev` — o jeito que quem desenvolve roda a aplicação — não era medido
 * por nada. E a diferença não é estética: `tsx` (esbuild) NÃO emite
 * `design:paramtypes`, então um provider sem `@Inject` explícito resolve
 * `undefined` SÓ em dev (ver o aviso em `health.controller.ts`).
 *
 * O que esta etapa faz, em ordem:
 *   1. Lê `apps/api/.env` — a configuração local (runbook §1.2).
 *   2. Sobe a API em `tsx src/main.ts` (o MESMO caminho do `pnpm dev`).
 *   3. Espera `/api/v1/health` responder 200 com o banco "ok" (runbook §1.5).
 *   4. Sobe o web em `next dev` (o MESMO caminho do `pnpm dev`).
 *   5. Espera `/api/health` responder 200 (runbook §1.5).
 *   6. Derruba os dois, em qualquer caminho de saída.
 *
 * ⚠️ O banco local é PRÉ-REQUISITO, e a etapa NÃO o sobe: o `postgres` do
 * Compose não publica a porta no host (§1.1 do runbook), e um banco efêmero
 * aqui mediria outra configuração, não a local. Sem o banco, a etapa falha
 * com o ponteiro para o runbook — ela não "pula" nem "passa".
 *
 * ⚠️ As portas são LIVRES, e não 3000/3001: o `pnpm dev` da pessoa pode estar
 * no ar, e uma etapa que briga pela porta falharia por um motivo que não é
 * defeito. Mesma razão do `portaLivre()` da suíte e2e.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..', '..', '..');
const API_DIR = join(RAIZ, 'apps', 'api');
const WEB_DIR = join(RAIZ, 'apps', 'web');

/** Log dos processos — lixo de execução, some com `pnpm install`. */
const DIR_LOG = join(RAIZ, 'node_modules', '.cache', 'ci-boot');

/**
 * O `distDir` do boot.
 *
 * Separate do `.next/` de propósito: `next dev` e `next build` NÃO dividem o
 * mesmo diretório (o Next apaga e reescreve o que o outro está servindo), e o
 * `pnpm dev` da pessoa pode estar de pé. Mesmo formato de `.next-e2e/` da
 * suíte e2e — e pelo mesmo motivo.
 */
const DIST_DIR_BOOT = '.next-boot';

/** Diagnóstico de uma verificação de saúde. */
export interface Diagnostico {
  ok: boolean;
  /** Por que não passou — a etapa imprime isto. */
  erro?: string;
}

/**
 * Lê um arquivo `.env`.
 *
 * Deliberadamente minimalista: o formato do `apps/api/.env` é `CHAVE=VALOR`,
 * com comentário em linha própria. O que NÃO é feito, e por quê:
 *   - `#` só abre comentário no INÍCIO da linha — um valor pode conter `#`
 *     (senha), e cortar no `#` trocaria a senha do banco por uma string
 *     truncada, que falha longe da causa;
 *   - o valor é dividido no PRIMEIRO `=`, porque uma senha ou um token pode
 *     conter `=`.
 */
export function lerEnvDotEnv(conteudo: string): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const linha of conteudo.split('\n')) {
    const limpa = linha.trim();
    if (limpa === '' || limpa.startsWith('#')) continue;
    const separador = limpa.indexOf('=');
    if (separador === -1) continue;
    const chave = limpa.slice(0, separador).trim();
    if (chave === '') continue;
    let valor = limpa.slice(separador + 1).trim();
    if (
      valor.length >= 2 &&
      ((valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'")))
    ) {
      valor = valor.slice(1, -1);
    }
    saida[chave] = valor;
  }
  return saida;
}

/**
 * O que a resposta de saúde da API significa.
 *
 * ⚠️ O 200 NÃO basta: o healthcheck devolve 200 com `checks.database` fora
 * de "ok" quando o banco responde diferente, e um veredito que olha só o
 * status aprova uma API que não tem banco.
 */
export function avaliarSaudeApi(status: number, corpo: unknown): Diagnostico {
  const c = corpo as { status?: unknown; checks?: { database?: unknown } } | null;
  if (status === 200) {
    if (c?.status === 'ok' && c.checks?.database === 'ok') return { ok: true };
    if (c?.checks?.database !== 'ok') {
      return {
        ok: false,
        erro:
          `a API respondeu 200, mas o banco está "${String(c?.checks?.database)}" e não ` +
          '"ok" — o banco local está de pé? Veja docs/como-rodar.md §1.1.',
      };
    }
    return { ok: false, erro: `a API respondeu 200 com status "${String(c?.status)}".` };
  }
  if (status === 503) {
    return {
      ok: false,
      erro:
        'a API respondeu 503 (degraded) — o banco local não respondeu. ' +
        'Veja docs/como-rodar.md §1.1.',
    };
  }
  return { ok: false, erro: `a API respondeu ${status} no healthcheck.` };
}

/** O que a resposta de saúde do web significa. */
export function avaliarSaudeWeb(status: number, corpo: unknown): Diagnostico {
  const c = corpo as { status?: unknown } | null;
  if (status === 200) {
    if (c?.status === 'ok') return { ok: true };
    return { ok: false, erro: `o web respondeu 200 com status "${String(c?.status)}".` };
  }
  return { ok: false, erro: `o web respondeu ${status} no healthcheck.` };
}

/**
 * A mensagem de uma falha de boot.
 *
 * ⚠️ "não respondeu em 60s" é a mensagem ERRADA para o caso comum: quando o
 * banco local está fora, a API **morre** em segundos (Prisma `P1001`) e o
 * healthcheck nunca chega — a etapa esperaria 60s à toa e culparia o
 * timeout. MEDIDO 2026-10-21: com o banco inalcançável, a API morre em ~2s
 * e a mensagem dizia "não respondeu em 60s". "Morreu" diz o que aconteceu, e
 * a dica diz onde olhar.
 */
export function mensagemDeFalha(
  morreu: boolean,
  alvo: string,
  limiteSegundos: number,
  dica = '',
): string {
  const base = morreu
    ? `a aplicação "${alvo}" MORREU ao subir — o sintoma está no log abaixo.`
    : `a aplicação "${alvo}" não respondeu o healthcheck em ${limiteSegundos}s.`;
  return dica === '' ? base : `${base} ${dica}`;
}

/** Uma porta que o kernel escolheu e que já está liberada. */
function portaLivre(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const servidor = createServer();
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const endereco = servidor.address();
      if (endereco === null || typeof endereco === 'string') {
        servidor.close();
        reject(new Error('portaLivre(): o kernel devolveu um endereço sem porta'));
        return;
      }
      const { port } = endereco;
      servidor.close(() => resolve(port));
    });
  });
}

function dormir(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Um processo sob medida: o que subiu, e onde está o log. */
interface Processo {
  filho: ChildProcess;
  pid: number;
  log: string;
  /** O `spawn` falhou (o binário não existe) — o sintoma está no log. */
  erro?: string;
}

/**
 * O prazo do `fetch` de saúde, em ms.
 *
 * ⚠️ É MENOR que o prazo da etapa (60 s / 90 s) de propósito: o prazo da etapa
 * governa o LAÇO, e este governa a TENTIVA. Sem ele, um servidor que aceita a
 * conexão e não responde deixa o `fetch` pendurado e o laço nunca mais avalia
 * o prazo (MEDIDO 2026-10-22).
 */
const PRAZO_DO_FETCH_MS = 5_000;

/**
 * Sobe um processo em GRUPO próprio, com a saída em ARQUIVO.
 *
 * ⚠️ `detached: true` cria o grupo — e é o grupo que o `derrubar` sinaliza.
 * O `tsx` são DOIS processos (o pai forka o filho que faz o `listen`): matar
 * só o pai deixaria o filho vivo e segurando a porta. Medido no e2e do web
 * (`e2e/support/api.ts`), que daí veio a forma.
 *
 * ⚠️ A saída vai para ARQUIVO, e não para pipe: um pipe morre de EPIPE
 * quando quem lê desaparece, e o filho morre junto. O arquivo sobrevive e
 * ainda deixa rastro depois do processo cair.
 */
function subir(
  nome: string,
  comando: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Processo {
  mkdirSync(DIR_LOG, { recursive: true });
  const log = join(DIR_LOG, `${nome}.log`);
  const descritor = openSync(log, 'w');
  const filho = spawn(comando, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', descritor, descritor],
  });
  closeSync(descritor);
  const processo: Processo = { filho, pid: filho.pid ?? -1, log };
  // ⚠️ O `spawn` NÃO LANÇA quando o binário não existe: ele EMITE o evento
  // `'error'`. Sem este listener, o EventEmitter lança, a exceção não capturada
  // mata o processo — e o `finally` do `main()`, que é quem derruba os grupos,
  // NÃO RODA: a API e o web sobem como órfãos segurando as portas, e a etapa
  // morre com stack trace cru em vez do diagnóstico que ela promete.
  // MEDIDO 2026-10-22 (revisão do harness): o `apps/web/e2e/support/api.ts`
  // (mesma técnica) TEM o listener, e o `processos.ts` centraliza o
  // `derrubarFilho` — a forma veio daqui, o tratamento do erro, não.
  filho.on('error', (erro: Error) => {
    processo.erro = erro.message;
    try {
      appendFileSync(log, `[erro] spawn falhou: ${erro.message}\n`);
    } catch {
      // Log é diagnóstico, nunca controle: falhar em gravar não pode derrubar
      // a etapa — seria trocar um sintoma difícil de ler por um fácil de ler e
      // impossível de investigar.
    }
  });
  return processo;
}

/** `true` enquanto o grupo do processo tiver alguém vivo. */
function grupoVivo(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Derruba o grupo: SIGTERM, espera, SIGKILL. */
async function derrubar(p: Processo): Promise<void> {
  if (p.pid <= 0) return;
  try {
    process.kill(-p.pid, 'SIGTERM');
  } catch {
    // Já tinha saído.
  }
  for (let i = 0; i < 100 && grupoVivo(p.pid); i += 1) {
    await dormir(100);
  }
  if (grupoVivo(p.pid)) {
    try {
      process.kill(-p.pid, 'SIGKILL');
    } catch {
      // Já tinha saído.
    }
  }
}

/**
 * Espera a URL responder HTTP.
 *
 * Devolve `null` quando o processo MORRE (o sintoma está no log) ou quando o
 * prazo estoura. Devolve a resposta assim que ela vier — inclusive uma 503:
 * quem julga é o `avaliarSaude*`, e um 503 do banco é informação, não ruído.
 *
 * ⚠️ O `fetch` tem PRÓPRIO prazo (MEDIDO 2026-10-22): sem ele, um servidor
 * que ACEITA a conexão e não responde (o `next dev` engasgado numa compilação
 * que não termina, o event loop do Node bloqueado) deixa o `fetch` pendurado
 * para sempre — e o `while (Date.now() < fim)` nunca é reavaliado, porque a
 * linha do prazo só é testada na BORDA do laço. A etapa ficava pendurada sem
 * dar o diagnóstico que ela promete, e sem a cauda do log.
 */
async function esperarSaude(
  url: string,
  limiteMs: number,
  p: Processo,
): Promise<{ status: number; corpo: unknown } | null> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (p.filho.exitCode !== null || p.filho.signalCode !== null) return null;
    // O `spawn` falhou (o binário não existe): o sintoma está no log, e esperar
    // o prazo só atrasaria o diagnóstico.
    if (p.erro !== undefined) return null;
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(PRAZO_DO_FETCH_MS) });
      const texto = await resposta.text();
      let corpo: unknown = texto;
      try {
        corpo = JSON.parse(texto);
      } catch {
        // Não é JSON — o corpo cru segue para o diagnóstico.
      }
      return { status: resposta.status, corpo };
    } catch {
      // Ainda subindo — tenta de novo.
    }
    await dormir(200);
  }
  return null;
}

/** A cauda do log do processo — o sintoma mora duas linhas abaixo da causa. */
function cauda(caminho: string, linhas = 40): string {
  try {
    const conteudo = readFileSync(caminho, 'utf8').split('\n');
    return (
      `[ci:boot] --- últimas ${linhas} linhas de ${caminho} ---\n` +
      conteudo.slice(-linhas).join('\n')
    );
  } catch (erro) {
    return `[ci:boot] (não foi possível ler o log ${caminho}: ${String(erro)})`;
  }
}

async function main(): Promise<number> {
  const arquivoEnv = join(API_DIR, '.env');
  if (!existsSync(arquivoEnv)) {
    console.error(
      '[ci:boot] FALHA: apps/api/.env não existe — a aplicação local não sobe sem ele.',
    );
    console.error('        cp apps/api/.env.example apps/api/.env e preencha o JWT_SECRET.');
    console.error('        Veja docs/como-rodar.md §1.2.');
    return 1;
  }

  const env = lerEnvDotEnv(readFileSync(arquivoEnv, 'utf8'));
  const databaseUrl = env.DATABASE_URL ?? '';
  const jwtSecret = env.JWT_SECRET ?? '';
  const faltando = (
    [
      ['DATABASE_URL', databaseUrl],
      ['JWT_SECRET', jwtSecret],
    ] as Array<[string, string]>
  )
    .filter(([, valor]) => valor.trim() === '')
    .map(([chave]) => chave);
  if (faltando.length > 0) {
    console.error(
      `[ci:boot] FALHA: apps/api/.env está sem ${faltando.join(' e ')} — a aplicação local não sobe sem eles.`,
    );
    console.error('        O JWT_SECRET é gerado com `openssl rand -base64 48`.');
    console.error('        Veja docs/como-rodar.md §1.2.');
    return 1;
  }

  const apiPorta = await portaLivre();
  const webPorta = await portaLivre();

  console.log(`[ci:boot] subindo a API em http://127.0.0.1:${apiPorta} …`);
  const api = subir('api', join(RAIZ, 'node_modules', '.bin', 'tsx'), ['src/main.ts'], API_DIR, {
    ...process.env,
    PORT: String(apiPorta),
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    NODE_ENV: 'development',
    OTEL_SDK_DISABLED: 'true',
  });

  let web: Processo | undefined;
  try {
    const saudeApi = await esperarSaude(`http://127.0.0.1:${apiPorta}/api/v1/health`, 60_000, api);
    if (saudeApi === null) {
      const morreu = api.filho.exitCode !== null || api.filho.signalCode !== null;
      console.error(
        `[ci:boot] FALHA: ${mensagemDeFalha(
          morreu,
          'API',
          60,
          'O banco local está de pé? Veja docs/como-rodar.md §1.1.',
        )}`,
      );
      console.error(cauda(api.log));
      return 1;
    }
    const diagnosticoApi = avaliarSaudeApi(saudeApi.status, saudeApi.corpo);
    if (!diagnosticoApi.ok) {
      console.error(`[ci:boot] FALHA: ${diagnosticoApi.erro}`);
      console.error(cauda(api.log));
      return 1;
    }
    console.log('[ci:boot] ✓ API no ar (health: ok, banco: ok)');

    console.log(`[ci:boot] subindo o web em http://127.0.0.1:${webPorta} …`);
    web = subir(
      'web',
      join(WEB_DIR, 'node_modules', '.bin', 'next'),
      ['dev', '--hostname', '127.0.0.1', '--port', String(webPorta)],
      WEB_DIR,
      {
        ...process.env,
        PORT: String(webPorta),
        API_BASE_URL: `http://127.0.0.1:${apiPorta}/api/v1`,
        NEXT_DIST_DIR: DIST_DIR_BOOT,
        OTEL_SDK_DISABLED: 'true',
      },
    );
    const saudeWeb = await esperarSaude(`http://127.0.0.1:${webPorta}/api/health`, 90_000, web);
    if (saudeWeb === null) {
      const morreu = web.filho.exitCode !== null || web.filho.signalCode !== null;
      console.error(
        `[ci:boot] FALHA: ${mensagemDeFalha(
          morreu,
          'web',
          90,
          'A API está no ar? Veja o log da API acima.',
        )}`,
      );
      console.error(cauda(web.log));
      return 1;
    }
    const diagnosticoWeb = avaliarSaudeWeb(saudeWeb.status, saudeWeb.corpo);
    if (!diagnosticoWeb.ok) {
      console.error(`[ci:boot] FALHA: ${diagnosticoWeb.erro}`);
      console.error(cauda(web.log));
      return 1;
    }
    console.log('[ci:boot] ✓ web no ar (health: ok)');
    console.log(`[ci:boot] ✓ aplicação local no ar — API :${apiPorta} · web :${webPorta}`);
    return 0;
  } finally {
    if (web !== undefined) await derrubar(web);
    await derrubar(api);
    // O `distDir` é uma CONSTANTE deste arquivo, e `WEB_DIR` também — o
    // caminho nunca vem de env. Apagar o que a etapa criou é o que impede
    // que ela deixe lixo versionável na árvore.
    rmSync(join(WEB_DIR, DIST_DIR_BOOT), { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('boot-local.ts')) {
  main().then(
    (codigo) => {
      process.exitCode = codigo;
    },
    (erro: unknown) => {
      console.error('[ci:boot] FALHA:', erro instanceof Error ? erro.message : String(erro));
      process.exitCode = 1;
    },
  );
}
