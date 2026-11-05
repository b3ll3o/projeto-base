// .tooling/scripts/ci/adaptador-docker.ts
//
// pt-BR: o ADAPTADOR do Docker — a única parte do check que fala com o
// daemon. Ele sai do `ambiente-local.ts` por um motivo só: o `ambiente-local.ts`
// é a DECISÃO (o que o check afirma) e este arquivo é o EFEITO (o que ele
// mede). Separados, cada um é testável por igual — e o arquivo de decisão
// deixa de carregar 200 linhas de `execFileSync`.
//
// ⚠️ O QUE NÃO SAI DAQUI (e por quê):
//
// - `CONTAINER_DO_BANCO_LOCAL` é a constante de DOMÍNIO (o nome do banco
//   local), e ela FICA no `ambiente-local.ts`: o `check-runbook-drift` lê o
//   nome do container **como TEXTO** em
//   `.tooling/scripts/ci/ambiente-local.ts` (a superfície "tooling"), e uma
//   migração da constante deixaria aquela superfície sem nome — o gate
//   ficaria vermelho por "superfície ausente".
// - `esperarPorta`/`portaAberta` são de REDE, não de Docker: esperar uma
//   porta é o mesmo medir se o banco é do Compose ou um container local.
//
// ⚠️ TODO comando do Docker tem PRAZO: um daemon travado não pode travar o
// `pnpm dev` — que é o caminho que quem desenvolve usa o dia inteiro.

import { execFileSync } from 'node:child_process';

/** O prazo de qualquer comando do Docker — um daemon travado não pode travar o check. */
const PRAZO_DO_DOCKER_MS = 5_000;

/**
 * O NOME do repositório da imagem — `postgres`, e não
 * `docker.io/library/postgres:16-alpine`.
 *
 * ⚠️ `docker inspect` devolve `Config.Image` **COMO A PESSOA DIGITOU** — e a
 * forma que o mundo usa é a QUALIFICADA (`docker.io/library/postgres:16-alpine`,
 * copiada do Docker Hub). MEDIDO em 2026-11-05: com um `startsWith('postgres:')`,
 * a forma qualificada caía no ramo `container-imagem-inesperada` — que diz, em
 * texto, que a imagem "não é do Postgres" (é), e IMPEDE a auto-recuperação (o
 * `docker start`, que é o propósito do check).
 *
 * ⚠️ O nome é o do REPOSITÓRIO, e não a referência: o digest (`@sha256:…`) e a
 * tag (`:16-alpine`) não fazem parte dele. E o `postgresql` do Bitnami
 * (`bitnami/postgresql:16`) dá `postgresql` — que **não** é o Postgres do
 * projeto, e o check não pode religar um container que não é o banco.
 */
export function nomeDaImagem(imagem: string): string {
  const semDigest = imagem.split('@')[0] ?? imagem;
  const base = semDigest.split('/').pop() ?? semDigest;
  return base.split(':')[0] ?? base;
}

/** Um container que publica a porta, e o serviço do Compose que ele é (se for). */
export interface ContainerNaPorta {
  nome: string;
  servicoCompose: string | undefined;
}

/** O que o Docker sabe sobre o container do banco local. */
export interface EstadoDoContainer {
  existe: boolean;
  rodando: boolean;
  publicaPorta: boolean;
  imagem: string | undefined;
  /**
   * O daemon do Docker RESPONDEU?
   *
   * ⚠️ "o container não existe" e "o Docker não respondeu" são defeitos
   * DIFERENTES, e a mensagem errada manda a pessoa atrás do container errado
   * (ou cria um container que já existe). O `docker` sai com código 1 nos
   * dois casos — o que os distingue é o `stderr`.
   */
  dockerRespondeu: boolean;
}

/**
 * O container publica a porta do HOST que estamos sondando?
 *
 * ⚠️ O `HostConfig.PortBindings` é chaveado pela porta **DO CONTAINER**
 * (`"5432/tcp"`), e a porta do **HOST** está no `HostPort` do valor. MEDIDO
 * em 2026-11-03: comparar a chave com a porta do host só funciona por
 * coincidência quando as duas são 5432 — e erra em qualquer mapeamento
 * diferente (`-p 55432:5432` publicava 5432 no container e 55432 no host, e
 * o check dizia que o container "não publicava a porta").
 */
