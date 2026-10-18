// apps/api/src/shared/auth/feature-flag-catalog.ts
//
// pt-BR (feature-flags, 2026-10-18): catálogo canônico das chaves de
// FUNCIONALIDADE que o administrador do sistema pode ligar e desligar.
//
// Por que um catálogo e não uma tabela de chaves livres: o conjunto de flags é
// código revisável, e o tipo `FeatureFlagKey` faz o compilador recusar
// `@RequireFeatureFlag('typo')` — o mesmo acordo do `permissions-catalog.ts`.
//
// Diferença em relação ao catálogo de permissões, que é a armadilha clássica
// deste módulo:
//
//   - permissão = o que um ATOR pode fazer. Chave nova entra no catálogo e o
//     signup a concede ao dono de cada empresa
//     (`prisma-tenant-onboarding.repository.ts:209`).
//   - flag      = se a FUNCIONALIDADE está disponível no sistema inteiro. Não
//     tem perfil, não tem empresa, não tem concessão: ou está ligada para todo
//     mundo ou desligada para todo mundo.
//
// Semântica de linha ausente: **ATIVADA** (decisão D4 do plano). O estado
// padrão do sistema é "funciona", então chave nova no catálogo sem migration
// não apaga nada. A linha só existe para dizer "desligada".

export interface FeatureFlagDefinicao {
  /** Chave estável — é o que a tela envia e o que o guard lê. */
  readonly chave: string;
  /** Texto que o admin lê na tela. Sem descrição a linha não se explica. */
  readonly descricao: string;
}

export const FEATURE_FLAGS: readonly FeatureFlagDefinicao[] = [
  {
    chave: 'tenancy.invites',
    descricao: 'Convite de usuário para uma empresa (POST /tenants/:id/invitations).',
  },
] as const;

export type FeatureFlagKey = 'tenancy.invites';

/** Type guard: a string é uma chave de flag catalogada? */
export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return FEATURE_FLAGS.some((f) => f.chave === value);
}

/**
 * Catálogo inteiro, com descrição. Cópia rasa do array para que um
 * `.pop()` do consumidor não apague a chave do processo.
 */
export function listAllFeatureFlags(): FeatureFlagDefinicao[] {
  return [...FEATURE_FLAGS];
}
