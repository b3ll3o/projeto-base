// .tooling/scripts/ci/ambiente-local.ts
//
// pt-BR: o preflight do AMBIENTE LOCAL.
//
// ⚠️ SEM SHEBANG — e o motivo é o de sempre: o script é invocado por
// `tsx <path>` a partir do script da raiz (`package.json#scripts.ambiente:check`)
// e não precisa dele. O `check-harness-owner` classifica como HARNESS quem tem
// shebang, e um harness **com dono** é aceito — este tem dono. (A versão
// anterior deste cabeçalho afirmava que o shebang o tornaria "harness órfão";
// era FALSO — o gate tem duas etapas, classificar e achar o dono.)
//
// POR QUE ISTO EXISTE
//
// MEDIDO em 2026-11-03: `pnpm dev` morreu com 20 linhas de stack do Prisma
// dizendo `Can't reach database server at localhost:5432`. A stack diz o
// SINTOMA; a CAUSA (desde o #91 o `postgres` do Compose usa só `expose:`, e a
// máquina não o alcança) e o REMÉDIO (o container `projeto-base-pg-local`)
// estavam escritos no runbook §1.1 — longe do terminal de quem ERROU.
//
// O `pnpm dev` é o caminho que quem desenvolve usa TODA hora. Ele não tinha
// NENHUMA verificação antes de subir a aplicação. Este script é a verificação
// que faltava: **quatro** asserções do ambiente local (variáveis, Prisma
// Client, banco, porta da API), cada uma com a decisão em FUNÇÃO PURA
// (testável sem máquina) e o efeito isolado.
//
// ⚠️ POR QUE NÃO É UM GATE DO PREFLIGHT
//
// Ele depende do estado da MÁQUINA (Docker + Postgres local + portas). No CI
// não há Postgres local — o próprio `ci.yml` diz "não usar service postgres
// aqui — é dead code" — então ele seria VERDE POR INÉRCIA no CI: a classe 1
// de `guard-classes.md`. Este é um helper de START, não um gate. O gate de
// subir a aplicação continua sendo o `ci:boot`, que **não** sobe o banco
// (decisão do repo, mantida).
//
// ⚠️ A DECISÃO DE SEGURANÇA NÃO É REPLICADA AQUI
//
// A validação do `JWT_SECRET` (tamanho, placeholder) tem DONO: o
// `segredoDeServico` em `apps/api/src/shared/auth/`. Importar `apps/api/` a
// partir de `.tooling/` acopla duas superfícies (ver o cabeçalho do
// `check-feature-flag-contract`). Aqui só se verifica o NÍVEL DE AMBIENTE —
// "existe e não está vazio" — que é o que o ambiente local resolve; o resto é
// do app, que recusa o boot com mensagem própria.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { lerEnvDotEnv } from './boot-local';

const RAIZ = resolve(__dirname, '..', '..', '..');
const API_DIR = join(RAIZ, 'apps', 'api');
const ARQUIVO_ENV = join(API_DIR, '.env');

/** O container do banco local — o dono do remédio (runbook §1.1). */
export const CONTAINER_DO_BANCO_LOCAL = 'projeto-base-pg-local';

/** Porta padrão do Postgres quando a URI não traz. */
const PORTA_PADRAO = 5432;

/**
 * Os hosts que são a máquina de quem desenvolve.
 *
 * ⚠️ `new URL(...).hostname` devolve o IPv6 **COM colchetes** (`[::1]`), e o
 * host em caixa alta não é normalizado no esquema não-especial. Por isso a
 * comparação é em minúsculas e o IPv6 aparece dos dois jeitos.
 */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** O host é a máquina de quem desenvolve? */
export function ehHostLocal(host: string): boolean {
  return HOSTS_LOCAIS.has(host.trim().toLowerCase());
}

/** Quanto esperar o Postgres abrir a porta depois do `docker start`. */
const PRAZO_DO_BANCO_MS = 15_000;

/** O prazo de qualquer comando do Docker — um daemon travado não pode travar o check. */
const PRAZO_DO_DOCKER_MS = 5_000;

/** O veredito de uma asserção. */
export type VereditoAmbiente =
  | { ok: true; rotulo: string; mensagem: string }
  | { ok: false; rotulo: string; codigo: string; mensagem: string; comando?: string };

