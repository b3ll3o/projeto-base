// .tooling/scripts/ci/ambiente-local.ts
//
// ⚠️ SEM SHEBANG, DE PROPÓSITO. O `check-harness-owner` classifica como
// HARNESS ÓRFÃO todo arquivo de `.tooling/scripts/ci/` que tem shebang, cujo
// nome não começa com `check-` e não está na lista fechada `INFRASTRUCTURE`
// (`preflight.ts`, `check-types.ts`). Este script é invocado por
// `tsx <path>` a partir do script da raiz — não precisa de shebang.
//
// pt-BR: o preflight do AMBIENTE LOCAL.
//
// POR QUE ISTO EXISTE
//
// MEDIDO em 2026-11-03: `pnpm dev` morreu com 20 linhas de stack do Prisma
// dizendo `Can't reach database server at localhost:5432`. A stack diz o
// SINTOMA; a CAUSA (desde o #91 o `postgres` do Compose usa só `expose:`, e a
// máquina não o alcança) e o REMÉDIO (o container `projeto-base-pg-local`)
// estavam escritos no runbook §1.1 — longe do terminal de quem_ERROU.
//
// O `pnpm dev` é o caminho que quem desenvolve usa TODA hora. Ele não tinha
// NENHUMA verificação antes de subir a aplicação. Este script é a verificação
// que faltava: cinco asserções do ambiente local, cada uma com a decisão em
// FUNÇÃO PURA (testável sem máquina) e o efeito isolado.
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

/** O host que é a máquina de quem desenvolve. */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1']);

/** Quanto esperar o Postgres abrir a porta depois do `docker start`. */
const PRAZO_DO_BANCO_MS = 15_000;

/** O veredito de uma asserção. */
export type VereditoAmbiente =
  | { ok: true; rotulo: string; mensagem: string }
  | { ok: false; rotulo: string; codigo: string; mensagem: string; comando?: string };

// ── as decisões (puras) ─────────────────────────────────────────────────────

/** O que o check sabe do arquivo de ambiente da API. */
export interface EstadoDoEnv {
  arquivoExiste: boolean;
  temDatabaseUrl: boolean;
  jwtSecret: string | undefined;
}

/**
 * A API tem `DATABASE_URL` e `JWT_SECRET`?
 *
 * ⚠️ O que a API precisa são as VARIÁVEIS, não o arquivo: o `ConfigModule`
 * junta o `process.env` com o `apps/api/.env`, e quem exporta as duas no
 * ambiente também sobe a API. Por isso o arquivo é só um sinal — e a falha
 * declarada é a variável faltando, não o arquivo.
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

  return { ok: true, rotulo, mensagem: 'com DATABASE_URL e JWT_SECRET' };
}

/** O que o check sabe do Prisma Client gerado. */
export interface EstadoDoPrismaClient {
  clienteGerado: boolean;
}

/**
 * O Prisma Client está gerado?
 *
 * O sintoma de não estar é `Cannot find module '.prisma/client/default'` — e
 * a causa provável é o CACHE DO TURBO servir a task `db:generate` sem rodar
 * o `prisma generate` (runbook §1.3).
 */
