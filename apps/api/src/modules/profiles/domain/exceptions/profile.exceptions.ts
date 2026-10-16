// apps/api/src/modules/profiles/domain/exceptions/profile.exceptions.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): exceções de domínio do BC Profiles.
// Mesmo padrão do BC Users — exceções carregam apenas dados seguros
// (id, slug, campo) e NUNCA valores crus (nomes, descrições) que
// pudessem vazar via payload HTTP.

export class ProfileNotFoundException extends Error {
  constructor(public readonly id: string) {
    super(`Profile não encontrado: ${id}`);
    this.name = 'ProfileNotFoundException';
  }
}

export class ProfileSlugAlreadyInUseException extends Error {
  constructor(public readonly slug: string) {
    super(`Profile com slug já existe: ${slug}`);
    this.name = 'ProfileSlugAlreadyInUseException';
  }
}

export class ProfileSystemProtectedException extends Error {
  constructor(public readonly id: string) {
    super(`Profile de sistema protegido contra exclusão: ${id}`);
    this.name = 'ProfileSystemProtectedException';
  }
}

export class ProfileAdminProtectedException extends Error {
  constructor(public readonly id: string) {
    super(`Não é possível remover flag is_admin do profile admin: ${id}`);
    this.name = 'ProfileAdminProtectedException';
  }
}

export class ProfileHasUsersException extends Error {
  constructor(
    public readonly id: string,
    public readonly userCount: number,
  ) {
    super(`Profile tem ${userCount} usuário(s) atribuído(s); reatribua antes de deletar: ${id}`);
    this.name = 'ProfileHasUsersException';
  }
}

export class AuthorizationAlreadyAssignedException extends Error {
  constructor(
    public readonly profileId: string,
    public readonly permissionKey: string,
  ) {
    super(`Autorização já atribuída: ${permissionKey} em profile ${profileId}`);
    this.name = 'AuthorizationAlreadyAssignedException';
  }
}

export class AuthorizationNotFoundException extends Error {
  constructor(
    public readonly profileId: string,
    public readonly permissionKey: string,
  ) {
    super(`Autorização não encontrada: ${permissionKey} em profile ${profileId}`);
    this.name = 'AuthorizationNotFoundException';
  }
}

export class ConcurrencyException extends Error {
  constructor(
    public readonly resource: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number | null,
  ) {
    super(`${resource}: expected version ${expectedVersion} but found ${actualVersion ?? 'null'}`);
    this.name = 'ConcurrencyException';
  }
}
