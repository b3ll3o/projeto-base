// apps/api/src/shared/infrastructure/http/fastify-reply.type.ts
import type { FastifyAdapter } from '@nestjs/platform-fastify';

/**
 * O reply do Fastify que a camada HTTP do app usa.
 *
 * pt-BR: 'fastify' não é dep direta de @projeto/api, então o tipo vem do
 * adaptador. `ReturnType<FastifyAdapter['reply']>` é o TReply do adaptador.
 * `Parameters<FastifyAdapter['setHeader']>[0]` deixou de servir no NestJS 12:
 * o `setHeader` passou a aceitar também a resposta crua, e o Parameters
 * devolvia a união `ServerResponse | FastifyReply` — sem `header()` nem
 * `status()`.
 */
export type FastifyReply = ReturnType<FastifyAdapter['reply']>;