// ── as decisões (puras) ─────────────────────────────────────────────────────

/** O que o check sabe do arquivo de ambiente da API. */
export interface EstadoDoEnv {
  arquivoExiste: boolean;
  temDatabaseUrl: boolean;
  temSystemDatabaseUrl: boolean;
  ambiente: string | undefined;
  jwtSecret: string | undefined;
}

/**
 * A API tem o que ela exige para subir?
 *
 * ⚠️ O que a API precisa são as VARIÁVEIS, não o arquivo: o `ConfigModule`
 * junta o `process.env` com o `apps/api/.env`, e quem exporta as duas no
 * ambiente também sobe a API. Por isso o arquivo é só um sinal — e a falha
 * declarada é a variável faltando, não o arquivo.
 *
 * ⚠️ O `SYSTEM_DATABASE_URL` é default-deny fora de `development` (o guard
 * `verificarCredenciaisDoBanco`): sem ele a API sobe e o primeiro login
 * devolve 500. Aqui a presença é verificada — a POLÍTICA (exigência, recusa)
 * é do app.
 *
 * ⚠️ O `JWT_SECRET` é lido, mas **nunca sai daqui**: só o veredito viaja.
 */
export function decideSobreEnv(estado: EstadoDoEnv): VereditoAmbiente {
  const rotulo = 'ambiente da API';

  if (!estado.temDatabaseUrl) {
    if (!estado.arquivoExiste) {
      return {
        ok: false,
        rotulo,
        codigo: 'sem-env',
        mensagem:
          'não há DATABASE_URL no ambiente, e o apps/api/.env não existe. A API não ' +
          'sabe onde está o banco.',
        comando: 'cp apps/api/.env.example apps/api/.env',
      };
    }
    return {
      ok: false,
      rotulo,
      codigo: 'sem-database-url',
      mensagem:
        'não há DATABASE_URL no ambiente nem no apps/api/.env — a API não sabe onde ' +
        'está o banco.',
    };
  }

  const jwt = estado.jwtSecret;
  if (jwt === undefined || jwt.trim() === '') {
    return {
      ok: false,
      rotulo,
      codigo: 'sem-jwt-secret',
      mensagem:
        'JWT_SECRET ausente ou vazio — a API RECUSA o boot sem ele, em qualquer ' +
        'NODE_ENV (ADR-0002: não existe valor default por decisão de projeto).',
      comando: 'openssl rand -base64 48   # preencher a linha JWT_SECRET= do apps/api/.env',
    };
  }

  const ambiente = (estado.ambiente ?? '').trim().toLowerCase();
  if (ambiente !== 'development' && !estado.temSystemDatabaseUrl) {
    return {
      ok: false,
      rotulo,
      codigo: 'sem-system-database-url',
      mensagem:
        'SYSTEM_DATABASE_URL ausente — fora de `development` ela é obrigatória ' +
        '(default-deny do #118): sem ela o bucket de sistema não abre e o ' +
        'primeiro login devolve 500.',
    };
  }

  return { ok: true, rotulo, mensagem: 'com as variáveis que a API exige' };
}

/** O que o check sabe do Prisma Client gerado. */
export interface EstadoDoPrismaClient {
  clienteGerado: boolean;
}

/**
 * O Prisma Client está gerado?
 *
 * ⚠️ O sintoma de NÃO estar é "@prisma/client did not initialize yet" — e a
 * causa provável é o CACHE DO TURBO servir a task `db:generate` sem rodar o
 * `prisma generate` (runbook §1.3).
 */
export function decideSobrePrismaClient(estado: EstadoDoPrismaClient): VereditoAmbiente {
  const rotulo = 'Prisma Client';
  if (!estado.clienteGerado) {
    return {
      ok: false,
      rotulo,
      codigo: 'sem-prisma-client',
      mensagem:
        'o Prisma Client não está gerado — a API morre com "@prisma/client did ' +
        'not initialize yet" (o cache do turbo pode servir a task sem rodar o generate).',
      comando: 'pnpm turbo run db:generate --filter=@projeto/api --force',
    };
  }
  return { ok: true, rotulo, mensagem: 'gerado' };
}

