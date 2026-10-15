// apps/api/src/shared/infrastructure/http/domain-exception-to-http.spec.ts
import { describe, it, expect } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { mapExceptionToHttp } from './domain-exception-to-http.js';
import {
  UserNotFoundException,
  EmailAlreadyInUseException,
  ConcurrencyException,
  UserDeletedException,
  InvalidRestoreException,
  UserValidationException,
} from '../../../modules/users/domain/exceptions/user.exceptions.js';
import { InvalidCredentialsException } from '../../../modules/auth/domain/exceptions/auth.exceptions.js';
import { InvalidTokenException } from '../../../modules/auth/domain/exceptions/token.exceptions.js';
import {
  AuditHistoryNotFoundException,
  AuditArchiveNotFoundException,
} from '../../audit/domain/audit.exceptions.js';
import {
  ApplicationValidationException,
  ApplicationResourceNotFoundException,
  ApplicationConcurrencyException,
  ApplicationResourceDeletedException,
  ApplicationInvalidRestoreException,
  ApplicationEmailAlreadyInUseException,
} from '../../../modules/users/application/exceptions/application.exceptions.js';

describe('mapExceptionToHttp (domain layer)', () => {
  it('UserNotFound → 404 USER_NOT_FOUND', () => {
    const m = mapExceptionToHttp(new UserNotFoundException('x'));
    expect(m.status).toBe(HttpStatus.NOT_FOUND);
    expect(m.code).toBe('USER_NOT_FOUND');
  });

  it('AuditHistoryNotFound → 404 HISTORY_NOT_FOUND', () => {
    const m = mapExceptionToHttp(
      new AuditHistoryNotFoundException({ entityName: 'User', entityId: 'x', version: 1 }),
    );
    expect(m.status).toBe(HttpStatus.NOT_FOUND);
    expect(m.code).toBe('HISTORY_NOT_FOUND');
  });

  it('AuditArchiveNotFound → 410 ARCHIVE_NOT_FOUND', () => {
    const m = mapExceptionToHttp(
      new AuditArchiveNotFoundException({ entityName: 'User', entityId: 'x' }),
    );
    expect(m.status).toBe(HttpStatus.GONE);
    expect(m.code).toBe('ARCHIVE_NOT_FOUND');
  });

  it('EmailAlreadyInUse → 409 EMAIL_IN_USE', () => {
    const m = mapExceptionToHttp(new EmailAlreadyInUseException('a@b.com'));
    expect(m.status).toBe(HttpStatus.CONFLICT);
    expect(m.code).toBe('EMAIL_IN_USE');
  });

  it('Concurrency → 412 CONCURRENCY_CONFLICT (optimistic lock, NÃO 409)', () => {
    const m = mapExceptionToHttp(new ConcurrencyException(3, 5));
    expect(m.status).toBe(HttpStatus.PRECONDITION_FAILED);
    expect(m.status).not.toBe(HttpStatus.CONFLICT);
    expect(m.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('UserDeleted → 410 USER_DELETED', () => {
    const m = mapExceptionToHttp(new UserDeletedException('x'));
    expect(m.status).toBe(HttpStatus.GONE);
    expect(m.code).toBe('USER_DELETED');
  });

  it('InvalidRestore → 422 INVALID_RESTORE', () => {
    const m = mapExceptionToHttp(new InvalidRestoreException('msg'));
    expect(m.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(m.code).toBe('INVALID_RESTORE');
  });
});

describe('mapExceptionToHttp (application layer)', () => {
  it('ApplicationResourceNotFoundException → 404 USER_NOT_FOUND', () => {
    const m = mapExceptionToHttp(new ApplicationResourceNotFoundException('User', 'u-1'));
    expect(m.status).toBe(HttpStatus.NOT_FOUND);
    expect(m.code).toBe('USER_NOT_FOUND');
  });

  it('ApplicationResourceDeletedException → 410 USER_DELETED', () => {
    const m = mapExceptionToHttp(new ApplicationResourceDeletedException('User', 'u-1'));
    expect(m.status).toBe(HttpStatus.GONE);
    expect(m.code).toBe('USER_DELETED');
  });

  it('ApplicationInvalidRestoreException → 422 INVALID_RESTORE', () => {
    const m = mapExceptionToHttp(new ApplicationInvalidRestoreException('msg'));
    expect(m.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(m.code).toBe('INVALID_RESTORE');
  });

  it('ApplicationEmailAlreadyInUseException → 409 EMAIL_IN_USE', () => {
    const m = mapExceptionToHttp(new ApplicationEmailAlreadyInUseException('a@b.com'));
    expect(m.status).toBe(HttpStatus.CONFLICT);
    expect(m.code).toBe('EMAIL_IN_USE');
  });

  it('ApplicationConcurrencyException → 412 CONCURRENCY_CONFLICT (NOT 409)', () => {
    const m = mapExceptionToHttp(new ApplicationConcurrencyException('User', 3, 5));
    expect(m.status).toBe(HttpStatus.PRECONDITION_FAILED);
    expect(m.status).not.toBe(HttpStatus.CONFLICT);
    expect(m.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('ApplicationValidationException → 400 VALIDATION_ERROR (no domain equivalent)', () => {
    const m = mapExceptionToHttp(new ApplicationValidationException('name', 'empty string'));
    expect(m.status).toBe(HttpStatus.BAD_REQUEST);
    expect(m.code).toBe('VALIDATION_ERROR');
  });

  it('UserValidationException → 400 VALIDATION_ERROR com errors[]', () => {
    const m = mapExceptionToHttp(
      new UserValidationException('nome', 'precisa de pelo menos 2 caracteres.'),
    );
    expect(m.status).toBe(HttpStatus.BAD_REQUEST);
    expect(m.code).toBe('VALIDATION_ERROR');
  });

  it('UserValidationException leva campo e motivo em errors[], não só o status', () => {
    // O `status` sozinho não basta: o consumidor (Server Action do web)
    // decide entre erro de campo e `ERRO_GENERICO` pelo `errors[]`. Um
    // 400 sem essa lista deixa a pessoa sem saber qual campo corrigir.
    const m = mapExceptionToHttp(
      new UserValidationException('email', 'pode ter no máximo 254 caracteres.'),
    );
    expect(m.errors).toEqual([
      { field: 'email', message: 'pode ter no máximo 254 caracteres.', code: 'VALIDATION_ERROR' },
    ]);
  });
});

describe('mapExceptionToHttp (regression)', () => {
  it('Error genérico → 500 INTERNAL (fall-through preservado após adicionar application cases)', () => {
    const m = mapExceptionToHttp(new Error('bug'));
    expect(m.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(m.code).toBe('INTERNAL');
  });

  it('Não-Error (string) → 500 INTERNAL (fall-through preservado)', () => {
    const m = mapExceptionToHttp('boom');
    expect(m.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(m.code).toBe('INTERNAL');
  });
});

describe('mapExceptionToHttp — InvalidCredentials (contrato E, Fase 5)', () => {
  // pt-BR: o motivo deste bloco existir é o `return` final do mapper. Uma
  // exceção de domínio que NÃO tem entrada própria no mapper não falha:
  // ela cai no fall-through e vira 500 INTERNAL — e o teste continua
  // verde, porque nenhum teste anterior cobria este caso. O sintoma real
  // seria o login respondendo 500 para senha errada.

  it('vira 401 INVALID_CREDENTIALS', () => {
    const m = mapExceptionToHttp(new InvalidCredentialsException());
    expect(m.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(m.code).toBe('INVALID_CREDENTIALS');
  });

  it('NÃO é 500 — este é o defeito que o registro evita', () => {
    const m = mapExceptionToHttp(new InvalidCredentialsException());
    expect(m.status).not.toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('o título não distingue e-mail inexistente de senha errada', () => {
    const m = mapExceptionToHttp(new InvalidCredentialsException());
    expect(m.title).not.toMatch(/email|e-mail|senha|password|usuário|user/i);
  });

  it('sobrevive ao `instanceof` vindo de outro arquivo (Object.setPrototypeOf)', () => {
    // pt-BR: sem o setPrototypeOf no construtor, esta linha vira false e
    // o caso acima cai no 500 — é o mesmo modo de falha do VO.
    expect(new InvalidCredentialsException()).toBeInstanceOf(InvalidCredentialsException);
  });
});

describe('mapExceptionToHttp — InvalidToken (Fase 6)', () => {
  // pt-BR: mesma razão do bloco da InvalidCredentialsException — sem
  // entrada no mapper, a exceção cai no fall-through e vira 500. E aqui o
  // 500 é pior: o `JwtAuthGuard` converte a exceção em 401 no caminho
  // normal, então uma fuga deste mapper significaria que ALGUM caminho
  // (refresh, uso fora do guard) responde 500 para token inválido.

  it('vira 401 INVALID_TOKEN', () => {
    const m = mapExceptionToHttp(new InvalidTokenException('jwt expired'));
    expect(m.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(m.code).toBe('INVALID_TOKEN');
  });

  it('NÃO é 500 — este é o defeito que o registro evita', () => {
    const m = mapExceptionToHttp(new InvalidTokenException('jwt expired'));
    expect(m.status).not.toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('o motivo interno NÃO aparece no title nem no code', () => {
    // pt-BR: `motivo` existe para o log do servidor. Se ele aparecesse no
    // payload, "jwt expired" vs "invalid signature" viraria oráculo.
    const m = mapExceptionToHttp(new InvalidTokenException('jwt expired'));
    expect(m.code).not.toMatch(/expired|expirado/i);
    expect(m.title).not.toMatch(/expired|expirado|signature|assinatura/i);
  });

  it('o title é o mesmo para motivos diferentes (não distingue o caso)', () => {
    const expirado = mapExceptionToHttp(new InvalidTokenException('jwt expired'));
    const adulterado = mapExceptionToHttp(new InvalidTokenException('invalid signature'));
    expect(expirado.title).toBe(adulterado.title);
    expect(expirado.code).toBe(adulterado.code);
  });

  it('sobrevive ao `instanceof` vindo de outro arquivo já transpilado', () => {
    expect(new InvalidTokenException('x')).toBeInstanceOf(InvalidTokenException);
  });
});
