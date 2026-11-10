// apps/api/src/shared/idempotency/infrastructure/http/idempotency.interceptor.ts
//
// pt-BR (2026-11-10 — conformidade do system design): o INTERCEPTOR que
// torna o retry de escrita SEGURO.
//
// O QUE ELE FECHA
//
// `docs/system-design/dados.md` §6: "a lacuna real é que **retry não é
// seguro** — um cliente que repete por timeout não tem como saber se a
// primeira gravou, e recebe 409 no lugar de 201".
//
// COMO FUNCIONA
//
//   cliente ──► POST /api/v1/users
//              Idempotency-Key: 8f1c…
//
//   ┌─ este interceptor ─────────────────────────────────────────────┐
//   │ 1. sem header, ou método ≠ POST, ou rota de /auth → passa      │
//   │    direto (o comportamento de hoje, intacto)                    │
//   │ 2. imprime o PEDIDO (método + rota + corpo)                    │
//   │ 3. reserva a chave                                              │
//   │    livre    → executa                                          │
//   │    replay   → devolve a MESMA resposta, sem executar           │
//   │    conflito → 409 (a chave foi reusada com outro pedido)       │
//   │    em_voo   → 409 (a chave está reservada)                     │
//   │ 4. guarda a resposta (só quando deu 2xx)                       │
//   │    erro → libera a chave (o cliente pode repetir)              │
//   └────────────────────────────────────────────────────────────────┘
//
// ⚠️ A reserva é COMMITADA antes de a operação rodar: é isso que impede
// dois requests com a mesma chave de executarem ao mesmo tempo.
//
// ⚠️ `/auth` fica de fora: o bloco de auth tem semântica de SESSÃO (o
// refresh token é de uso único e é rotacionado), e um replay ali devolveria
// um token já consumido. A decisão está no ADR-0011.

import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { of, type Observable } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import {
  ATOR_ANONIMO,
  HEADER_DE_IDEMPOTENCIA,
  HEADER_DE_REPLAY,
  type IdempotencyPort,
} from '../../application/idempotency.port.js';
import { IDEMPOTENCY_PORT } from '../../shared/idempotency.tokens.js';

/**
 * O request — o MÍNIMO que o interceptor lê.
 *
 * ⚠️ É uma forma estrutural, e não o tipo do Fastify: `fastify` não é
 * dependência direta do `@projeto/api` (é do `@nestjs/platform-fastify`), e
 * o resto do repo extrai o que precisa do adapter — o mesmo caminho de
 * `users.controller.ts` (`type FastifyReply = Parameters<FastifyAdapter['setHeader']>[0]`).
 */
export interface RequestComIdempotencia {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  /**
   * O TEMPLATE da rota (`/api/v1/users`) — o Fastify 5 o expõe em
   * `request.routeOptions.url`. É ele que a impressão do pedido usa: a URL
   * com query não é o mesmo pedido.
   */
  routeOptions?: { url?: string };
  /** O ator — o `JwtAuthGuard` publica o `sub` aqui. */
  user?: { sub?: string };
}

/** O reply — o mínimo que o interceptor escreve. */
export interface ReplyComIdempotencia {
  statusCode: number;
  status(codigo: number): unknown;
  header(nome: string, valor: string): unknown;
}

/**
 * As rotas de `/auth` ficam de fora da idempotência.
 *
 * ⚠️ O casamento é por SEGMENTO (`/auth/` no fim ou no meio), e não por
 * prefixo de caminho — o prefixo global (`api/v1`) é do `main.ts` e não
 * mora aqui.
 */
const ROTAS_SEM_IDEMPOTENCIA = /\/auth(\/|$)/;

/** O header da chave: `string`, ou `undefined` quando não veio. */
function headerDe(req: RequestComIdempotencia, nome: string): string | undefined {
  const bruto = req.headers[nome];
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  if (typeof valor !== 'string') return undefined;
  const limpo = valor.trim();
  return limpo === '' ? undefined : limpo;
}

