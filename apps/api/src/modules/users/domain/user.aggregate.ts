import { UserId } from './value-objects/user-id.vo.js';
import { Email } from './value-objects/email.vo.js';
import { UserName } from './value-objects/user-name.vo.js';
import { PasswordHash } from './value-objects/password-hash.vo.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { UserCreatedEvent } from './events/user-created.event.js';
import { UserUpdatedEvent } from './events/user-updated.event.js';
import { UserDeletedEvent } from './events/user-deleted.event.js';
import { UserRestoredEvent } from './events/user-restored.event.js';
import {
  UserDeletedException,
  InvalidRestoreException,
  UserValidationException,
} from './exceptions/user.exceptions.js';

/**
 * pt-BR: o TIPO já impede `trocarSenha('senha')` em tempo de compilação — o
 * spec marca a linha com `@ts-expect-error`, e o `tsc` acusa a diretiva
 * (TS2578) se ela deixar de valer. Mas tipos são apagados em runtime: um
 * `as any`, um consumidor em JS puro ou um caminho de desserialização podem
 * entregar uma string mesmo assim, e o agregado a aceitaria calado.
 *
 * A consequência de aceitar calado é silenciosa e cara: `senhaHash()` devolveria
 * algo que não é `PasswordHash`, o mapper leria `.value` (que não existe) e
 * gravaria `undefined` na coluna — a senha desapareceria do banco sem erro
 * em lugar nenhum. Esta guarda transforma esse silêncio em exceção.
 *
 * A mensagem NÃO interpola o valor recebido: ele pode ser a senha em claro,
 * e esta exceção é convertida em payload HTTP. Um template com `${candidato}`
 * aqui seria um canal de vazamento direto.
 */
function exigirPasswordHash(candidato: unknown): PasswordHash {
  if (!(candidato instanceof PasswordHash)) {
    throw new UserValidationException(
      'senhaHash',
      'deve ser um PasswordHash; senha em claro não é aceita aqui',
    );
  }
  return candidato;
}

/**
 * Aggregate Root do domínio de Users.
 *
 * Encapsula estado + invariantes + regras de negócio + emissão de eventos.
 * Mutações externas só via factory (criar / restaurarDePersistencia) e mutators.
 *
 * Estado mutável é mantido em campos privados ECMAScript (`#field`), que
 * vivem em um slot interno separado das "own properties" — isso já impede
 * escrita externa. `Object.freeze(this)` é redundante para os campos privados
 * mas protege qualquer own-property pública futura.
 */
export class User {
  readonly #id: UserId;
  #name: UserName;
  #email: Email;
  // pt-BR: `readonly` porque a senha muda por `trocarSenha()`, que é o
  // mutator que faz `version++` — não por escrita direta. Um `#senhaHash`
  // mutável seria uma segunda porta, e nenhuma delas emite evento.
  #senhaHash: PasswordHash;
  // pt-BR (#93.1 — RBAC, 2026-10-16): profileId do RBAC. Null = sem
  // permissões (deny-by-default). Mutator `atribuirPerfil()` faz version++.
  // O UserRepositoryPort.save() persiste o campo como `profile_id`.
  #profileId: string | null;
  readonly #createdAt: Date;
  #updatedAt: Date;
  #version: number;
  #deletedAt: Date | null;
  readonly #events: DomainEvent[] = [];

  private constructor(props: {
    id: UserId;
    name: UserName;
    email: Email;
    senhaHash: PasswordHash;
    profileId: string | null;
    createdAt: Date;
    updatedAt: Date;
    version: number;
    deletedAt: Date | null;
  }) {
    this.#id = props.id;
    this.#name = props.name;
    this.#email = props.email;
    this.#senhaHash = exigirPasswordHash(props.senhaHash);
    this.#profileId = props.profileId;
    this.#createdAt = props.createdAt;
    this.#updatedAt = props.updatedAt;
    this.#version = props.version;
    this.#deletedAt = props.deletedAt;
    Object.freeze(this);
  }