/** O que o check sabe do banco. */
export interface EstadoDoBanco {
  bancoAlcancavel: boolean;
  host: string;
  porta: number;
  containerExiste: boolean;
  containerParado: boolean;
  containerPublicaPorta: boolean;
  imagem: string | undefined;
}

/**
 * O banco local está no ar — e, se não está, dá para religá-lo?
 *
 * ⚠️ NUNCA devolve "criar": o volume do container guarda as migrations e as
 * senhas dos papéis que o `prepara-papeis.sh` aplica. Recriar troca o volume
 * e o app quebra com "role app_runtime is not permitted to log in".
 */
export function decideSobreBanco(estado: EstadoDoBanco): VereditoAmbiente {
  const rotulo = 'banco local';
  const endereco = `${estado.host}:${estado.porta}`;

  if (estado.bancoAlcancavel) {
    return { ok: true, rotulo, mensagem: `no ar (${endereco})` };
  }

  if (!ehHostLocal(estado.host)) {
    return {
      ok: false,
      rotulo,
      codigo: 'banco-remoto',
      mensagem:
        `não responde em ${endereco}. O alvo não é local — se é um serviço do ` +
        'Compose, o problema é a rede ou o serviço, não o banco local da máquina.',
    };
  }

  if (!estado.containerExiste) {
    return {
      ok: false,
      rotulo,
      codigo: 'sem-container',
      mensagem:
        `não responde em ${endereco} e o container \`${CONTAINER_DO_BANCO_LOCAL}\` não existe. ` +
        'A receita de criação está no runbook §1.1.',
    };
  }

  if (!estado.containerPublicaPorta) {
    return {
      ok: false,
      rotulo,
      codigo: 'container-sem-porta',
      mensagem:
        `não responde em ${endereco} e o container \`${CONTAINER_DO_BANCO_LOCAL}\` existe ` +
        'mas NÃO publica a porta no host — a API na máquina não o alcança.',
    };
  }

  if (estado.containerParado && (estado.imagem ?? '').startsWith('postgres:')) {
    return {
      ok: false,
      rotulo,
      codigo: 'subir-container',
      mensagem: `não responde em ${endereco} — o container está PARADO.`,
      comando: `docker start ${CONTAINER_DO_BANCO_LOCAL}`,
    };
  }

  if (estado.containerParado) {
    // O container está PARADO, mas a imagem NÃO é do Postgres: o check não
    // religa um container que não é o banco (religar o serviço errado é
    // efeito colateral em máquina de quem desenvolve).
    return {
      ok: false,
      rotulo,
      codigo: 'container-imagem-inesperada',
      mensagem:
        `não responde em ${endereco} e o container \`${CONTAINER_DO_BANCO_LOCAL}\` está ` +
        `PARADO com a imagem \`${estado.imagem ?? '(desconhecida)'}\` — que não é do ` +
        'Postgres. O check não religa um container que não é o banco.',
      comando: `docker logs ${CONTAINER_DO_BANCO_LOCAL}`,
    };
  }

  // O container está DE PÉ e publica a porta sondada, mas a porta não
  // respondeu. A mensagem NÃO diz que o container não publica a porta (ele
  // publica — é o que o estado garante) e NÃO diz que o Postgres não
  // inicializou (pode ser exatamente isso).
  return {
    ok: false,
    rotulo,
    codigo: 'banco-mudo',
    mensagem:
      `não responde em ${endereco}. O container \`${CONTAINER_DO_BANCO_LOCAL}\` está de pé ` +
      `e publica a porta ${estado.porta}, mas a porta não respondeu — o Postgres pode ` +
      'ainda estar inicializando (o `docker-proxy` sobe antes do banco aceitar conexão).',
    comando: `docker logs ${CONTAINER_DO_BANCO_LOCAL}`,
  };
}

/** Um container que publica a porta, e o serviço do Compose que ele é (se for). */
export interface ContainerNaPorta {
  nome: string;
  servicoCompose: string | undefined;
}

/** O que o check sabe da porta da API. */
export interface EstadoDaPorta {
  porta: number;
  ocupada: boolean;
  containersNaPorta: ContainerNaPorta[];
}

/**
 * A porta da API está livre?
 *
 * ⚠️ O dono da porta é identificado SEM `lsof`/`ss` (não portáveis): o filtro
 * `publish` do Docker. E o remédio NUNCA é um `pkill` cego — este repo é um
 * template que as pessoas COPIAM, e `pkill -f "turbo run dev"` mataria a
 * CÓPIA da pessoa que está ao lado. O comando diz como ACHAR o dono.
 */