export function publicaPortaNasBindings(bindings: string | undefined, porta: number): boolean {
  if (bindings === undefined) return false;
  try {
    const mapa = JSON.parse(bindings) as Record<
      string,
      Array<{ HostIp?: string; HostPort?: string }> | null
    > | null;
    if (mapa === null || typeof mapa !== 'object') return false;
    return Object.values(mapa).some(
      (lista) => Array.isArray(lista) && lista.some((b) => b?.HostPort === String(porta)),
    );
  } catch {
    return false;
  }
}

/**
 * O formato do ÚNICO `docker inspect` — os 3 campos num template só.
 *
 * ⚠️ O separador é o `U+001F` (UNIT SEPARATOR), e não o `|`: o campo do
 * meio é um JSON (`PortBindings`) e o do fim é uma referência de imagem.
 * Nenhum dos três pode conter `U+001F` por construção (o nome de container,
 * a tag de imagem e o JSON do Docker não têm controle em byte) — e o `|`
 * seria apenas "improvável" e não "impossível".
 *
 * MEDIDO em 2026-11-03 com o Docker 29.1.3:
 * `docker inspect --format $'{{.State.Status}}\x1f{{.Config.Image}}\x1f{{json .HostConfig.PortBindings}}'`
 * → `exited␟postgres:16-alpine␟{"5432/tcp":[{"HostIp":"127.0.0.1","HostPort":"5434"}]}`.
 */
const FORMATO_DO_INSPECT =
  '{{.State.Status}}\u001f{{.Config.Image}}\u001f{{json .HostConfig.PortBindings}}';

/** O separador do formato acima — o mesmo `U+001F`. */
const SEPARADOR_DO_INSPECT = '\u001f';

/**
 * O `docker` respondeu, ou o container é que não existe?
 *
 * MEDIDO em 2026-11-03 (Docker 29.1.3), as 4 falhas saem com código 1 e só
 * se distinguem pelo `stderr`:
 *
 * | caso | `stderr` | responde? |
 * |---|---|---|
 * | container inexistente | `error: no such object: <nome>` | **sim** |
 * | daemon fora (socket TCP) | `Cannot connect to the Docker daemon at …` | não |
 * | daemon fora (socket unix) | `failed to connect to the docker API at …` | não |
 * | `docker` fora do PATH / timeout | (vazio) | não |
 *
 * ⚠️ A regra é "respondeu **só** quando o daemon disse `no such object`":
 * qualquer outra falha é "o Docker não respondeu". O inverso — casar a prosa
 * de cada caso — é o que faz um guard depender da versão do binário; e o
 * `catch` genérico tratava TODAS elas como "o container não existe",
 * mandando a pessoa recriar o container do banco (que guarda o volume com as
 * senhas dos papéis).
 */
export function dockerRespondeu(erro: unknown): boolean {
  // ⚠️ O `stderr` do erro é `string` quando o `execFileSync` tem `encoding`,
  // e `Buffer` sem ele — e `String(buffer)` já funciona. O `Buffer.isBuffer`
  // é a forma explícita, e não depende do `encoding` que alguém mexer.
  const bruto =
    erro !== null && typeof erro === 'object' ? (erro as { stderr?: unknown }).stderr : undefined;
  const stderr = Buffer.isBuffer(bruto) ? bruto.toString('utf-8') : String(bruto ?? '');
  // ⚠️ Case-INsensitive: o binário escreve `no such object` em minúsculo —
  // um `includes('No such object')` case-sensitivo NÃO casaria o caso real.
  return /no such (object|container)/i.test(stderr);
}

/**
 * Interroga o container do banco local.
 *
 * ⚠️ O `docker` é sempre chamado com argv em ARRAY — nunca interpolado. O
 * gate `check-shell-injection` recusa a forma interpolada. E TODO comando tem
 * prazo: um daemon travado não pode travar o check.
 *
 * ⚠️ UM `docker inspect`, não três: os 3 campos que o check precisa cabem
 * num template só. MEDIDO: 3 processos viram 1, e o `stderr` passa a ser
 * capturado — é o que separa "o container não existe" de "o Docker não
 * respondeu".
 */
