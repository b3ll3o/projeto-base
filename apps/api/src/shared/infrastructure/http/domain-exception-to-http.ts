// apps/api/src/shared/infrastructure/http/domain-exception-to-http.ts
//
// Mapeia exceções de DOMÍNIO e APLICAÇÃO para o triplo
// { status, code, title } que vira o payload RFC 7807.
//
// pt-BR: o mapper é uma função PURA — recebe um Error, devolve um objeto.
// Não lança, não loga, não instancia nada. Facilita testes unitários
// (sem mock de NestJS) e mantém o GlobalExceptionFilter fino.
//
// Ordem dos instanceof checks: domínio PRIMEIRO, depois aplicação. Defensivo —
// se um refactor futuro fizer application exceptions herdarem de domain, o ramo
// de domínio continua correto (e o ramo de aplicação só é alcançado quando o
// caller empacota explicitamente em Application*Exception).
//
// Mapeamento atual (alinhado com a Fase 6 — optimistic lock = 412, não 409):
//
//   DOMÍNIO (puro, sem dependência NestJS):
//     InvalidCredentials                    → 401 INVALID_CREDENTIALS
//     InvalidToken                          → 401 INVALID_TOKEN
//     UserNotFound / AuditHistoryNotFound   → 404 NOT_FOUND
//     UserDeleted / AuditArchiveNotFound    → 410 GONE
//     EmailAlreadyInUse                     → 409 CONFLICT
//     ConcurrencyException                  → 412 PRECONDITION_FAILED
//     InvalidRestore                        → 422 UNPROCESSABLE_ENTITY
//     UserValidationException               → 400 VALIDATION_ERROR
//
//   DOMÍNIO (BC Profiles):
//     ProfileNotFound / AuthorizationNotFound        → 404 NOT_FOUND
//     ProfileSlugAlreadyInUse / ProfileHasUsers      → 409 CONFLICT
//     AuthorizationAlreadyAssigned                  → 409 CONFLICT
//     ConcurrencyException (profiles)               → 409 CONFLICT
//     ProfileSystemProtected / ProfileAdminProtected → 403 FORBIDDEN
//     ProfilePrivilegeEscalation                    → 403 FORBIDDEN
//     InvalidPermissionKey                          → 400 INVALID_PERMISSION_KEY
//     (slug malformado é `UserValidationException` → 400 VALIDATION_ERROR;
//      o 409 de slug é SÓ para o slug bem formado que já existe)
//
//   DOMÍNIO (BC Tenancy — Fase 5):
//     ConviteInvalidoException  → 404/410/409/403 CONVITE_INVALIDO (por motivo)
//     NaoAdministraEmpresaException → 403 FORBIDDEN
//     EmpresaJaExisteException     → 409 EMPRESA_JA_EXISTE
//     ConviteJaEmitidoException    → 409 CONVITE_JA_EMITIDO
//     ⚠️ Um `code` só para os quatro motivos. O status distingue, o código não:
//     `CONVITE_OUTRO_EMAIL` na resposta diria a quem só tem o token que o
//     token é válido e o e-mail é que não bate — o que é exatamente o que o
//     segredo existe para esconder.
//
//   APLICAÇÃO (camada inbound — use cases sempre re-jogam nestas):
//     ApplicationResourceNotFoundException  → 404 USER_NOT_FOUND
//     ApplicationResourceDeletedException   → 410 USER_DELETED
//     ApplicationEmailAlreadyInUseException  → 409 EMAIL_IN_USE
//     ApplicationConcurrencyException       → 412 CONCURRENCY_CONFLICT
//     ApplicationInvalidRestoreException    → 422 INVALID_RESTORE
//     ApplicationValidationException        → 400 VALIDATION_ERROR
//
//   * (default)                             → 500 INTERNAL_SERVER_ERROR

