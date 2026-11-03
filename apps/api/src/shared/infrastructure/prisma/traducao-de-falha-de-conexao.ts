// apps/api/src/shared/infrastructure/prisma/traducao-de-falha-de-conexao.ts
//
// pt-BR: traduz o P1001 do Prisma — "banco inalcançável" — na causa e no
// remédio que a pessoa precisa.
//
// POR QUE ISTO EXISTE
//
// MEDIDO em 2026-11-03: o `pnpm dev` morreu com 20 linhas de stack do Prisma
// dizendo `Can't reach database server at localhost:5432`. A stack diz o
// SINTOMA; não diz a CAUSA (o `postgres` do Compose usa só `expose:` desde o
// #91 — a API na máquina não o alcança) nem o REMÉDIO (o banco local é um
// container à parte, o `projeto-base-pg-local`).
//
// A causa e o remédio estão escritos no `docs/como-rodar.md` §1.1. O que
// faltava era o **código** dizer isso no momento em que a pessoa está olhando.
//
// ⚠️ POR QUE SÓ O P1001
//
// `P1000` (credencial recusada) e `P1003` (banco não existe) nomeiam o
// problema melhor do que nós — e já têm dono: o guard
// `verificarCredenciaisDoBanco` (#118) recusa a senha exposta ANTES do
// connect, e o `prepara-papeis.sh` (§1.2.1) aplica a senha dos papéis.
// Traduzir só o P1001 é uma LIMITAÇÃO ACEITA, e o gatilho para ampliar é
// alguém bater em P1000/P1003 cru no boot.
//
// ⚠️ POR QUE DUCK-TYPING E NÃO `instanceof Prisma.*`
//
// A spec não pode depender do Prisma Client gerado — `prisma generate` não
// roda no `test:unit`, e a spec precisa ser verde no clone novo. O `errorCode`
// é o que o Prisma publica no erro, e ele é lido como propriedade: o mesmo
// que o `errorCode` de um erro qualquer faria, e por isso a função só traduz
// o que tem `errorCode === 'P1001'`.

/** O erro do Prisma, visto só pelo que a tradução precisa. */
interface ErroDoPrisma {
  errorCode?: unknown;
}

/** O alvo do banco: host e porta, **sem** user e **sem** senha. */
interface AlvoDoBanco {
  host: string;
  porta: number;
}

/** O host que é a máquina de quem desenvolve. */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1']);

/** O container do banco local — o dono do remédio. */
const CONTAINER_DO_BANCO_LOCAL = 'projeto-base-pg-local';

/**
 * O alvo (host/porta) da URL do banco, sem credencial.
 *
 * ⚠️ A URL do banco TEM credencial (`app_runtime:<senha>@host:5432`), e esta
 * mensagem vai para o log de boot — log é onde senha vaza. Então só o host e
 * a porta saem daqui; o usuário e a senha nunca.
 */
function alvoDoBanco(databaseUrl: string | undefined): AlvoDoBanco | undefined {
  if (databaseUrl === undefined || databaseUrl.trim() === '') return undefined;
  try {
    const url = new URL(databaseUrl);
    const porta = url.port === '' ? 5432 : Number(url.port);
    if (url.hostname === '' || Number.isNaN(porta)) return undefined;
    return { host: url.hostname, porta };
  } catch {
    return undefined;
  }
}

/**
 * O erro do Prisma é o P1001 (banco inalcançável)?
 *
 * Duck-typing proposital: o `errorCode` é lido como propriedade, e o tipo do
 * erro não é testado — assim a spec não depende do Client gerado.
 */
function ehP1001(erro: unknown): boolean {
  if (erro === null || typeof erro !== 'object') return false;
  return (erro as ErroDoPrisma).errorCode === 'P1001';
}

/**
 * Traduz a falha de conexão do Prisma numa mensagem que a pessoa consegue
 * usar.
 *
 * Devolve `undefined` quando o erro **não** é P1001 — o caller repassa o
 * erro original intacto, com a instância e o stack.
 */
export function traduzirFalhaDeConexao(
  erro: unknown,
  databaseUrl: string | undefined,
): string | undefined {
  if (!ehP1001(erro)) return undefined;

  const alvo = alvoDoBanco(databaseUrl);
  const alvoLocal = alvo !== undefined && HOSTS_LOCAIS.has(alvo.host);
  const endereco = alvo === undefined ? '' : `\`${alvo.host}:${alvo.porta}\``;

  if (!alvoLocal) {
    // Alvo não local: `postgres:5432` é o serviço do Compose, dentro da rede
    // Docker. Recomendar o container local aqui seria MANDAR a pessoa caçar
    // um container que não existe no host — o erro do Compose é outro.
    return (
      `O banco não está no ar: o Prisma não conseguiu alcançar ${endereco} (P1001).\n` +
      'O alvo não é local — se ele é um serviço do Compose, o problema é a rede ' +
      'ou o serviço do Compose, não o banco local da máquina.\n' +
      'Veja docs/como-rodar.md §1.1.'
    );
  }

  return (
    `O banco local não está no ar: o Prisma não conseguiu alcançar ${endereco} (P1001).\n` +
    '\n' +
    'Causa medida (2026-11-03): desde o #91 o serviço `postgres` do Compose usa só ' +
    '`expose: 5432`, sem `ports:` — ele NÃO é alcançável da máquina. O banco local ' +
    `é um container à parte, o \`${CONTAINER_DO_BANCO_LOCAL}\`.\n` +
    '\n' +
    'Para subir o banco local:\n' +
    `  docker start ${CONTAINER_DO_BANCO_LOCAL}\n` +
    '\n' +
    'A receita de criação (primeira vez) e o resto da explicação: ' +
    'docs/como-rodar.md §1.1.'
  );
}
