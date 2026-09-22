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
import { ZodError, ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
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
    return result.data;
  }
}