/**
 * O JSON com as chaves ORDENADAS — a impressão do pedido não pode depender
 * da ordem em que o cliente serializou o corpo.
 */
function jsonEstavel(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
  if (Array.isArray(valor)) return `[${valor.map(jsonEstavel).join(',')}]`;
  const objeto = valor as Record<string, unknown>;
  const chaves = Object.keys(objeto).sort();
  return `{${chaves
    .map((chave) => `${JSON.stringify(chave)}:${jsonEstavel(objeto[chave])}`)
    .join(',')}}`;
}

/**
 * A rota do pedido: o TEMPLATE (`/api/v1/users`), e não a URL com query.
 *
 * ⚠️ Dois pedidos que diferem só na query são o MESMO pedido para o retry.
 */
export function rotaDo(req: RequestComIdempotencia): string {
  const semQuery = req.url.split('?')[0];
  return req.routeOptions?.url ?? semQuery ?? req.url;
}

/**
 * A impressão do pedido: método + rota + corpo, em SHA-256.
 */
export function impressaoDoPedido(req: RequestComIdempotencia): string {
  const corpo = jsonEstavel(req.body);
  return createHash('sha256')
    .update(`${req.method}\n${rotaDo(req)}\n${corpo}`)
    .digest('hex');
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(@Inject(IDEMPOTENCY_PORT) private readonly idempotencia: IdempotencyPort) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<RequestComIdempotencia>();
    const reply = context.switchToHttp().getResponse<ReplyComIdempotencia>();

    const chave = headerDe(req, HEADER_DE_IDEMPOTENCIA);
    // Sem chave, o pedido é o que era: o cliente não pediu retry seguro.
    if (chave === undefined) return next.handle();
    if (req.method !== 'POST') return next.handle();

    const rota = rotaDo(req);
    if (ROTAS_SEM_IDEMPOTENCIA.test(rota)) return next.handle();

    const ator = req.user?.sub ?? ATOR_ANONIMO;
    const impressao = impressaoDoPedido(req);

    const reserva = await this.idempotencia.reservar({ chave, ator, rota, impressao });

    if (reserva.estado === 'replay') {
      // A MESMA resposta da primeira vez — e o header que diz que ela veio
      // da reserva, para o cliente (e para o log) saber.
      reply.status(reserva.status);
      reply.header(HEADER_DE_REPLAY, 'true');
      return of(reserva.resposta);
    }

    if (reserva.estado === 'conflito') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        detail: 'A chave de idempotência já foi usada com outro pedido.',
      });
    }

    if (reserva.estado === 'em_voo') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_IN_FLIGHT',
        detail: 'A chave de idempotência está em uso por outra requisição.',
      });
    }

    return next.handle().pipe(
      mergeMap(async (corpo: unknown) => {
        try {
          await this.idempotencia.guardar({
            chave,
            ator,
            status: reply.statusCode,
            resposta: corpo,
          });
        } catch (erro) {
          // ⚠️ A operação JÁ ACONTECEU (o handler devolveu 2xx). Guardar a
          // resposta é o que permite o replay — e falhar aqui NÃO pode
          // virar 500: o cliente repetiria, e o retry faria a operação
          // DUAS vezes. A chave fica reservada (o retry leva 409), que é
          // melhor do que duplicar.
          this.logger.error(
            `[Idempotencia] a resposta da chave ${chave} não foi guardada`,
            erro instanceof Error ? erro.stack : String(erro),
          );
        }
        return corpo;
      }),
      catchError(async (erro: unknown) => {
        // A operação NÃO deu 2xx: a chave é liberada, para o cliente poder
        // repetir com a mesma chave.
        try {
          await this.idempotencia.liberar({ chave, ator });
        } catch (falha) {
          this.logger.error(
            `[Idempotencia] a chave ${chave} não foi liberada`,
            falha instanceof Error ? falha.stack : String(falha),
          );
        }
        throw erro;
      }),
    );
  }
}
