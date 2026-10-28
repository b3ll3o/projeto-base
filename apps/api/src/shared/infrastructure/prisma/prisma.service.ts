import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { verificarCredenciaisDoBanco } from './credenciais-do-banco.js';

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

    await this.$connect();
    this.logger.log('Prisma conectado');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
