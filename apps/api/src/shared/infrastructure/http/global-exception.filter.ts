// apps/api/src/shared/infrastructure/http/global-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyAdapter } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';

// pt-BR: shape idêntico ao de @projeto/shared-types (Fase 3 não declara
// a dep em apps/api). Substituir pelo import real quando a dependência
// for adicionada ao package.json.
interface ProblemDetailsDto {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

// pt-BR: extraído de @nestjs/platform-fastify (TReply do FastifyAdapter)
// porque o pacote 'fastify' não é dep direta de @projeto/api nesta fase.
type FastifyReply = Parameters<FastifyAdapter['setHeader']>[0];

/**
 * Filter global: converte TODA exceção em RFC 7807 Problem Details.
 * Cada erro carrega: type, title, status, detail, instance, code, traceId.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<{ url: string; method: string; id?: string }>();
    const traceId = request.id ?? randomUUID();

    const { status, title, code, detail } = this.mapException(exception);
    const problem: ProblemDetailsDto = {
      type: `https://errors.projeto.com/${code}`,
      title,
      status,
      detail,
      instance: request.url,
      code,
      traceId,
    };

    void reply.status(status).send(problem);
  }

  private mapException(exception: unknown): {
    status: number;
    title: string;
    code: string;
    detail: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        title: HttpStatus[status] ?? 'Erro HTTP',
        code: this.codeFromStatus(status),
        detail: exception.message,
      };
    }
    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        title: 'Erro interno',
        code: 'INTERNAL_ERROR',
        detail: exception.message,
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Erro desconhecido',
      code: 'UNKNOWN',
      detail: String(exception),
    };
  }

  private codeFromStatus(status: number): string {
    return HttpStatus[status]?.toString().replace(/ /g, '_').toUpperCase() ?? 'ERROR';
  }
}
