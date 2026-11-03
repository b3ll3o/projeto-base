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
// ⚠️ POR QUE O APP NÃO PARSEIA A URL DO BANCO
//
// A primeira versão desta função recebia o `DATABASE_URL` e extraía o alvo
// com `new URL(...)` — e o `.tooling/scripts/ci/ambiente-local.ts` fazia o
// MESMO, byte a byte. Duas cópias de uma decisão que decide **o que entra no
// log de boot**: se uma delas um dia ler `.username`/`.password`, a credencial
// vai para o log, e **nenhum gate do repo acusa** (o `analisa-repeticao` varre
// só `apps/api/src`, `apps/web/*` e `packages/shared-types/src` — o
// `.tooling/scripts/ci` está FORA da lista).
//
// A correção não é "importar de um lado": o app não pode importar do tooling
// (o `Dockerfile` copia só `apps/api`), e o tooling não importa do app por
// desenho (os gates medem o app lendo arquivos como TEXTO, para não acoplar
// duas unidades de build). A correção é **tirar o parser do app**: o alvo que
// o Prisma já escreveu na própria mensagem é o **dono** desse dado (a §2 da
// convenção `dry.md`: "o nome é de outro dono — um alias nosso seria um
// espelho que envelhece").
//
// E o efeito é de segurança, não só de estilo: **esta função deixa de receber
// a string que tem a senha**. Ela não descarta a credencial — ela nunca a vê.
// O alvo extraído ainda passa por um filtro que recusa qualquer coisa com
// `@` (a marca da credencial), então nem um alvo malformado vaza.
//
// MEDIDO em 2026-11-03 (Prisma 6.19.3): o `P1001` chega como
// `PrismaClientInitializationError` com `errorCode`, `message`,
// `clientVersion`, `retryable` e `name` — e **sem** `cause` estruturado
// (o `cause.host` existe no runtime do Prisma, mas só dentro da construção da
// mensagem). A mensagem é
// "Can't reach database server at `host:port`".
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

/** O host que é a máquina de quem desenvolve. */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1']);

/** O container do banco local — o dono do remédio. */
const CONTAINER_DO_BANCO_LOCAL = 'projeto-base-pg-local';

/**
 * O alvo (`host:porta`) que o Prisma escreveu na própria mensagem.
 *
 * A mensagem do P1001 é "Can't reach database server at `host:port`".
 *
 * ⚠️ O filtro de `@` é o que garante que ISTA função não pode imprimir uma
 * credencial: a marca da credencial (`user:senha@host`) é justamente o `@`,
 * e um alvo com `@` é descartado. A função também nunca recebe o
 * `DATABASE_URL` — ela não tem como vazar o que não recebeu.
 *
 * Devolve `undefined` quando o Prisma não nomeou o alvo (formato diferente do
 * esperado) — e o chamador cai na mensagem neutra, que ainda diz a causa e o
 * remédio.
 */
function alvoDaMensagem(mensagem: string): string | undefined {
  const achado = /at `([^`]+)`/.exec(mensagem);
  if (achado === null) return undefined;
  const alvo = achado[1];
  if (alvo === undefined || alvo.trim() === '') return undefined;
  // Só host e porta: sem `@` (credencial), sem barra (caminho), sem espaço.
  if (!/^[A-Za-z0-9._:-]+$/.test(alvo)) return undefined;
  return alvo;
}

/** O host do alvo `host:porta` (ou o alvo inteiro, se não tem porta). */
function hostDoAlvo(alvo: string): string {
  const separador = alvo.lastIndexOf(':');
  if (separador === -1) return alvo;
  return alvo.slice(0, separador);
}

/** A mensagem do erro — o erro pode não ser uma `Error` (a spec usa objeto). */
function mensagemDoErro(erro: unknown): string {
  if (erro !== null && typeof erro === 'object') {
    const mensagem = (erro as { message?: unknown }).message;
    if (typeof mensagem === 'string') return mensagem;
  }
  return '';
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
export function traduzirFalhaDeConexao(erro: unknown): string | undefined {
  if (!ehP1001(erro)) return undefined;

  const alvo = alvoDaMensagem(mensagemDoErro(erro));

  if (alvo === undefined) {
    // O Prisma não nomeou o alvo (formato diferente do esperado). A mensagem
    // continua dizendo a CAUSA e o que fazer — ela só não afirma se o alvo
    // é local, porque não sabe.
    return (
      'O banco não está no ar (P1001).\n' +
      '\n' +
      'O `pnpm ambiente:check` diz o que falta no ambiente local (credencial, ' +
      'Prisma Client, banco, porta da API) — e religa o banco local se ele estiver parado.\n' +
      '\n' +
      'Veja docs/como-rodar.md §1.1 e §1.4.'
    );
  }

  const endereco = `\`${alvo}\``;

  if (!HOSTS_LOCAIS.has(hostDoAlvo(alvo))) {
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
