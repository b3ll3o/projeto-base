// apps/api/src/shared/infrastructure/http/global-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyAdapter } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import type { ProblemDetailsDto, ProblemDetailsError } from '@projeto/shared-types';
import { mapExceptionToHttp } from './domain-exception-to-http.js';

// pt-BR: extraído de @nestjs/platform-fastify (TReply do FastifyAdapter)
// porque o pacote 'fastify' não é dep direta de @projeto/api nesta fase.
type FastifyReply = Parameters<FastifyAdapter['setHeader']>[0];

/**
 * Filter global: converte TODA exceção em RFC 7807 Problem Details.
 *
 * Cada erro carrega: type, title, status, detail, instance, code, traceId e,
 * quando aplicável, errors[] (ex.: ZodValidationPipe).
 *
 * pt-BR: HttpException com response-objeto (ZodValidationPipe, BadRequestException
 * custom, etc.) preserva `code`/`detail`/`errors[]` do objeto em vez de cair no
 * default baseado em `exception.message`.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<{ url: string; method: string; id?: string }>();
    const traceId = request.id ?? randomUUID();

    const { status, code, title, detail, errors } = this.mapException(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${traceId}] ${request.method} ${request.url} -> ${code}: ${detail}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const instance = `${request.method} ${request.url}`;
    const problem: ProblemDetailsDto = {
      type: `https://errors.projeto.com/${code}`,
      title,
      status,
      detail,
      instance,
      code,
      traceId,
      ...(errors !== undefined ? { errors } : {}),
    };

    void reply.status(status).send(problem);
  }

  private mapException(exception: unknown): {
    status: number;
    code: string;
    title: string;
    detail: string;
    errors?: ProblemDetailsError[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();

      if (typeof resp === 'object' && resp !== null) {
        const r = resp as Record<string, unknown>;
        const detail =
          typeof r['detail'] === 'string'
            ? r['detail']
            : typeof r['message'] === 'string'
              ? r['message']
              : exception.message;
        const result: {
          status: number;
          code: string;
          title: string;
          detail: string;
          errors?: ProblemDetailsError[];
        } = {
          status,
          code: typeof r['code'] === 'string' ? r['code'] : this.codeFromStatus(status),
          title: typeof r['title'] === 'string' ? r['title'] : (HttpStatus[status] ?? 'Erro HTTP'),
          detail,
        };
        if (Array.isArray(r['errors'])) {
          result.errors = r['errors'] as ProblemDetailsError[];
        }
        return result;
      }

      // HttpException com response em formato string → comportamento legado.
      return {
        status,
        code: this.codeFromStatus(status),
        title: HttpStatus[status] ?? 'Erro HTTP',
        detail: typeof resp === 'string' ? resp : exception.message,
      };
    }

    // Exceções de domínio ou application, ou Error puro → mapper puro (Fase 7.2).
    const mapped = mapExceptionToHttp(exception);
    return {
      status: mapped.status,
      code: mapped.code,
      title: mapped.title,
      detail: exception instanceof Error ? exception.message : String(exception),
    };
  }

  private codeFromStatus(status: number): string {
    return HttpStatus[status]?.toString().replace(/ /g, '_').toUpperCase() ?? 'ERROR';
  }
}