export function decideSobrePorta(estado: EstadoDaPorta): VereditoAmbiente {
  const rotulo = `porta da API (:${estado.porta})`;

  if (!estado.ocupada) {
    return { ok: true, rotulo, mensagem: 'livre' };
  }

  const containers = estado.containersNaPorta;
  const primeiro = containers[0];
  if (primeiro !== undefined) {
    const nomes = containers.map((n) => `\`${n.nome}\``).join(', ');
    const comando =
      primeiro.servicoCompose !== undefined
        ? `docker compose stop ${primeiro.servicoCompose}`
        : `docker stop ${primeiro.nome}`;
    return {
      ok: false,
      rotulo,
      codigo: 'porta-no-container',
      mensagem: `já está em uso por ${nomes}. A API local não sobe enquanto a porta estiver ocupada.`,
      comando,
    };
  }

  return {
    ok: false,
    rotulo,
    codigo: 'porta-no-processo',
    mensagem:
      'já está em uso por um processo local — a API local não sobe assim. Este check ' +
      'NÃO sugere `pkill`: este repo é um template que as pessoas copiam, e o padrão ' +
      'casa a CÓPIA que está ao lado. Descubra o dono e pare só ele.',
    comando: `ss -ltnp | grep :${estado.porta}   # ou: lsof -i :${estado.porta}`,
  };
}

// ── os efeitos (impuros) ────────────────────────────────────────────────────

/** A porta aceita conexão TCP? */
export function portaAberta(host: string, porta: number, prazoMs = 800): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host, port: porta });
    const encerrar = (resposta: boolean): void => {
      socket.destroy();
      resolve(resposta);
    };
    socket.setTimeout(prazoMs);
    socket.once('connect', () => encerrar(true));
    socket.once('timeout', () => encerrar(false));
    socket.once('error', () => encerrar(false));
  });
}

/** O ambiente: o processo primeiro, o `apps/api/.env` como reserva. */
export function lerAmbienteLocal(): { arquivoExiste: boolean; valores: Record<string, string> } {
  const arquivoExiste = existsSync(ARQUIVO_ENV);
  const doArquivo = arquivoExiste ? lerEnvDotEnv(readFileSync(ARQUIVO_ENV, 'utf-8')) : {};
  const valores: Record<string, string> = { ...doArquivo };
  for (const [chave, valor] of Object.entries(process.env)) {
    if (valor !== undefined) valores[chave] = valor;
  }
  return { arquivoExiste, valores };
}

/**
 * O Prisma Client REAL está gerado?
 *
 * ⚠️ O postinstall do `@prisma/client` cria `default.js` (e `index.js`,
 * `edge.js`, `wasm.js`, `index-browser.js`) **incondicionalmente** — são os
 * STUBS, que lançam "@prisma/client did not initialize yet". O client REAL
 * escreve também `schema.prisma` e `client.js`, que o stub NÃO escreve.
 * Testar só `default.js` dava FALSO POSITIVO: o check dizia "gerado" para um
 * client inutilizável — e a API morria com erro cru logo em seguida.
 */
export function clienteDoPrismaGerado(): boolean {
  try {
    const req = createRequire(join(API_DIR, 'package.json'));
    const pacote = req.resolve('@prisma/client/package.json');
    const dir = join(pacote, '..', '..', '..');
    // Layout pnpm: `<store>/node_modules/.prisma/client`. Layout plano
    // (npm/yarn): `<root>/node_modules/.prisma/client`. Os dois são "dois
    // níveis acima do pacote" — e os dois são testados, porque o layout não
    // é uma coisa que o repo controle.
    return temClientReal(join(dir, '.prisma', 'client'));
  } catch {
    return false;
  }
}

/**
 * O diretório do client é o de um client REAL — e não o STUB.
 *
 * ⚠️ O postinstall do `@prisma/client` escreve `default.js` (e `index.js`,
 * `edge.js`, `wasm.js`, `index-browser.js`) **incondicionalmente** — são os
 * STUBS, que lançam "@prisma/client did not initialize yet". O `prisma
 * generate` escreve também `schema.prisma` e `client.js`, que o stub NÃO
 * escreve. Testar só `default.js` dava FALSO POSITIVO: o check dizia "gerado"
 * para um client inutilizável — e a API morria com erro cru logo em seguida.
 *
 * A função é PURA (recebe o diretório) para ser testável: a spec monta um
 * diretório com só o stub e prova que ele NÃO passa.
 */