export function inspecionarContainer(nome: string, porta: number): EstadoDoContainer {
  let saida: string;
  try {
    saida = execFileSync(
      'docker',
      // ⚠️ `--type container`: sem ele, o `inspect` também resolve uma
      // IMAGEM pelo mesmo nome — e aí o template `.State.Status` dá um erro
      // de parsing, que o `catch` leria como "o Docker não respondeu"
      // (o daemon respondeu; o problema é outro).
      ['inspect', '--type', 'container', '--format', FORMATO_DO_INSPECT, nome],
      {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: PRAZO_DO_DOCKER_MS,
        maxBuffer: 1 << 20,
      },
    ).trim();
  } catch (erro) {
    return {
      existe: false,
      rodando: false,
      publicaPorta: false,
      imagem: undefined,
      dockerRespondeu: dockerRespondeu(erro),
    };
  }

  // ⚠️ Só a PRIMEIRA linha: um `docker inspect` que casa mais de um objeto
  // imprime uma linha por objeto, e o `split` do separador transformaria o
  // resto em lixo.
  const [status, imagem, bindings] = saida.split('\n')[0]?.split(SEPARADOR_DO_INSPECT) ?? [];
  return {
    existe: true,
    rodando: status === 'running',
    publicaPorta: publicaPortaNasBindings(bindings, porta),
    imagem: imagem === undefined || imagem === '' ? undefined : imagem,
    dockerRespondeu: true,
  };
}

/** Os containers que publicam a porta dada, e o serviço do Compose de cada um. */
export function containersNaPorta(porta: number): ContainerNaPorta[] | undefined {
  try {
    const saida = execFileSync(
      'docker',
      ['ps', '--filter', `publish=${porta}`, '--format', '{{.Names}}'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: PRAZO_DO_DOCKER_MS },
    );
    return saida
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .map((nome) => ({ nome, servicoCompose: servicoComposeDe(nome) }));
  } catch {
    // ⚠️ `undefined` e NÃO `[]`: o `catch` não é "nenhum container publica
    // essa porta" — é "o `docker ps` não respondeu". Devolver `[]` fazia o
    // veredito AFIRMAR que a porta está com um processo local, quando o
    // check não sabe (pode ser um container do Compose que o daemon não
    // listou). É o MESMO furo que o `dockerRespondeu` fecha no caminho do
    // banco — fechado aqui também.
    return undefined;
  }
}

/** O nome do serviço do Compose que o container é (ou `undefined`). */
export function servicoComposeDe(nome: string): string | undefined {
  try {
    const saida = execFileSync(
      'docker',
      ['inspect', '--format', '{{index .Config.Labels "com.docker.compose.service"}}', nome],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: PRAZO_DO_DOCKER_MS },
    ).trim();
    return saida === '' ? undefined : saida;
  } catch {
    return undefined;
  }
}

/** Religa o container do banco local. */
export function subirContainer(nome: string): boolean {
  try {
    execFileSync('docker', ['start', nome], { stdio: 'ignore', timeout: PRAZO_DO_DOCKER_MS });
    return true;
  } catch {
    return false;
  }
}

/**
 * O Postgres está ACEITANDO conexão?
 *
 * ⚠️ A porta abrir não é o banco estar pronto: o `docker-proxy` sobe no
 * instante em que o container sobe, e o Postgres aceita conexão depois
 * (MEDIDO em 2026-11-03: 205 ms de diferença). Por isso o check espera o
 * `pg_isready`, que é a sondagem de PRONTIDÃO do próprio Postgres.
 */
export function postgresPronto(nome: string): boolean {
  try {
    execFileSync('docker', ['exec', nome, 'pg_isready'], {
      stdio: 'ignore',
      timeout: PRAZO_DO_DOCKER_MS,
    });
    return true;
  } catch {
    return false;
  }
}
