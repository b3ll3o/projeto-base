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
  // pt-BR (#93.1 — RBAC, 2026-10-16): profileId do user atribuído.
  // Null = sem permissões (deny-by-default). O endpoint /me/profile
  // cruza este id com a tabela profiles para devolver nome + slug.
  //
  // pt-BR (#106, 2026-10-18): este campo é o perfil **GLOBAL** da conta
  // (`users.profile_id`), e é `null` para toda conta criada pelo produto.
  // A autorização lê `tenant_memberships.profile_id`. Para a tela, o que
  // importa é o perfil no escopo — por isso `perfilEfetivoNoEscopo` existe
  // ao lado. Não usar este para decidir permissão: ele não a representa.
  profileId: string | null;
  /**
   * pt-BR (#106): perfil no tenant pedido. É este que `/admin/users` exibe.
   *
   * ⚠️ pt-BR (achado 1) `null` = sem perfil. `undefined` = a listagem não pediu
   * a projeção. O contrato de três estados que existiu aqui (ausente = "não
   * pertence a esta empresa") foi REMOVIDO porque no bucket global não havia
   * dado que o sustentasse.
   */
  perfilEfetivoNoEscopo?: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
  isDeleted: boolean;
}

/**
 * pt-BR (#106): variante de `toUserOutput` que sabe o perfil efetivo no escopo.
 *
 * `toUserOutput` continua existindo sem alteração porque é usada em caminhos
 * onde o escopo não importa (criação, detail, `/me/profile`) — e num caminho
 * sem escopo, inventar um perfil efetivo seria inventar dado.
 */
export function toUserOutputNoEscopo(
  user: User,
  perfilEfetivo: string | null | undefined,
): UserOutput {
  const base = toUserOutput(user);
  if (perfilEfetivo === undefined) return base;
  return { ...base, perfilEfetivoNoEscopo: perfilEfetivo };
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
    // pt-BR (#93.1 — RBAC, 2026-10-16): profileId do user atribuído.
    // Null = sem permissões (deny-by-default). O endpoint /me/profille
    // cruza este id com a tabela profiles para devolver nome + slug.
    profileId: user.profileId(),
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