export function temClientReal(clienteDir: string): boolean {
  return existsSync(join(clienteDir, 'schema.prisma')) && existsSync(join(clienteDir, 'client.js'));
}

/** O que o Docker sabe sobre o container do banco local. */
export interface EstadoDoContainer {
  existe: boolean;
  rodando: boolean;
  publicaPorta: boolean;
  imagem: string | undefined;
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
 * Interroga o container do banco local.
 *
 * ⚠️ O `docker` é sempre chamado com argv em ARRAY — nunca interpolado. O
 * gate `check-shell-injection` recusa a forma interpolada. E TODO comando tem
 * prazo: um daemon travado não pode travar o check.
 */
export function inspecionarContainer(nome: string, porta: number): EstadoDoContainer {
  const interrogando = (formato: string): string | undefined => {
    try {
      return execFileSync('docker', ['inspect', '--format', formato, nome], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: PRAZO_DO_DOCKER_MS,
      }).trim();
    } catch {
      return undefined;
    }
  };

  const status = interrogando('{{.State.Status}}');
  if (status === undefined) {
    return { existe: false, rodando: false, publicaPorta: false, imagem: undefined };
  }

  return {
    existe: true,
    rodando: status === 'running',
    publicaPorta: publicaPortaNasBindings(interrogando('{{json .HostConfig.PortBindings}}'), porta),
    imagem: interrogando('{{.Config.Image}}') || undefined,
  };
}

