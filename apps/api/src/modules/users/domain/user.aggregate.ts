import { UserId } from './value-objects/user-id.vo.js';
import { Email } from './value-objects/email.vo.js';
import { UserName } from './value-objects/user-name.vo.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { UserCreatedEvent } from './events/user-created.event.js';
import { UserUpdatedEvent } from './events/user-updated.event.js';
import { UserDeletedEvent } from './events/user-deleted.event.js';
import { UserRestoredEvent } from './events/user-restored.event.js';
import { UserDeletedException, InvalidRestoreException } from './exceptions/user.exceptions.js';

/**
 * Aggregate Root do domínio de Users.
 *
 * Encapsula estado + invariantes + regras de negócio + emissão de eventos.
 * Mutações externas só via factory (criar / restaurarDePersistencia) e mutators.
 *
 * Estado mutável é mantido em campos privados ECMAScript (#field), que vivem
 * em um slot interno separado das "own properties". Assim, `Object.freeze(this)`
 * continua protegendo contra escrita externa em propriedades públicas, sem
 * bloquear a reatribuição interna usada pelos mutators.
 */
export class User {
  readonly #id: UserId;
  #name: UserName;
  #email: Email;
  readonly #createdAt: Date;
  #updatedAt: Date;
  #version: number;
  #deletedAt: Date | null;
  readonly #events: DomainEvent[] = [];

  private constructor(props: {
    id: UserId;
    name: UserName;
    email: Email;
    createdAt: Date;
    updatedAt: Date;
    version: number;
    deletedAt: Date | null;
  }) {
    this.#id = props.id;
    this.#name = props.name;
    this.#email = props.email;
    this.#createdAt = props.createdAt;
    this.#updatedAt = props.updatedAt;
    this.#version = props.version;
    this.#deletedAt = props.deletedAt;
    Object.freeze(this);
  }

  /**
   * Factory: cria um novo User (versão inicial = 1) e emite UserCreatedEvent.
   */
  static criar(props: { id?: string; nome: string; email: string; agora: Date }): User {
    const id = UserId.create(props.id);
    const nome = UserName.create(props.nome);
    const email = Email.create(props.email);
    const u = new User({
      id,
      name: nome,
      email,
      createdAt: props.agora,
      updatedAt: props.agora,
      version: 1,
      deletedAt: null,
    });
    u.#events.push(new UserCreatedEvent(id.value, 1, props.agora));
    return u;
  }

  /**
   * Hidratação: reconstrói User a partir do estado persistido SEM emitir eventos
   * (os eventos históricos foram emitidos no momento original da criação).
   */
  static restaurarDePersistencia(props: {
    id: string;
    nome: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
    deletedAt: Date | null;
  }): User {
    return new User({
      id: UserId.create(props.id),
      name: UserName.create(props.nome),
      email: Email.create(props.email),
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
      version: props.version,
      deletedAt: props.deletedAt,
    });
  }

  // ----- getters (read-only, expostos via API pública) -----

  id(): UserId {
    return this.#id;
  }
  nome(): UserName {
    return this.#name;
  }
  email(): Email {
    return this.#email;
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
  deletedAt(): Date | null {
    return this.#deletedAt;
  }
  isDeleted(): boolean {
    return this.#deletedAt !== null;
  }

  /**
   * Drena e retorna os domain events pendentes (uso por application/handler).
   */
  pullEvents(): DomainEvent[] {
    const out = [...this.#events];
    this.#events.length = 0;
    return out;
  }

  // ----- mutators -----

  renomear(novoNome: string, agora: Date): void {
    if (this.#deletedAt !== null) {
      throw new UserDeletedException(this.#id.value);
    }
    const previousVersion = this.#version;
    this.#name = UserName.create(novoNome);
    this.#updatedAt = agora;
    this.#version = previousVersion + 1;
    this.#events.push(new UserUpdatedEvent(this.#id.value, this.#version, previousVersion, agora));
  }

  alterarEmail(novoEmail: string, agora: Date): void {
    if (this.#deletedAt !== null) {
      throw new UserDeletedException(this.#id.value);
    }
    const previousVersion = this.#version;
    this.#email = Email.create(novoEmail);
    this.#updatedAt = agora;
    this.#version = previousVersion + 1;
    this.#events.push(new UserUpdatedEvent(this.#id.value, this.#version, previousVersion, agora));
  }

  marcarExcluido(reason: string | null, agora: Date): void {
    if (this.#deletedAt !== null) {
      throw new UserDeletedException(this.#id.value);
    }
    const previousVersion = this.#version;
    this.#deletedAt = agora;
    this.#updatedAt = agora;
    this.#version = previousVersion + 1;
    this.#events.push(new UserDeletedEvent(this.#id.value, this.#version, reason, agora));
  }

  restaurar(agora: Date): void {
    if (this.#deletedAt === null) {
      throw new InvalidRestoreException('User não está excluído; não há nada para restaurar');
    }
    const restoredFromVersion = this.#version;
    this.#deletedAt = null;
    this.#updatedAt = agora;
    this.#version = restoredFromVersion + 1;
    this.#events.push(
      new UserRestoredEvent(this.#id.value, this.#version, restoredFromVersion, agora),
    );
  }
}
