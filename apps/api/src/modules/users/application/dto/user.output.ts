import type { User } from '../../domain/user.aggregate.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';

/**
 * DTO de saída — representa um User para o caller externo (HTTP/CLI/job).
 * Usa apenas tipos primitivos serializáveis (sem Date → ISO string).
 */
export interface UserOutput {
  id: string;
  nome: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
  isDeleted: boolean;
}

/**
 * Converte o agregado User em UserOutput (para retornar do use case ao caller).
 * Imutável: retorna novo objeto.
 */
export function toUserOutput(user: User): UserOutput {
  return {
    id: user.id().value,
    nome: user.nome().value,
    email: user.email().value,
    createdAt: user.createdAt().toISOString(),
    updatedAt: user.updatedAt().toISOString(),
    version: user.version(),
    deletedAt: user.deletedAt() === null ? null : user.deletedAt()!.toISOString(),
    isDeleted: user.isDeleted(),
  };
}

/**
 * Helper para reconverter UserOutput.id em UserId (uso no adapter inbound HTTP).
 * Lança Error se o id não for UUID v7 válido.
 */
export function toUserIdFromOutput(output: UserOutput): UserId {
  return UserId.create(output.id);
}
