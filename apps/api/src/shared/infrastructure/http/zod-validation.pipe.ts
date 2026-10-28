// apps/api/src/shared/infrastructure/http/zod-validation.pipe.ts
//
// Pipe global que valida payloads via Zod, retornando erros no formato
// RFC 7807 Problem Details (Fastify/NestJS).
//
// pt-BR:
// - Registrado globalmente em main.ts com schema default `z.any()` (noop).
// - Cada rota sobrescreve via `@Body(new ZodValidationPipe(CreateUserSchema))`.
// - Erros são acumulados como `errors[]` no body do BadRequestException,
//   para o GlobalExceptionFilter propagar no shape RFC 7807.

import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema, ZodTypeAny, z } from 'zod';

/**
 * Valida um valor contra um schema Zod e devolve o valor VALIDADO.
 *
 * ⚠️ #124: o mapeamento de erro (o shape RFC 7807) mora AQUI, e não dentro
 * do pipe — porque a mesma validação é preciso fora do pipe. O `GET /users`
 * valida a QUERY no corpo do método (o `@Query()` com pipe não roda quando o
 * handler é chamado direto, e a spec do controller chama direto — a validação
 * que a spec mede tem de rodar no caminho que a spec exercita).
 */
export function validarComZod<S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const errors = result.error as ZodError;
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      detail: 'Falha de validação',
      errors: errors.errors.map((e) => ({
        field: e.path.join('.') || '(root)',
        message: e.message,
        code: e.code,
      })),
    });
  }
  return result.data as z.output<S>;
}

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    return validarComZod(this.schema, value) as T;
  }
}