import { HttpStatus } from '@nestjs/common';
import {
  UserNotFoundException,
  UserOwnershipViolationException,
  EmailAlreadyInUseException,
  ConcurrencyException,
  UserDeletedException,
  InvalidRestoreException,
  UserValidationException,
} from '../../../modules/users/domain/exceptions/user.exceptions.js';
import {
  AuditHistoryNotFoundException,
  AuditArchiveNotFoundException,
} from '../../audit/domain/audit.exceptions.js';
import { InvalidTokenException } from '../../../modules/auth/domain/exceptions/token.exceptions.js';
import { InvalidCredentialsException } from '../../../modules/auth/domain/exceptions/auth.exceptions.js';
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
import {
  ConviteInvalidoException,
  ConviteJaEmitidoException,
  EmpresaJaExisteException,
  NaoAdministraEmpresaException,
  type MotivoConviteInvalido as ConviteMotivo,
} from '../../../modules/tenancy/domain/exceptions/tenancy.exceptions.js';
import {
  ApplicationValidationException,
  ApplicationResourceNotFoundException,
  ApplicationConcurrencyException,
  ApplicationResourceDeletedException,
  ApplicationInvalidRestoreException,
  ApplicationEmailAlreadyInUseException,
} from '../../../modules/users/application/exceptions/application.exceptions.js';

export interface HttpErrorMapping {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  /**
   * Erros por campo, no formato de RFC 7807 — opcional porque a maioria
   * das falhas não é de validação de campo.
   *
   * pt-BR (2026-10-08): sem isto, um 400 de VO saía com `errors`
   * ausente. O Server Action do web (`app/users/novo/actions.ts`,
   * `estadoDeErro`) mapeia `errors[].field` para o erro do campo e, com
   * a lista vazia, cai em `formError: ERRO_GENERICO` — a pessoa via
   * "erro genérico" num erro inteiramente dela. Medido.
   */
  readonly errors?: { field: string; message: string; code: string }[];
}

/**
 * Motivo do convite recusado → status HTTP.
 *
 * `expirado` é 410 e não 404 porque o convite EXISTE e foi válido: 404 diria
 * ao cliente que nunca houve convite, e a tela de aceite trataria os dois
 * como "link inválido" quando só um deles é.
 */
const MOTIVO_CONVITE_NA_HTTP: Record<ConviteMotivo, number> = {
  'nao-encontrado': HttpStatus.NOT_FOUND,
  expirado: HttpStatus.GONE,
  'ja-aceito': HttpStatus.CONFLICT,
  'outro-email': HttpStatus.FORBIDDEN,
  // MEDIDO 2026-10-21: o motivo novo é CONFLITO, e não erro interno — o
  // pedido era bem formado e o estado é o que impede a escrita. Sem esta
  // linha, o erro cru do banco subia como 500 (indistinguível de banco fora
  // do ar) num pedido que a pessoa pode resolver.
  'ja-membro': HttpStatus.CONFLICT,
};