  /**
   * Factory: cria um novo User (versão inicial = 1) e emite UserCreatedEvent.
   *
   * `senhaHash` é OBRIGATÓRIO e é um `PasswordHash`, não uma string: não
   * existe caminho para um User sem senha, e o tipo impede que alguém passe
   * a senha em claro por descuido no call site. O `UserUseCases` hasheia
   * antes de chamar aqui.
   */
  static criar(props: {
    id?: string;
    nome: string;
    email: string;
    senhaHash: PasswordHash;
    profileId?: string | null;
    agora: Date;
  }): User {
    const id = UserId.create(props.id);
    const nome = UserName.create(props.nome);
    const email = Email.create(props.email);
    const u = new User({
      id,
      name: nome,
      email,
      senhaHash: props.senhaHash,
      profileId: props.profileId ?? null,
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
    senhaHash: PasswordHash;
    profileId: string | null;
    createdAt: Date;
    updatedAt: Date;
    version: number;
    deletedAt: Date | null;
  }): User {
    return new User({
      id: UserId.create(props.id),
      name: UserName.create(props.nome),
      email: Email.create(props.email),
      senhaHash: props.senhaHash,
      profileId: props.profileId,
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
  /**
   * O hash da senha.
   *
   * ⚠️ O que volta é o VO, e o VO redige `toString()`. Só o repositório
   * (`toPersistence`) lê `.value`; nenhum DTO de saída faz. Converter isto
   * em `string` aqui desfaria a barreira — daí o getter devolver o VO.
   */
  senhaHash(): PasswordHash {
    return this.#senhaHash;
  }
  /**
   * pt-BR (#93.1 — RBAC, 2026-10-16): profileId do user. Null = sem
   * permissões (deny-by-default no guard). Mutator `atribuirPerfil()`
   * é o ÚNICO caminho de escrita.
   */
  profileId(): string | null {
    return this.#profileId;
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

  /**
   * Troca a senha por um novo hash.
   *
   * Mesmo contrato de `renomear`/`alterarEmail` — e por opção de projeto:
   * uma troca de senha muda o agregado, então ela gera `UserUpdatedEvent`
   * (a entrada no histórico de auditoria) e `version++` (o optimistic
   * locking rejeita um `save` com a versão pré-mudança). Uma troca de
   * senha que não passa pelo histórico é uma troca de senha que o
   * revisor de segurança não consegue ver.
   *
   * O parâmetro é o `PasswordHash` JÁ HASHEADO, nunca a senha em claro: é
   * o tipo que garante que o agregado não tenha para onde armazenar a
   * senha original. `UserUseCases` (Fase 3) chama `passwordHasher.hash()`
   * antes de chegar aqui.
   */
  trocarSenha(novoHash: PasswordHash, agora: Date): void {
    if (this.#deletedAt !== null) {
      throw new UserDeletedException(this.#id.value);
    }
    const previousVersion = this.#version;
    this.#senhaHash = exigirPasswordHash(novoHash);
    this.#updatedAt = agora;
    this.#version = previousVersion + 1;
    this.#events.push(new UserUpdatedEvent(this.#id.value, this.#version, previousVersion, agora));
  }

  /**
   * pt-BR (#93.1 — RBAC, 2026-10-16): atribui (ou remove, com null) o
   * profile do user. Bumpa version e emite UserUpdatedEvent. Lança
   * UserDeletedException se o user está soft-deleted (não dá pra
   * alterar uma conta que foi removida).
   *
   * O caller (use case) valida que o profileId existe antes de chamar
   * — o agregado confia que a referência é válida. O repository tem
   * a FK ON DELETE RESTRICT como rede de segurança.
   */
  atribuirPerfil(novoProfileId: string | null, agora: Date): void {
    if (this.#deletedAt !== null) {
      throw new UserDeletedException(this.#id.value);
    }
    if (this.#profileId === novoProfileId) {
      return; // idempotente
    }
    const previousVersion = this.#version;
    this.#profileId = novoProfileId;
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
    if (agora.getTime() < this.#deletedAt.getTime()) {
      throw new InvalidRestoreException(
        `Não é possível restaurar em ${agora.toISOString()} antes do soft delete em ${this.#deletedAt.toISOString()}`,
      );
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
