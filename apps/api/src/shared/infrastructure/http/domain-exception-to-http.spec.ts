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
import {
  ProfileNotFoundException,
  ProfileSlugAlreadyInUseException,
  ProfileSystemProtectedException,
  ProfileAdminProtectedException,
  ProfileHasUsersException,
  ProfilePrivilegeEscalationException,
  AuthorizationAlreadyAssignedException,
  AuthorizationNotFoundException,
  ConcurrencyException as ProfileConcurrencyException,
} from '../../../modules/profiles/domain/exceptions/profile.exceptions.js';
import { InvalidPermissionKeyException } from '../../../modules/profiles/domain/value-objects/authorization-key.vo.js';

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

// pt-BR (#97): antes desta seção o mapper não tinha NENHUMA linha do BC
// Profiles. Toda exceção de profiles caía no fall-through e virava
// 500 INTERNAL — inclusive "profile não encontrado" (404) e "slug já em
// uso" (409). O sintoma em produção: toda chamada admin respondia 500.
describe('mapExceptionToHttp — BC Profiles (#97)', () => {
  const casos: ReadonlyArray<readonly [string, Error, number, string]> = [
    [
      'ProfileNotFoundException',
      new ProfileNotFoundException('p-1'),
      HttpStatus.NOT_FOUND,
      'PROFILE_NOT_FOUND',
    ],
    [
      'ProfileSlugAlreadyInUseException',
      new ProfileSlugAlreadyInUseException('admin'),
      HttpStatus.CONFLICT,
      'PROFILE_SLUG_IN_USE',
    ],
    [
      'ProfileSystemProtectedException',
      new ProfileSystemProtectedException('p-1'),
      HttpStatus.FORBIDDEN,
      'PROFILE_SYSTEM_PROTECTED',
    ],
    [
      'ProfileAdminProtectedException',
      new ProfileAdminProtectedException('p-1'),
      HttpStatus.FORBIDDEN,
      'PROFILE_ADMIN_PROTECTED',
    ],
    [
      'ProfilePrivilegeEscalationException',
      new ProfilePrivilegeEscalationException('auto-concessão'),
      HttpStatus.FORBIDDEN,
      'PRIVILEGE_ESCALATION',
    ],
    [
      'ProfileHasUsersException',
      new ProfileHasUsersException('viewer', 3),
      HttpStatus.CONFLICT,
      'PROFILE_HAS_USERS',
    ],
    [
      'AuthorizationAlreadyAssignedException',
      new AuthorizationAlreadyAssignedException('p-1', 'users.read'),
      HttpStatus.CONFLICT,
      'AUTHORIZATION_ALREADY_ASSIGNED',
    ],
    [
      'AuthorizationNotFoundException',
      new AuthorizationNotFoundException('p-1', 'users.read'),
      HttpStatus.NOT_FOUND,
      'AUTHORIZATION_NOT_FOUND',
    ],
    [
      'ConcurrencyException (profiles)',
      new ProfileConcurrencyException('Profile', 1, 2),
      HttpStatus.CONFLICT,
      'CONCURRENCY_CONFLICT',
    ],
  ];

  for (const [nome, erro, status, code] of casos) {
    it(`${nome} → ${status} ${code}`, () => {
      const m = mapExceptionToHttp(erro);
      expect(m.status).toBe(status);
      expect(m.code).toBe(code);
    });

    // A asserção que realmente importa: sem entrada no mapper a exceção
    // NÃO falha — ela vira 500 e o teste de "status" acima ficaria verde
    // por acidente se o esperado fosse também 500.
    it(`${nome} NÃO cai no fall-through 500`, () => {
      expect(mapExceptionToHttp(erro).status).not.toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  }

  it('as DUAS ConcurrencyException são classes distintas e não se confundem', () => {
    // A de `users` é 412 (optimistic lock com versão do cliente); a de
    // `profiles` é 409 (divergência interna do save). São classes
    // separadas em arquivos separados — se alguém unificasse os nomes sem
    // unificar a semântica, uma das duas viraria 500.
    const deUser = mapExceptionToHttp(new ConcurrencyException(1, 2));
    const deProfile = mapExceptionToHttp(new ProfileConcurrencyException('Profile', 1, 2));
    expect(deUser.status).toBe(HttpStatus.PRECONDITION_FAILED);
    expect(deProfile.status).toBe(HttpStatus.CONFLICT);
  });

  it('o título da escalada não vaza o motivo interno', () => {
    const m = mapExceptionToHttp(
      new ProfilePrivilegeEscalationException('ator sem isAdmin não altera o próprio profile'),
    );
    expect(m.title).toBe('Escalada de privilégio bloqueada');
    expect(m.title).not.toMatch(/isAdmin|profile|ator/i);
  });

  // ─── A4: entrada inválida é 400, não 500 ─────────────────────────────────
  //
  // `Profile.criar`/`adicionarAutorizacao` lançavam `Error` puro quando a
  // chave não constava do catálogo, e o mapper não conhece `Error`: o
  // `POST /admin/profiles/p/authorizations {"permissionKey":"typo"}`
  // respondia 500 — o erro é do CALLER, não do servidor.

  it('InvalidPermissionKeyException → 400 INVALID_PERMISSION_KEY (não 500)', () => {
    const m = mapExceptionToHttp(new InvalidPermissionKeyException('chave.typo'));
    expect(m.status).toBe(HttpStatus.BAD_REQUEST);
    expect(m.code).toBe('INVALID_PERMISSION_KEY');
    expect(m.errors?.[0]?.field).toBe('permissionKey');
  });

  it('slug malformado é 400 VALIDATION_ERROR e slug duplicado é 409 (nomes distintos)', () => {
    // `ProfileSlug.create` já lança `UserValidationException` — o use case
    // é que usava `ProfileSlugAlreadyInUseException` para o slug inválido.
    const malformado = mapExceptionToHttp(new UserValidationException('slug', 'kebab-case'));
    const duplicado = mapExceptionToHttp(new ProfileSlugAlreadyInUseException('admin'));

    expect(malformado.status).toBe(HttpStatus.BAD_REQUEST);
    expect(malformado.code).toBe('VALIDATION_ERROR');
    expect(duplicado.status).toBe(HttpStatus.CONFLICT);
    expect(duplicado.code).toBe('PROFILE_SLUG_IN_USE');
  });
});