export function mapExceptionToHttp(err: unknown): HttpErrorMapping {
  // ─── AUTENTICAÇÃO (BC Auth) ──────────────────────────────────────────────
  //
  // pt-BR: as duas negativas de auth são 401 com `code` DISTINTO, e a
  // distinção é o que evita que o cliente faça a coisa errada:
  //
  //   INVALID_CREDENTIALS → o LOGIN falhou. Volte para a tela de login.
  //   INVALID_TOKEN       → o TOKEN não serve. Renove a sessão (refresh).
  //   UNAUTHORIZED        → nem há token. Autentique-se.
  //
  // O `detail` dos dois primeiros é FIXO e genérico por decisão de não
  // enumeração: "e-mail não encontrado" e "senha errada" são o mesmo
  // erro, porque um login que distingue os dois é um oráculo de quais
  // e-mails existem na base.
  if (err instanceof InvalidCredentialsException) {
    return {
      status: HttpStatus.UNAUTHORIZED,
      code: 'INVALID_CREDENTIALS',
      title: 'Credenciais inválidas',
    };
  }
  if (err instanceof InvalidTokenException) {
    return {
      status: HttpStatus.UNAUTHORIZED,
      code: 'INVALID_TOKEN',
      title: 'Sessão inválida',
    };
  }

  // ─── DOMÍNIO (puro) ──────────────────────────────────────────────────────
  //
  // ⚠️ A NEGATIVA DE AUTORIZAÇÃO vem ANTES do 404 de propósito. A pergunta
  // "o registro é meu?" é respondida sem tocar o banco: se o `sub` do token
  // não for o `:id` da rota, o pedido é recusado pelo motivo certo. Devolver
  // 404 aqui seria "o registro não existe" para um registro que existe — e um
  // 404 que mente é pior que um 403 que diz a verdade, porque o cliente
  // acredita que pode criar o id que chutar.
  if (err instanceof UserOwnershipViolationException) {
    return {
      status: HttpStatus.FORBIDDEN,
      code: 'USER_OWNERSHIP_VIOLATION',
      title: 'Acesso negado a outro usuário',
    };
  }
  if (err instanceof UserNotFoundException) {
    return {
      status: HttpStatus.NOT_FOUND,
      code: 'USER_NOT_FOUND',
      title: 'Usuário não encontrado',
    };
  }
  if (err instanceof AuditHistoryNotFoundException) {
    return {
      status: HttpStatus.NOT_FOUND,
      code: 'HISTORY_NOT_FOUND',
      title: 'Histórico não encontrado',
    };
  }
  if (err instanceof AuditArchiveNotFoundException) {
    return { status: HttpStatus.GONE, code: 'ARCHIVE_NOT_FOUND', title: 'Arquivo não encontrado' };
  }
  if (err instanceof EmailAlreadyInUseException) {
    return { status: HttpStatus.CONFLICT, code: 'EMAIL_IN_USE', title: 'Email já em uso' };
  }
  if (err instanceof ConcurrencyException) {
    return {
      status: HttpStatus.PRECONDITION_FAILED,
      code: 'CONCURRENCY_CONFLICT',
      title: 'Conflito de versão',
    };
  }
  if (err instanceof UserDeletedException) {
    return { status: HttpStatus.GONE, code: 'USER_DELETED', title: 'Usuário deletado' };
  }
  if (err instanceof InvalidRestoreException) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'INVALID_RESTORE',
      title: 'Restauração inválida',
    };
  }
  // pt-BR (2026-10-08): invariante de VO violada é erro do CALLER, não
  // falha interna. Sem esta entrada, `UserName.create`/`Email.create`
  // recusavam com 500 e ainda vazavam a mensagem interna no `detail`
  // (medido: `detail="UserName: muito curto (mín 2 chars)"`).
  if (err instanceof UserValidationException) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: 'VALIDATION_ERROR',
      title: 'Erro de validação',
      errors: [{ field: err.campo, message: err.motivo, code: 'VALIDATION_ERROR' }],
    };
  }

  // ─── DOMÍNIO (BC Profiles) ────────────────────────────────────────────────
  //
  // pt-BR (#97): antes desta seção TODA exceção de `profiles` caía no
  // default e virava 500 — inclusive um slug duplicado (409) e um profile
  // inexistente (404). A `ConcurrencyException` de profiles é uma CLASSE
  // diferente da de `users` (arquivos separados, sem herança): o `instanceof`
  // as distingue, e o alias `ProfileConcurrencyException` evita a colisão de
  // nome no import. Ela é 409 (conflito de estado), não 412: o `Profile` não
  // recebe `expectedVersion` do cliente, a divergência é interna do save.
  if (err instanceof ProfileNotFoundException) {
    return {
      status: HttpStatus.NOT_FOUND,
      code: 'PROFILE_NOT_FOUND',
      title: 'Perfil não encontrado',
    };
  }
  if (err instanceof ProfileSlugAlreadyInUseException) {
    return {
      status: HttpStatus.CONFLICT,
      code: 'PROFILE_SLUG_IN_USE',
      title: 'Slug de perfil já em uso',
    };
  }
  if (err instanceof ProfileSystemProtectedException) {
    return {
      status: HttpStatus.FORBIDDEN,
      code: 'PROFILE_SYSTEM_PROTECTED',
      title: 'Perfil de sistema protegido',
    };
  }
  if (err instanceof ProfileAdminProtectedException) {
    return {
      status: HttpStatus.FORBIDDEN,
      code: 'PROFILE_ADMIN_PROTECTED',
      title: 'Perfil admin protegido',
    };
  }
  if (err instanceof ProfilePrivilegeEscalationException) {
    return {
      status: HttpStatus.FORBIDDEN,
      code: 'PRIVILEGE_ESCALATION',
      title: 'Escalada de privilégio bloqueada',
    };
  }
  if (err instanceof ProfileHasUsersException) {
    return {
      status: HttpStatus.CONFLICT,
      code: 'PROFILE_HAS_USERS',
      title: 'Perfil ainda tem usuários',
    };
  }
  if (err instanceof AuthorizationAlreadyAssignedException) {
    return {
      status: HttpStatus.CONFLICT,
      code: 'AUTHORIZATION_ALREADY_ASSIGNED',
      title: 'Autorização já atribuída',
    };
  }
  if (err instanceof AuthorizationNotFoundException) {
    return {
      status: HttpStatus.NOT_FOUND,
      code: 'AUTHORIZATION_NOT_FOUND',
      title: 'Autorização não encontrada',
    };
  }
  // pt-BR (#97, A4): `Profile.criar`/`adicionarAutorizacao` lançavam `Error`
  // puro na chave fora do catálogo, e `Error` não é mapeado — caía no
  // fall-through e saía 500. Violação de invariante é erro do CALLER: 400.
  if (err instanceof InvalidPermissionKeyException) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: 'INVALID_PERMISSION_KEY',
      title: 'Permissão inválida',
      errors: [
        {
          field: 'permissionKey',
          message: 'a permissão precisa constar no catálogo',
          code: 'INVALID_PERMISSION_KEY',
        },
      ],
    };
  }
  if (err instanceof ProfileConcurrencyException) {
    return {
      status: HttpStatus.CONFLICT,
      code: 'CONCURRENCY_CONFLICT',
      title: 'Conflito de versão',
    };
  }

  // ─── DOMÍNIO (BC Tenancy — Fase 5) ────────────────────────────────────────
  //
  // pt-BR: o status muda com o MOTIVO, o `code` não. Um `code` por motivo
  // diria a quem só tem o token que o token é válido e o e-mail é que não
  // bate — o segredo existe justamente para não entregar isso.
  if (err instanceof ConviteInvalidoException) {
    const status = MOTIVO_CONVITE_NA_HTTP[err.motivo];
    return { status, code: 'CONVITE_INVALIDO', title: 'Convite inválido' };
  }
  if (err instanceof NaoAdministraEmpresaException) {
    return {
      status: HttpStatus.FORBIDDEN,
      code: 'FORBIDDEN',
      title: 'Só o dono da empresa pode convidar alguém',
    };
  }
  // pt-BR (Fase 5, review): os dois 409 abaixo traduzem `P2002` cru. Sem eles,
  // um `slug` repetido ou um segundo convite para o mesmo e-mail chegavam como
  // **500 Erro interno** — indistinguível de banco fora do ar, e o cliente sem
  // como saber que a resposta era "escolha outro slug". `code` separado nos
  // dois casos porque aqui o remetente é o DONO, que já tem o direito de saber
  // que o slug está tomado; o segredo do convite é outro assunto.
  if (err instanceof EmpresaJaExisteException) {
    return {
      status: HttpStatus.CONFLICT,
      code: 'EMPRESA_JA_EXISTE',
      title: 'Já existe uma empresa com este identificador',
    };
  }
  if (err instanceof ConviteJaEmitidoException) {
    return {
      status: HttpStatus.CONFLICT,
      code: 'CONVITE_JA_EMITIDO',
      title: 'Já existe um convite pendente para este e-mail nesta empresa',
    };
  }

  // ─── APLICAÇÃO (camada inbound — use cases sempre re-jogam nestas) ────────
  if (err instanceof ApplicationResourceNotFoundException) {
    return {
      status: HttpStatus.NOT_FOUND,
      code: 'USER_NOT_FOUND',
      title: 'Usuário não encontrado',
    };
  }
  if (err instanceof ApplicationResourceDeletedException) {
    return { status: HttpStatus.GONE, code: 'USER_DELETED', title: 'Usuário deletado' };
  }
  if (err instanceof ApplicationInvalidRestoreException) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'INVALID_RESTORE',
      title: 'Restauração inválida',
    };
  }
  if (err instanceof ApplicationEmailAlreadyInUseException) {
    return { status: HttpStatus.CONFLICT, code: 'EMAIL_IN_USE', title: 'Email já em uso' };
  }
  if (err instanceof ApplicationConcurrencyException) {
    return {
      status: HttpStatus.PRECONDITION_FAILED,
      code: 'CONCURRENCY_CONFLICT',
      title: 'Conflito de versão',
    };
  }
  if (err instanceof ApplicationValidationException) {
    return { status: HttpStatus.BAD_REQUEST, code: 'VALIDATION_ERROR', title: 'Erro de validação' };
  }

  return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL', title: 'Erro interno' };
}
