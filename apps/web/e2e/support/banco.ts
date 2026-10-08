// apps/web/e2e/support/banco.ts
//
// Produzir "API no ar, banco fora do ar" — o estado de erro de INFRAESTRUTURA
// que o F5 mede.
//
// ── Por que derrubar o container, e não fabricar uma resposta ────────────────
//
// A versão anterior do F5 produzia o 500 **por digitação**: um nome de 110
// caracteres passava o Zod do formulário (limite 120) e era recusado pelo VO
// de domínio (limite 100), e a recusa saía como erro interno. Era um caminho
// real de produção — alcançado com o teclado, sem tocar em nada.
//
// MEDIDO 2026-10-08: esse caminho **deixou de existir**. O VO agora lança
// `UserValidationException`, o boundary importa os números do VO, e o
// formulário usa os MESMOS números — então o formulário barra o 110º caractere
// no `maxlength` do input e o POST nunca sai. O conserto do 500-por-digitação
// e a correção desse teste são o mesmo conserto: o teste estava descrevendo um
// defeito que deixou de existir.
//
// Fabricar uma resposta HTTP seria o atalho — `page.route` com um 500 de
// mentira, ou um servidor de mentira na porta da API. E é exatamente o que o
// `api.ts` recusa: "a alternativa seria simular a falha com uma resposta HTTP
// manufactured — e aí o teste passaria a medir o que a resposta fabricada diz,
// não o que a aplicação faz quando a API não responde".
//
// O que resta é o 5xx de verdade, e ele existe: **banco fora do ar**. A API
// está no ar, o Postgres não está, o Prisma não consegue falar com ele, e o
// `GlobalExceptionFilter` responde 500 INTERNAL com `traceId`. É a mesma falha
// que a infraestrutura real produz, com o mesmo caminho de código.
//
// ── A armadilha que quase tornou isto impossível (MEDIDO 2026-10-08) ───────
//
// A primeira versão deste arquivo usava `docker stop` + `docker start`, e o
// `finally` **nunca** levantava o banco: o TCP do host não voltava. A causa não
// era o Postgres nem o Prisma — era a **porta**:
//
//  - o `PostgreSqlContainer` publica o banco com `HostPort: "0"`, ou seja,
//    porta aleatória sorteada a cada `docker start`;
//  - parado → levantado, o Docker **sorteia outra**;
//  - a `DATABASE_URL` da API foi assada no boot e continua apontando para a
//    porta antiga.
//
// Medido com o mesmo `PostgreSqlContainer`, no `apps/api`:
//  - `docker port` saiu `33185` antes do stop e **`33186`** depois do start, e o
//    TCP não voltou em **60.808 ms** de espera;
//  - com a porta fixa (`withExposedPorts({ container: 5432, host: N })`), o
//    `docker port` ficou `0.0.0.0:N` dos dois lados e o TCP voltou em **5 ms**.
//
// Os dois conselhos abaixo não são estilo: são o que separa "o banco não
// voltou" de "o banco voltou em milissegundos".
//
// ── Por que `docker stop`, e não derrubar a API ────────────────────────────
//
// Derrubar a API é o outro estado — "rede caída" — e ele já tem spec (o
// segundo teste do F5), cujo `catch` é o genérico, sem traceId. Derrubar o
// BANCO mantém a API no ar, que é o que faz a diferença entre os dois
// caminhos do `estadoDeErro()`: `ApiError` com `traceId` contra exceção
// solta. São esses dois ramos que o arquivo existe para prender.
//
// ── O custo, dito antes ────────────────────────────────────────────────────
//
// O container volta com os dados intactos (`stop`/`start` preservam a camada
// gravável; só `rm` destrói), e `subirBancoDoTeste` só retorna quando o
// `/health` volta a 200 — que é o endpoint que faz `SELECT 1`. A janela em
// que o banco está fora fica confinada ao `try/finally` do spec, o mesmo
// mecanismo que `api.ts` já usa para a rede.

import { execFileSync } from 'node:child_process';
import { exigirEstado } from './estado';

/** Limite para o banco voltar a responder. O Postgres leva 1–2 s depois do start. */
const LIMITE_MS = 30_000;

function docker(...argumentos: string[]): string {
  return execFileSync('docker', argumentos, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Para o container do Postgres. Idempotente.
 *
 * A API fica no ar de propósito: é a diferença entre o `catch` genérico (rede
 * caída, sem traceId) e o `ApiError` com traceId que este fluxo mede.
 */
export function derrubarBancoDoTeste(): void {
  const { databaseContainerId } = exigirEstado();
  try {
    // `-t 2`, e não o grace de 10 s do Docker: o Postgres trata SIGTERM como
    // fast shutdown e fecha em bem menos que isso. MEDIDO 2026-10-08 — sem o
    // `-t`, o `docker stop` sozinho consumia ~10 s, que é um terço do timeout de
    // 30 s do spec: o `docker stop` ficava dentro da conta, e o que estourava o
    // prazo era o `finally` logo depois. O `-t 2` devolve esses ~8 s ao teste.
    docker('stop', '-t', '2', databaseContainerId);
  } catch (erro) {
    // `docker stop` num container já parado sai 0; o throw real seria o Docker
    // ausente ou o id inválido — e nesse caso o `finally` do spec repara.
    throw new Error(
      `docker stop ${databaseContainerId} falhou: ${
        erro instanceof Error ? erro.message : String(erro)
      }. Sem banco para derrubar, este spec mediria um estado que não produziu.`,
    );
  }
}

/**
 * Levanta o banco de volta e só devolve quando ele responde de verdade.
 *
 * ⚠️ MEDIDO por construção, e é o ponto inteiro do método: `docker start`
 * responde quando o PROCESSO do container subiu, não quando o Postgres
 * aceita conexão. Devolver ali deixaria o `finally` do spec terminar com o
 * banco ainda recusando conexão, e o spec seguinte — que começa com
 * `limparBase()` — falharia com um erro que não é dele. Por isso a espera é
 * pelo `/health`, que executa `SELECT 1`.
 */
export async function subirBancoDoTeste(): Promise<void> {
  const { databaseContainerId, apiBaseUrl } = exigirEstado();
  docker('start', databaseContainerId);

  const url = `${apiBaseUrl}/health`;
  const fim = Date.now() + LIMITE_MS;
  let ultimoErro = 'sem tentativa';
  while (Date.now() < fim) {
    try {
      const resposta = await fetch(url);
      if (resposta.ok) return;
      ultimoErro = `/health respondeu ${resposta.status}`;
    } catch (erro) {
      ultimoErro = erro instanceof Error ? erro.message : String(erro);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `O banco de teste não voltou a responder em ${LIMITE_MS / 1000}s ` +
      `(última tentativa: ${ultimoErro}). O resto da suíte depende dele — ` +
      'deixar o container parado é pior que a asserção que o spec faria.',
  );
}