/** Os containers que publicam a porta dada, e o serviço do Compose de cada um. */
export function containersNaPorta(porta: number): ContainerNaPorta[] {
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
    return [];
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

/** Espera a porta abrir, depois do `docker start`. */
export async function esperarPorta(host: string, porta: number, prazoMs: number): Promise<boolean> {
  const fim = Date.now() + prazoMs;
  while (Date.now() < fim) {
    if (await portaAberta(host, porta)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Espera o Postgres ficar pronto (aceitando conexão), não só a porta abrir. */
export async function esperarPostgresPronto(nome: string, prazoMs: number): Promise<boolean> {
  const fim = Date.now() + prazoMs;
  while (Date.now() < fim) {
    if (postgresPronto(nome)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// ── a asserção do banco (com a auto-recuperação) ───────────────────────────

/**
 * Os efeitos que a asserção do banco usa.
 *
 * ⚠️ A asserção recebe os efeitos por PARAMETRO porque a auto-recuperação
 * (a feature-cabeçalho: "religa o container parado sozinho") precisa de TESTE
 * — e um teste que depende de `docker` de verdade não roda em todo CI. Com
 * os efeitos injetados, a spec exercita CADA ramo (subiu / não subiu / subiu
 * e não ficou pronto / nem era para subir) sem tocar em nenhum container.
 */
export interface EfeitosDoBanco {
  portaAberta(host: string, porta: number, prazoMs?: number): Promise<boolean>;
  inspecionarContainer(nome: string, porta: number): EstadoDoContainer;
  subirContainer(nome: string): boolean;
  esperarPorta(host: string, porta: number, prazoMs: number): Promise<boolean>;
  esperarPostgresPronto(nome: string, prazoMs: number): Promise<boolean>;
}

/** Os efeitos reais (Docker de verdade). */
export const EFEITOS_REAIS: EfeitosDoBanco = {
  portaAberta,
  inspecionarContainer,
  subirContainer,
  esperarPorta,
  esperarPostgresPronto,
};

/**
 * O host e a porta do banco, lidos da URI (sem credencial no relatório).
 *
 * ⚠️ ESTE É O ÚNICO PARSER DE URI DO REPO — e ele é o ÚNICO porque o outro
 * foi removido (achado SEC-08 da revisão do #144): o
 * `apps/api/src/shared/infrastructure/prisma/traducao-de-falha-de-conexao.ts`
 * tinha uma CÓPIA byte a byte desta função, e as duas decidiam **o que entra
 * no log de boot**. Se uma das duas passasse a ler `.username`/`.password`, a
 * credencial iria para o log — e **nenhum gate do repo acusaria**, porque o
 * `analisa-repeticao` varre só `apps/api/src`, `apps/web/*` e
 * `packages/shared-types/src` (o `.tooling/scripts/ci` está FORA da lista).
 *
 * A correção foi TIRAR o parser do APP: o alvo que o Prisma escreveu na
 * própria mensagem é o DONO desse dado, e o app não precisa de credencial
 * nenhuma para dizer que o banco não está no ar. O app, hoje, **não recebe**
 * a string que tem a senha.
 *
 * ⚠️ E ESTA cópia é a que fica: o app não pode importar daqui (o `Dockerfile`
 * copia só `apps/api`) e o tooling não importa do app por desenho (os gates
 * medem o app lendo arquivos como TEXTO, para não acoplar duas unidades de
 * build).
 */
export function alvoDoBanco(
  databaseUrl: string | undefined,
): { host: string; porta: number } | undefined {
  if (databaseUrl === undefined || databaseUrl.trim() === '') return undefined;
  try {
    const url = new URL(databaseUrl);
    // O WHATWG URL garante a porta numérica: uma porta fora da faixa faz o
    // parse LERRAR, e uma porta vazia é a padrão.
    const porta = url.port === '' ? PORTA_PADRAO : Number(url.port);
    if (url.hostname === '') return undefined;
    return { host: url.hostname, porta };
  } catch {
    return undefined;
  }
}

/** A asserção do banco, com a auto-recuperação (religar o container parado). */
export async function verificarBanco(
  valores: Record<string, string>,
  efeitos: EfeitosDoBanco = EFEITOS_REAIS,
): Promise<{ ok: boolean; veredito: VereditoAmbiente }> {
  const url = valores['DATABASE_URL'];
  const alvo = url === undefined ? undefined : alvoDoBanco(url);

  if (alvo === undefined) {
    // ⚠️ AUSENTE e INVÁLIDA são defeitos diferentes: mandar o usuário atrás
    // de uma variável que ele TEM (mas está com erro de digitação) é pior que
    // não dizer nada.
    const invalida = url !== undefined && url.trim() !== '';
    return {
      ok: false,
      veredito: {
        ok: false,
        rotulo: 'banco local',
        codigo: invalida ? 'database-url-invalida' : 'sem-database-url',
        mensagem: invalida
          ? 'a DATABASE_URL não é uma URL válida — o banco local não pode ser alcançado.'
          : 'não há DATABASE_URL para ler o alvo do banco.',
      },
    };
  }

  const alcanavel = await efeitos.portaAberta(alvo.host, alvo.porta);
  const container = efeitos.inspecionarContainer(CONTAINER_DO_BANCO_LOCAL, alvo.porta);
  let veredito = decideSobreBanco({
    bancoAlcancavel: alcanavel,
    host: alvo.host,
    porta: alvo.porta,
    containerExiste: container.existe,
    containerParado: container.existe && !container.rodando,
    containerPublicaPorta: container.publicaPorta,
    imagem: container.imagem,
  });

  if (!veredito.ok && veredito.codigo === 'subir-container') {
    console.log(
      `[ambiente:check] → religando o container \`${CONTAINER_DO_BANCO_LOCAL}\` (ele existe e está parado)`,
    );
    if (!efeitos.subirContainer(CONTAINER_DO_BANCO_LOCAL)) {
      return {
        ok: false,
        veredito: {
          ok: false,
          rotulo: 'banco local',
          codigo: 'container-nao-subiu',
          mensagem: `o container \`${CONTAINER_DO_BANCO_LOCAL}\` não subiu (docker disponível? permissão no socket?).`,
          comando: `docker start ${CONTAINER_DO_BANCO_LOCAL}`,
        },
      };
    }
    const porta = await efeitos.esperarPorta(alvo.host, alvo.porta, PRAZO_DO_BANCO_MS);
    // ⚠️ A porta abrir NÃO é o banco estar pronto: o `docker-proxy` sobe antes
    // do Postgres aceitar conexão. Por isso os DOIS são esperados.
    const pronto = porta
      ? await efeitos.esperarPostgresPronto(CONTAINER_DO_BANCO_LOCAL, PRAZO_DO_BANCO_MS)
      : false;
    if (porta && pronto) {
      return {
        ok: true,
        veredito: {
          ok: true,
          rotulo: 'banco local',
          mensagem: `no ar (${alvo.host}:${alvo.porta}) — container religado`,
        },
      };
    }
    veredito = {
      ok: false,
      rotulo: 'banco local',
      codigo: 'container-sem-resposta',
      mensagem: porta
        ? `o container \`${CONTAINER_DO_BANCO_LOCAL}\` subiu e a porta ${alvo.porta} abriu, ` +
          'mas o Postgres não ficou pronto para aceitar conexão.'
        : `o container \`${CONTAINER_DO_BANCO_LOCAL}\` subiu, mas a porta ${alvo.porta} não respondeu.`,
      comando: `docker logs ${CONTAINER_DO_BANCO_LOCAL}`,
    };
  }

  return { ok: veredito.ok, veredito };
}

// ── o relatório ─────────────────────────────────────────────────────────────

/** Imprime o veredito de uma asserção. */
export function relatar(veredito: VereditoAmbiente): boolean {
  if (veredito.ok) {
    console.log(`[ambiente:check] ✓ ${veredito.rotulo}: ${veredito.mensagem}`);
    return true;
  }
  console.error(`[ambiente:check] ✗ ${veredito.rotulo}: ${veredito.mensagem}`);
  if (veredito.comando !== undefined) {
    console.error(`[ambiente:check]   → ${veredito.comando}`);
  }
  return false;
}

/** A asserção da porta da API. */
export async function verificarPorta(valores: Record<string, string>): Promise<VereditoAmbiente> {
  const porta = Number(valores['PORT'] ?? 3000);
  if (!Number.isInteger(porta) || porta <= 0 || porta > 65535) {
    // ⚠️ `connect({ port })` exige 0..65535: um PORT fora da faixa estouraria a
    // Promise com o erro cru do Node — exatamente a classe de "erro cru" que
    // este check existe para eliminar.
    return {
      ok: false,
      rotulo: 'porta da API',
      codigo: 'porta-invalida',
      mensagem: `PORT="${valores['PORT'] ?? ''}" não é uma porta válida (1..65535).`,
    };
  }
  const ocupada = await portaAberta('127.0.0.1', porta);
  return decideSobrePorta({
    porta,
    ocupada,
    containersNaPorta: ocupada ? containersNaPorta(porta) : [],
  });
}

// ── o entrypoint ────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const { arquivoExiste, valores } = lerAmbienteLocal();
  let tudoOk = true;

  tudoOk =
    relatar(
      decideSobreEnv({
        arquivoExiste,
        temDatabaseUrl: (valores['DATABASE_URL'] ?? '').trim() !== '',
        temSystemDatabaseUrl: (valores['SYSTEM_DATABASE_URL'] ?? '').trim() !== '',
        ambiente: valores['NODE_ENV'],
        jwtSecret: valores['JWT_SECRET'],
      }),
    ) && tudoOk;

  tudoOk = relatar(decideSobrePrismaClient({ clienteGerado: clienteDoPrismaGerado() })) && tudoOk;

  const banco = await verificarBanco(valores);
  tudoOk = relatar(banco.veredito) && tudoOk;

  tudoOk = relatar(await verificarPorta(valores)) && tudoOk;

  if (tudoOk) {
    // ⚠️ "verificado", não "pronto": o check mede o que ele mede (variáveis,
    // Prisma Client, banco, porta). A POLÍTICA do JWT_SECRET (tamanho,
    // placeholder) é do app, que recusa o boot com mensagem própria — e o
    // `NODE_ENV` de produção muda o que a API exige.
    console.log('[ambiente:check] ✓ o que este check mede está em ordem — suba a aplicação.');
    return 0;
  }
  console.error('[ambiente:check] ✗ ambiente local NÃO está pronto (acima está o que falta).');
  return 1;
}

if (process.argv[1]?.endsWith('ambiente-local.ts')) {
  main().then(
    (codigo) => {
      process.exitCode = codigo;
    },
    (erro: unknown) => {
      console.error('[ambiente:check] FALHA:', erro instanceof Error ? erro.message : String(erro));
      process.exitCode = 1;
    },
  );
}
