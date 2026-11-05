import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { verificarCredenciaisDoBanco } from './credenciais-do-banco.js';
import { traduzirFalhaDeConexao } from './traducao-de-falha-de-conexao.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // Registra handlers de evento (sincronizado com o array log: acima).
    // Sem esses $on, queries ficam silenciosamente não-logadas (gap G-007
    // do state-snapshot telemetria).
    this.$on('query' as never, (e: { query: string; duration: number }) => {
      this.logger.debug({ sql: e.query, durationMs: e.duration }, 'prisma query');
    });
    this.$on('error' as never, (e: { message: string }) => {
      this.logger.error({ err: e.message }, 'prisma error');
    });
    this.$on('warn' as never, (e: { message: string }) => {
      this.logger.warn({ msg: e.message }, 'prisma warn');
    });
  }

  async onModuleInit(): Promise<void> {
    // #118: o guard das credenciais roda ANTES de conectar. Uma credencial
    // exposta (a senha do papel de runtime está no histórico do Git) ou a
    // ausência da credencial de SISTEMA têm que matar o boot aqui — e não
    // aparecer como um comportamento estranho na primeira requisição.
    const veredito = verificarCredenciaisDoBanco({
      NODE_ENV: process.env['NODE_ENV'],
      DATABASE_URL: process.env['DATABASE_URL'],
      SYSTEM_DATABASE_URL: process.env['SYSTEM_DATABASE_URL'],
    });
    if (!veredito.ok) {
      throw new Error(`Credenciais do banco recusadas: ${veredito.motivo}`);
    }

    // ⚠️ Só o `$connect()` é protegido. O guard de credenciais (acima) já
    // lança um `Error` legível e não se mexe.
    //
    // O P1001 ("banco inalcançável") é traduzido na causa e no remédio: o
    // erro cru do Prisma diz o SINTOMA e nada mais — a causa (o `postgres`
    // do Compose usa só `expose:` desde o #91, e a máquina não o alcança) e o
    // remédio (o container `projeto-base-pg-local`) estão no runbook §1.1, e
    // ninguém chega lá olhando uma stack.
    //
    // ⚠️ `throw erro` (e não `throw new Error(...)`) preserva a INSTÂNCIA e o
    // stack do que NÃO é P1001 — a tradução não mascara o que ela não sabe.
    //
    // ⚠️ Sem `process.exit` aqui dentro: quem encerra o processo é o
    // `bootstrap().catch()` do `main.ts`. Sair dentro do hook mataria sem
    // `$disconnect`.
    try {
      await this.$connect();
    } catch (erro) {
      const traducao = traduzirFalhaDeConexao(erro);
      if (traducao === undefined) throw erro;
      // O `cause` (Node 16.9+) guarda o erro original do Prisma sem alterar a
      // mensagem — a traduzida continua sendo a primeira coisa que se lê, e
      // quem depura tem o stack do Prisma inteiro em vez de uma string.
      //
      // ⚠️ POR QUE ISSO NÃO VAZA A CREDENCIAL — e o motivo NÃO é o `Logger`:
      // o `cause` **entra** no log de boot. O `main.ts` faz
      // `console.error('Bootstrap falhou:', err)`, e o `util.inspect` do Node
      // imprime a cadeia `[cause]` inteira.
      //
      // O que segura a credencial é o **CONTEÚDO** do erro do Prisma. MEDIDO
      // no Prisma 6.19.3, com um P1001 de verdade (a URI com a senha no
      // `DATABASE_URL`): a mensagem é "Can't reach database server at
      // `host:port`" — ela nomeia o ALVO, não a URL; as propriedades
      // enumeráveis são só `clientVersion`, `errorCode`, `retryable` e
      // `name`; e nem a mensagem, nem o `stack`, nem o `util.inspect` têm a
      // senha. A spec do `prisma.service` afirma isso no CANAL que imprime.
      throw new Error(traducao, { cause: erro });
    }
    this.logger.log('Prisma conectado');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
