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
import { traceIdDe } from './trace-id.js';
import type { ProblemDetailsDto, ProblemDetailsError } from '@projeto/shared-types';
import { DETALHE_DE_ERRO_INTERNO, mapExceptionToHttp } from './domain-exception-to-http.js';

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
    // pt-BR: prioridade para traceId W3C do span OTel ativo (32 hex chars),
    // correlacionando respostas HTTP com traces no backend OTel. Fallback
    // para request.id (Fastify) preserva compat com teste t-42 e logs já
    // existentes.
    //
    // pt-BR (#111): a derivação foi EXTRAÍDA para `traceIdDe`, porque o log de
    // bloqueio de feature flag precisa do MESMO id. As duas cópias concordavam
    // nos dois primeiros ramos e divergiam no terceiro — o `randomUUID()` de
    // cada lado. Agora o último recurso grava no request e as duas leituras
    // recebem o mesmo valor.
    const traceId = traceIdDe(request);

    const { status, code, title, detail, errors } = this.mapException(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // pt-BR (#130): o LOG carrega a mensagem ORIGINAL — o `detail` da
      // resposta pode ser genérico, e é o log que serve de diagnóstico.
      // Trocar os dois (logar o genérico) apagaria a única pista que
      // sobraria do erro.
      this.logger.error(
        `[${traceId}] ${request.method} ${request.url} -> ${code}: ${this.mensagemOriginal(exception)}`,
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

      // ⚠️ (#130) A MESMA REGRA DOS DOIS RAMOS: um 5xx NUNCA devolve a
      // mensagem original. Valia só no ramo de exceção não-HttpException, e
      // um `HttpException` de 5xx (`new InternalServerErrorException('a
      // senha do banco é X')`) continuava vazando o texto cru.
      //
      // O `detail` do response-OBJETO (`r['detail']` / `r['message']`) é o
      // contrato estruturado que a aplicação montou — e ele é preservado
      // ABAIXO de 500, onde ele é a informação que o cliente precisa.
      if (typeof resp === 'object' && resp !== null) {
        const r = resp as Record<string, unknown>;
        const detail =
          status >= HttpStatus.INTERNAL_SERVER_ERROR
            ? DETALHE_DE_ERRO_INTERNO
            : typeof r['detail'] === 'string'
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
        detail:
          status >= HttpStatus.INTERNAL_SERVER_ERROR
            ? DETALHE_DE_ERRO_INTERNO
            : typeof resp === 'string'
              ? resp
              : exception.message,
      };
    }

    // Exceções de domínio ou application, ou Error puro → mapper puro (Fase 7.2).
    const mapped = mapExceptionToHttp(exception);
    return {
      status: mapped.status,
      code: mapped.code,
      title: mapped.title,
      // pt-BR (#130): o `detail` que o mapper devolve é o ÚNICO caso em que
      // a mensagem original NÃO pode chegar ao cliente — e o mapper só o
      // devolve quando NÃO reconheceu a exceção (driver do Prisma, erro de
      // rede, `TypeError`). Quando o mapper reconheceu, a mensagem é texto
      // NOSSO (o motivo do convite, o campo inválido) e pode ir.
      detail: mapped.detail ?? this.mensagemOriginal(exception),
      // pt-BR: `errors[]` do mapper precisa chegar ao corpo. Sem esta
      // propagação, um 400 de VO saía sem `errors` e o Server Action do
      // web caía em `ERRO_GENERICO` em vez de apontar o campo.
      ...(mapped.errors !== undefined ? { errors: mapped.errors } : {}),
    };
  }

  /**
   * A mensagem original da exceção — a que vai para o LOG, e a que pode ir
   * para o corpo quando o mapper reconheceu a exceção (#130).
   */
  private mensagemOriginal(exception: unknown): string {
    return exception instanceof Error ? exception.message : String(exception);
  }

  private codeFromStatus(status: number): string {
    return HttpStatus[status]?.toString().replace(/ /g, '_').toUpperCase() ?? 'ERROR';
  }
}
