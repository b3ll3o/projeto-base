// apps/api/src/modules/profiles/domain/profile.aggregate.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): Aggregate Root do BC Profiles.
//
// Responsabilidades:
//  - Encapsular estado (id, slug, name, isAdmin, isSystem, authorizations)
//  - Garantir invariantes (system profile não é deletado)
//  - Emitir domain events para auditoria
//  - Permitir mutação APENAS via factory ou mutator
//
// Authorizations são value-objects que vivem DENTRO do aggregate — não
// há aggregate Authorization separado. O ciclo é:
//   - profile.adicionarAutorizacao(key, agora)
//   - profile.removerAutorizacao(key, agora)
// ambos bumpam version e emitem event.
//
// Sem soft-delete: Profile é config de admin, não dado de negócio. O
// repository faz hard delete com proteção via `countUsersWithProfile`
// (FK onDelete: Restrict + check explícito antes). Perfis de sistema
// (isSystem=true) são protegidos no agregado (`deletar` lança).

import { ProfileId } from './value-objects/profile-id.vo.js';
import { ProfileSlug } from './value-objects/profile-slug.vo.js';
import { ProfileName } from './value-objects/profile-name.vo.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { ProfileCreatedEvent } from './events/profile-created.event.js';
import { ProfileUpdatedEvent } from './events/profile-updated.event.js';
import { ProfileDeletedEvent } from './events/profile-deleted.event.js';
import {
  ProfileSystemProtectedException,
  AuthorizationAlreadyAssignedException,
  AuthorizationNotFoundException,
} from './exceptions/profile.exceptions.js';
import { isPermissionKey } from '../../../shared/auth/permissions-catalog.js';
import { InvalidPermissionKeyException } from './value-objects/authorization-key.vo.js';

/**
 * Representa as permissões como Set imutável de chaves.
 *
 * O Set interno é o que permite `temAutorizacao()` em O(1), e a
 * imutabilidade (cópia defensiva no getter) impede o caller de mutar
 * o estado do agregado por acidente.
 */
export class ProfileAuthorizations {
  readonly #keys: ReadonlySet<string>;

  private constructor(keys: Iterable<string>) {
    this.#keys = new Set(keys);
  }

  static vazio(): ProfileAuthorizations {
    return new ProfileAuthorizations([]);
  }

  static deLista(keys: readonly string[]): ProfileAuthorizations {
    return new ProfileAuthorizations(keys);
  }

  tem(key: string): boolean {
    return this.#keys.has(key);
  }

