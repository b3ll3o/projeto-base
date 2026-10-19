// apps/api/src/shared/infrastructure/http/trace-id.ts
//
// pt-BR (#111, 2026-10-19): a MESMA derivação de traceId para o log de
// bloqueio de feature flag e para o corpo do erro. Antes eram duas cópias
// divergentes — e divergiam no caso que mais importa.
//
// O problema medido: `registrarBloqueio` (feature-flag.guard.ts) usava
// `span ?? req.id ?? '-'` e o `GlobalExceptionFilter` usava
// `span ?? req.id ?? randomUUID()`. Nos DOIS primeiros ramos eles concordam; no
// terceiro, a linha de log e o erro que o usuário viu apontam para
// identificadores diferentes. É o caso em que a correlação — que é a razão de
// o log existir — é justamente a que não funciona.
//
// A correção não é "as duas cópias combinam por acaso nos dois primeiros
// ramos": é **uma** função, e o último recurso grava no request. Quem pedir
// primeiro fixa o id; quem pedir depois recebe o mesmo.

import { context, trace } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';

/** O mínimo do request de Fastify que a derivação usa. */
export interface RequestComTrace {
  id?: string;
  /**
   * O id que a PRIMEIRA derivação fixou. Ausente = ninguém pediu ainda.
   *
   * ⚠️ Não é um cache de conveniência: é o que faz o terceiro ramo convergir.
   * Sem ele, duas chamadas sem span e sem `request.id` produzem dois `randomUUID`
   * — e o log volta a apontar para um id que o erro não tem.
   */
  featureFlagTraceId?: string;
}

/**
 * O traceId de um request, na prioridade que o corpo do 404 já usava:
 * traceId W3C do span OTel ativo → `request.id` do Fastify → um UUID fixado no
 * request.
 *
 * ⚠️ O último recurso **grava no request** de propósito. Um `randomUUID()`
 * direto aqui seria o mesmo defeito que a função existia para tirar.
 */
export function traceIdDe(req: RequestComTrace | undefined): string {
  const span = trace.getSpan(context.active());
  const w3c = span?.spanContext().traceId;
  if (w3c !== undefined) return w3c;

  if (req?.id !== undefined) return req.id;

  if (req?.featureFlagTraceId !== undefined) return req.featureFlagTraceId;

  const novo = randomUUID();
  if (req !== undefined) req.featureFlagTraceId = novo;
  return novo;
}