export function decideSobrePrismaClient(estado: EstadoDoPrismaClient): VereditoAmbiente {
  const rotulo = 'Prisma Client';
  if (!estado.clienteGerado) {
    return {
      ok: false,
      rotulo,
      codigo: 'sem-prisma-client',
      mensagem:
        'o Prisma Client não está gerado — a API morre com "Cannot find module ' +
        "'.prisma/client/default' (o cache do turbo pode servir a task sem rodar o generate).",
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

  if (!HOSTS_LOCAIS.has(estado.host)) {
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

  return {
    ok: false,
    rotulo,
    codigo: 'banco-mudo',
    mensagem:
      `não responde em ${endereco}. O container existe e está de pé, mas a porta ` +
      `não abre — o DATABASE_URL aponta para uma porta que ele não publica (ele publica ${PORTA_PADRAO}).`,
  };
}

/** O que o check sabe da porta da API. */
export interface EstadoDaPorta {
  porta: number;
  ocupada: boolean;
  containersNaPorta: string[];
}

/**
 * A porta da API está livre?
 *
 * ⚠️ O dono da porta é identificado SEM `lsof`/`ss` (não portáveis): o filtro
 * `publish` do Docker. E a mensagem NUNCA afirma o dono quando não dá para
 * saber — ela dá os dois remédios.
 */
export function decideSobrePorta(estado: EstadoDaPorta): VereditoAmbiente {
  const rotulo = `porta da API (:${estado.porta})`;

  if (!estado.ocupada) {
    return { ok: true, rotulo, mensagem: 'livre' };
  }

  const containers = estado.containersNaPorta;
  if (containers.length > 0) {
    const nomes = containers.map((n) => `\`${n}\``).join(', ');
    return {
      ok: false,
      rotulo,
      codigo: 'porta-no-container',
      mensagem: `já está em uso por ${nomes}. A API local não sobe enquanto a porta estiver ocupada.`,
      comando: `docker compose stop api   # ou, se não for o Compose: docker stop ${containers[0]}`,
    };
  }

  return {
    ok: false,
    rotulo,
    codigo: 'porta-no-processo',
    mensagem: 'já está em uso por um processo local — a API local não sobe assim.',
    comando: 'pkill -f "turbo run dev"   # um `pnpm dev` anterior',
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

/** O Prisma Client gerado existe? */
export function clienteDoPrismaGerado(): boolean {
  try {
    const req = createRequire(join(API_DIR, 'package.json'));
    const pacote = req.resolve('@prisma/client/package.json');
    const dir = join(pacote, '..', '..', '..');
    // Layout pnpm: `<store>/node_modules/.prisma/client`. Layout plano
    // (npm/yarn): `<root>/node_modules/.prisma/client`. Os dois são "dois
    // níveis acima do pacote" — e os dois são testados, porque o layout não
    // é uma coisa que o repo controle.
    return existsSync(join(dir, '.prisma', 'client', 'default.js'));
  } catch {
    return false;
  }
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
 * gate `check-shell-injection` recusa a forma interpolada.
 */
export function inspecionarContainer(nome: string, porta: number): EstadoDoContainer {
  const interrogando = (formato: string): string | undefined => {
    try {
      return execFileSync('docker', ['inspect', '--format', formato, nome], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
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

/** Os containers que publicam a porta dada. */
export function containersNaPorta(porta: number): string[] {
  try {
    const saida = execFileSync(
      'docker',
      ['ps', '--filter', `publish=${porta}`, '--format', '{{.Names}}'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return saida
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
  } catch {
    return [];
  }
}

/** Religa o container do banco local. */
export function subirContainer(nome: string): boolean {
  try {
    execFileSync('docker', ['start', nome], { stdio: 'ignore' });
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

/** O host e a porta do banco, lidos da URI (sem credencial no relatório). */
export function alvoDoBanco(
  databaseUrl: string | undefined,
): { host: string; porta: number } | undefined {
  if (databaseUrl === undefined || databaseUrl.trim() === '') return undefined;
  try {
    const url = new URL(databaseUrl);
    const porta = url.port === '' ? PORTA_PADRAO : Number(url.port);
    if (url.hostname === '' || Number.isNaN(porta)) return undefined;
    return { host: url.hostname, porta };
  } catch {
    return undefined;
  }
}

/** A asserção do banco, com a auto-recuperação (religar o container parado). */
async function verificarBanco(
  valores: Record<string, string>,
): Promise<{ ok: boolean; veredito: VereditoAmbiente }> {
  const alvo = alvoDoBanco(valores['DATABASE_URL']);
  if (alvo === undefined) {
    return {
      ok: false,
      veredito: {
        ok: false,
        rotulo: 'banco local',
        codigo: 'sem-database-url',
        mensagem: 'não há DATABASE_URL para ler o alvo do banco.',
      },
    };
  }

  const alcanavel = await portaAberta(alvo.host, alvo.porta);
  const container = inspecionarContainer(CONTAINER_DO_BANCO_LOCAL, alvo.porta);
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
    if (!subirContainer(CONTAINER_DO_BANCO_LOCAL)) {
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
    const abriu = await esperarPorta(alvo.host, alvo.porta, PRAZO_DO_BANCO_MS);
    if (abriu) {
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
      mensagem: `o container \`${CONTAINER_DO_BANCO_LOCAL}\` subiu, mas a porta ${alvo.porta} não respondeu.`,
    };
  }

  return { ok: veredito.ok, veredito };
}

/** A asserção da porta da API. */
async function verificarPorta(valores: Record<string, string>): Promise<VereditoAmbiente> {
  const porta = Number(valores['PORT'] ?? 3000);
  if (Number.isNaN(porta) || porta <= 0) {
    return { ok: true, rotulo: `porta da API (:${porta})`, mensagem: 'PORT inválido — pulada' };
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
        jwtSecret: valores['JWT_SECRET'],
      }),
    ) && tudoOk;

  tudoOk = relatar(decideSobrePrismaClient({ clienteGerado: clienteDoPrismaGerado() })) && tudoOk;

  const banco = await verificarBanco(valores);
  tudoOk = relatar(banco.veredito) && tudoOk;

  tudoOk = relatar(await verificarPorta(valores)) && tudoOk;

  if (tudoOk) {
    console.log('[ambiente:check] ✓ ambiente local pronto — suba a aplicação.');
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