  toLista(): string[] {
    return [...this.#keys].sort();
  }

  toReadonlySet(): ReadonlySet<string> {
    return new Set(this.#keys);
  }

  count(): number {
    return this.#keys.size;
  }
}

export class Profile {
  readonly #id: ProfileId;
  readonly #slug: ProfileSlug;
  #name: ProfileName;
  #description: string | null;
  #isAdmin: boolean;
  readonly #isSystem: boolean;
  /**
   * pt-BR (Fase 6 — tenancy, 2026-10-16): a EMPRESA dona do perfil, ou `null`
   * para o bucket global (D3). `readonly` de propósito: nenhum mutador muda a
   * dona — trocar o dono de um perfil seria mover permissões entre empresas, e
   * não é operação que a aplicação faz.
   *
   * É o mesmo conjunto que `findProfileId` já filtra na LEITURA
   * (`profile: { OR: [{ tenantId: null }, { tenantId }] }`); a escrita da
   * Fase 6 precisa dele, e sem o campo no agregado a regra seria inescritível.
   */
  readonly #tenantId: string | null;
  #authorizations: ProfileAuthorizations;
  readonly #createdAt: Date;
  #updatedAt: Date;
  #version: number;
  /**
   * pt-BR (#97): versão do BANCO no momento em que este agregado foi
   * carregado. É o que o optimistic lock compara (`where: { version }`).
   * Não dá para derivar de `#version`: cada mutador bumpa uma vez, e
   * `atualizar()` faz dois (`renomear` + `alterarDescricao`) — com
   * `version - 1` o `updateMany` não casa nenhuma linha e TODO update
   * quebra com `ConcurrencyException`.
   */
  readonly #loadedVersion: number;
  readonly #events: DomainEvent[] = [];

  private constructor(props: {
    id: ProfileId;
    slug: ProfileSlug;
    name: ProfileName;
    description: string | null;
    isAdmin: boolean;
    isSystem: boolean;
    tenantId: string | null;
    authorizations: ProfileAuthorizations;
    createdAt: Date;
    updatedAt: Date;
    version: number;
    loadedVersion: number;
  }) {
    this.#id = props.id;
    this.#slug = props.slug;
    this.#name = props.name;
    this.#description = props.description;
    this.#isAdmin = props.isAdmin;
    this.#isSystem = props.isSystem;
    this.#tenantId = props.tenantId;
    this.#authorizations = props.authorizations;
    this.#createdAt = props.createdAt;
    this.#updatedAt = props.updatedAt;
    this.#version = props.version;
    this.#loadedVersion = props.loadedVersion;
    Object.freeze(this);
  }

  // ----- factories -----

  /**
   * Cria Profile novo (não-persistido, version=1).
   *
   * pt-BR (#97): `isAdmin`/`isSystem` existem aqui só para seed/migration e
   * teste — o seed escreve direto no Prisma (`apps/api/prisma/seed.ts`), e o
   * caminho HTTP não os alcança mais: saíram de `CreateProfileInput` (#97,
   * A3), então `criar()` fixa `false` e a garantia é do tipo, não do
   * controller. `initialAuthorizations` é validado contra o catálogo porque
   * antes uma chave inexistente era persistida silenciosamente — e a recusa é
   * `InvalidPermissionKeyException` (400), não `Error` puro (500).
   */
  static criar(props: {
    slug: string;
    name: string;
    description?: string | null;
    isAdmin?: boolean;
    isSystem?: boolean;
    initialAuthorizations?: readonly string[];
    /**
     * pt-BR (Fase 8): DONA do perfil. `null` = perfil global.
     *
     * Antes desta fase o parâmetro não existia e `criar` fixava `null`, com o
     * argumento de que "só `provisionarEmpresaPropria` cria perfil de empresa,
     * e ele grava direto no Prisma". MEDIDO que a consequência era o oposto do
     * pretendido: `POST /admin/profiles` só alcançado por quem tem
     * `admin.manage-profiles` — que, desde a Fase 5, é TODO dono de empresa
     * (o onboarding lhe dá TODAS as permissões + `isAdmin: true`). Então o
     * dono, ao criar um perfil, fabricava um perfil GLOBAL de sistema, e
     * nenhuma empresa podia ter um perfil próprio.
     */
    tenantId?: string | null;
    agora: Date;
  }): Profile {
    for (const key of props.initialAuthorizations ?? []) {
      if (!isPermissionKey(key)) {
        throw new InvalidPermissionKeyException(key);
      }
    }
    const p = new Profile({
      id: ProfileId.create(),
      slug: ProfileSlug.create(props.slug),
      name: ProfileName.create(props.name),
      description: props.description ?? null,
      isAdmin: props.isAdmin === true,
      isSystem: props.isSystem === true,
      // pt-BR (Fase 8): a dona vem do CHAMADOR, que é quem sabe o escopo
      // (o ator autenticado na empresa). `provisionarEmpresaPropria` continua
      // o único a criar perfil `isAdmin`, e ele grava direto no Prisma.
      tenantId: props.tenantId ?? null,
      authorizations: ProfileAuthorizations.deLista(props.initialAuthorizations ?? []),
      createdAt: props.agora,
      updatedAt: props.agora,
      version: 1,
      loadedVersion: 0,
    });
    p.#events.push(new ProfileCreatedEvent(p.#id.value, 1, props.agora));
    return p;
  }

  /**
   * Hidratação: reconstrói Profile a partir do estado persistido SEM
   * emitir eventos (auditoria já foi feita no momento original).
   */
  static restaurarDePersistencia(props: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    isAdmin: boolean;
    isSystem: boolean;
    tenantId: string | null;
    authorizations: readonly string[];
    createdAt: Date;
    updatedAt: Date;
    version: number;
  }): Profile {
    return new Profile({
      id: ProfileId.create(props.id),
      slug: ProfileSlug.create(props.slug),
      name: ProfileName.create(props.name),
      description: props.description,
      isAdmin: props.isAdmin,
      isSystem: props.isSystem,
      tenantId: props.tenantId,
      authorizations: ProfileAuthorizations.deLista(props.authorizations),
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
      version: props.version,
      loadedVersion: props.version,
    });
  }

  // ----- getters -----

  id(): ProfileId {
    return this.#id;
  }
  slug(): ProfileSlug {
    return this.#slug;
  }
  nome(): ProfileName {
    return this.#name;
  }
  descricao(): string | null {
    return this.#description;
  }
  isAdmin(): boolean {
    return this.#isAdmin;
  }
  isSystem(): boolean {
    return this.#isSystem;
  }
  /** pt-BR (Fase 6): `null` = perfil global, que serve a qualquer empresa. */
  tenantId(): string | null {
    return this.#tenantId;
  }
  authorizations(): ProfileAuthorizations {
    // Cópia defensiva para impedir que o caller mutar o Set interno via
    // reference holding.
    return ProfileAuthorizations.deLista(this.#authorizations.toLista());
  }
  createdAt(): Date {
    return this.#createdAt;
  }
  updatedAt(): Date {
    return this.#updatedAt;
  }
  version(): number {
    return this.#version;
  }
  /** Versão do banco no momento do load — a âncora do optimistic lock. */
  loadedVersion(): number {
    return this.#loadedVersion;
  }

  pullEvents(): DomainEvent[] {
    const out = [...this.#events];
    this.#events.length = 0;
    return out;
  }

  // ----- mutators -----

  renomear(novoNome: string, agora: Date): void {
    const previousVersion = this.#version;
    this.#name = ProfileName.create(novoNome);
    this.#updatedAt = agora;
    this.#version = previousVersion + 1;
    this.#events.push(
      new ProfileUpdatedEvent(this.#id.value, this.#version, previousVersion, agora),
    );
  }

  alterarDescricao(novaDescricao: string | null, agora: Date): void {
    const previousVersion = this.#version;
    this.#description = novaDescricao;
    this.#updatedAt = agora;
    this.#version = previousVersion + 1;
    this.#events.push(
      new ProfileUpdatedEvent(this.#id.value, this.#version, previousVersion, agora),
    );
  }

  /**
   * Adiciona uma autorização ao perfil. Lança se a chave não está
   * catalogada (defesa contra typos que passariam em runtime) ou se já
   * existe. Bumpa version e emite event.
   */
  adicionarAutorizacao(permissionKey: string, agora: Date): void {
    if (!isPermissionKey(permissionKey)) {
      throw new InvalidPermissionKeyException(permissionKey);
    }
    if (this.#authorizations.tem(permissionKey)) {
      throw new AuthorizationAlreadyAssignedException(this.#id.value, permissionKey);
    }
    const previousVersion = this.#version;
    const novaLista = [...this.#authorizations.toLista(), permissionKey];
    this.#authorizations = ProfileAuthorizations.deLista(novaLista);
    this.#updatedAt = agora;
    this.#version = previousVersion + 1;
    this.#events.push(
      new ProfileUpdatedEvent(this.#id.value, this.#version, previousVersion, agora),
    );
  }

  /**
   * Remove uma autorização. Lança se a chave não existe. Não é
   * idempotente — o caller decide se quer swallow.
   */
  removerAutorizacao(permissionKey: string, agora: Date): void {
    if (!isPermissionKey(permissionKey)) {
      throw new InvalidPermissionKeyException(permissionKey);
    }
    if (!this.#authorizations.tem(permissionKey)) {
      throw new AuthorizationNotFoundException(this.#id.value, permissionKey);
    }
    const previousVersion = this.#version;
    const novaLista = this.#authorizations.toLista().filter((k) => k !== permissionKey);
    this.#authorizations = ProfileAuthorizations.deLista(novaLista);
    this.#updatedAt = agora;
    this.#version = previousVersion + 1;
    this.#events.push(
      new ProfileUpdatedEvent(this.#id.value, this.#version, previousVersion, agora),
    );
  }

  /**
   * Prepara o profile para deleção. Lança se for `isSystem` (perfis
   * de sistema são protegidos). A integridade referencial
   * (profile com users atribuídos) é responsabilidade do repository
   * (FK onDelete: Restrict + check de count antes de deletar).
   *
   * Este método é o que emite o evento de deleção. O repository então
   * executa o DELETE físico na sequência.
   */
  deletar(reason: string | null, agora: Date): void {
    if (this.#isSystem) {
      throw new ProfileSystemProtectedException(this.#id.value);
    }
    const previousVersion = this.#version;
    this.#updatedAt = agora;
    this.#version = previousVersion + 1;
    this.#events.push(new ProfileDeletedEvent(this.#id.value, this.#version, reason, agora));
  }
}
