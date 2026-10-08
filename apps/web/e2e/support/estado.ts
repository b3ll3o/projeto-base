// apps/web/e2e/support/estado.ts
//
// Canal entre o `globalSetup` (que sobe tudo) e os workers (que rodam os
// specs).
//
// pt-BR: existe porque o Playwright não oferece passagem direta entre os dois.
// `globalSetup` roda no processo principal; os specs rodam em processos
// SEPARADOS, que não enxergam `globalThis` nem as variáveis do pai. A
// alternativa oficial — `process.env` — não é garantida entre os dois, e
// descobrir isso no meio da suíte custa um ciclo inteiro de depuração.
//
// Por isso o contrato é um ARQUIVO: o setup escreve, o worker lê. É o mesmo
// mecanismo que o próprio repo já usa nos `check-*.ts` (fixtures em diretório
// temporário), então não introduz um conceito novo.
//
// O arquivo mora sob `node_modules/` de propósito: é lixo de execução, some
// com `pnpm install`, e não depende de `.gitignore` estar certo.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const AQUI = __dirname;
/** `apps/web` — support → e2e → web. */
export const WEB_ROOT = join(AQUI, '..', '..');
/** `apps/api` — o bootstrap sobe a API de lá. */
export const API_ROOT = join(WEB_ROOT, '..', 'api');

// MEDIDO em 2026-10-08: `__dirname`, e não `dirname(fileURLToPath(import.meta.url))`.
//
// O `apps/web/package.json` não declara `"type": "module"`, então o Playwright
// transpila os specs e o `globalSetup` para CommonJS. A sintaxe `import.meta`
// atravessa essa transpilação como CJS e o Node a executa no escopo de módulo —
// `ReferenceError: exports is not defined in ES module scope`, dentro do próprio
// arquivo que a declara. Foi o único arquivo da suíte a falhar; os outros
// carregaram na mesma execução.
//
// A checagem existe porque um `WEB_ROOT` errado aqui não falha: ele só muda o
// caminho de `next build` e de `migrate deploy`, e o erro chega lá como "arquivo
// não encontrado" — longe da causa. Assertar a precondição transforma um erro
// distante num erro que nomeia o arquivo.
if (!existsSync(join(WEB_ROOT, 'playwright.config.ts'))) {
  throw new Error(
    `WEB_ROOT calculado como "${WEB_ROOT}", onde não há playwright.config.ts. ` +
      'A suíte pressupõe rodar a partir de apps/web; este arquivo deduce a raiz ' +
      'a partir da própria localização, então a decepção é do caminho do arquivo.',
  );
}

const ARQUIVO = join(WEB_ROOT, 'node_modules', '.cache', 'e2e-playwright', 'estado.json');

export interface EstadoE2E {
  /** Porta do servidor Next de teste (o `baseURL` dos specs). */
  webPorta: number;
  /** URL completa do Next. */
  webUrl: string;
  /** Porta do Nest de teste. */
  apiPorta: number;
  /** Origem da API, sem o prefixo global. */
  apiOrigem: string;
  /** URL que o Next usa como `API_BASE_URL`, já com `/api/v1`. */
  apiBaseUrl: string;
  /** PID do processo Nest vivo neste momento. */
  apiPid: number | null;
  /** PID do processo Next vivo neste momento. */
  webPid: number | null;
  /** Conexão do Postgres efêmero (Testcontainers). */
  databaseUrl: string;
}

export function gravarEstado(estado: EstadoE2E): void {
  mkdirSync(dirname(ARQUIVO), { recursive: true });
  writeFileSync(ARQUIVO, JSON.stringify(estado, null, 2), 'utf8');
}

export function lerEstado(): EstadoE2E {
  return JSON.parse(readFileSync(ARQUIVO, 'utf8')) as EstadoE2E;
}

/**
 * Apaga o estado de uma execução anterior.
 *
 * ⚠️ Sem isto, um `estado.json` velho é pior do que arquivo nenhum.
 *
 * LIDO 2026-10-08 (revisão da branch): o arquivo só era gravado, nunca
 * removido, e o teardown confia nele cegamente — é o que o código mostra, não
 * uma medição. O cenário que daí decorre é o `SIGKILL` no processo errado: a
 * execução #1 deixa `apiPid: 4821`; aquele processo morre (reboot, `pkill`);
 * semanas depois o PID 4821 pertence a um processo sem nenhuma relação com a
 * suíte — o `pnpm dev` da pessoa. Ela roda `test:e2e`, o setup falha ANTES de
 * gravar o estado novo (basta o `prepararstandalone()` não achar o `server.js`),
 * e o teardown lê o estado velho e faz `derrubarGrupo(4821, 'SIGTERM')` e, 8 s
 * depois, `SIGKILL` no grupo `-4821` — derrubando o trabalho de quem está
 * trabalhando.
 *
 * Apagar primeiro transforma esse caminho no mesmo que já é o normal: sem
 * arquivo, o teardown não tem PIDs e não sinaliza ninguém.
 */
export function apagarEstado(): void {
  rmSync(ARQUIVO, { force: true });
}

/**
 * Lê o estado já validando a precondição.
 *
 * pt-BR: um spec que lê um arquivo ausente morre com `ENOENT`, que não diz
 * nada sobre a causa. A suíte tem uma precondição — o `globalSetup` rodou — e
 * ela merece uma mensagem que a nomeie.
 */
export function exigirEstado(): EstadoE2E {
  try {
    return lerEstado();
  } catch (erro) {
    throw new Error(
      'O globalSetup não rodou (ou rodou e falhou) — não há estado em ' +
        `${ARQUIVO}. Rode a suíte por \`pnpm --filter @projeto/web test:e2e\`, ` +
        'que executa o globalSetup antes de qualquer spec. Causa original: ' +
        (erro instanceof Error ? erro.message : String(erro)),
    );
  }
}
