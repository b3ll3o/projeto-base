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

export const FEATURE_FLAGS = [
  {
    chave: 'tenancy.invites',
    // O alcance e o limite estão no cabeçalho de `feature-flag.guard.ts`. Esta é
    // a linha que o admin LÊ, então ela repete o limite — não a rota, que era o
    // que o texto antigo citava e não dizia o que desligar deixa de fazer.
    // MEDIDO 2026-10-19: o texto anterior ("desligar não impede quem já tem
    // convite de entrar") era verdade e deixou de ser, quando as duas portas
    // foram fechadas. Uma descrição de flag que mente é pior que ausente: o
    // admin lê aqui antes de desligar.
    descricao:
      'Emissão e aceite de convites por empresa. Desligar tranca as duas portas: nem o dono convida, nem quem tem token entra.',
  },
] as const;

/**
 * Derivado do array, nunca escrito à mão — é o mesmo acordo de
 * `permissions-catalog.ts:42` (`(typeof PERMISSIONS)[number]`).
 *
 * MEDIDO 2026-10-18 (revisão da Fase 0): com o union escrito à mão ao lado do
 * array, os dois divergiam em silêncio. `'tenancy.exports'` adicionado só ao
 * union compilava (`tsc` exit 0), passava o spec do catálogo (4/4 verdes) e
 * `isFeatureFlagKey('tenancy.exports')` devolvia `false` em runtime — o
 * compilador aceitando exatamente o que o programa rejeita. A anotação
 * `readonly FeatureFlagDefinicao[]` no array era o que permitia: ela alarga
 * `chave` para `string`, e o `as const` abaixo não tinha sobre o que agir.
 */
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]['chave'];

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

/**
 * Descrição de UMA chave, para o use case que acabou de gravar montar o DTO
 * sem reler o banco.
 *
 * Existe como função porque `noUncheckedIndexedAccess` está ligado
 * (`tsconfig.base.json`): um `find()` devolve `| undefined`, e o caller teria
 * de usar `!` — afirmação que a linha de `isFeatureFlagKey` acima já pagou.
 *
 * ⚠️ O `throw` abaixo é inalcançável **para qualquer caller que passe o valor
 * já estreitado por `isFeatureFlagKey`** — medido: `tsc` recusa
 * `descricaoDe('tenancy.invit')` com TS2345, e `grep 'as FeatureFlagKey'`
 * no repo inteiro dá 0. Ele NÃO é impossível em runtime: `FEATURE_FLAGS` é
 * exportado mutável e há um `await` entre o guard e esta linha, então uma
 * porta que esvaziasse o catálogo durante a gravação faria o throw disparar
 * (provado pelo revisor da F2 com uma porta hostil). O ramo fica sem spec de
 * propósito — é uma afirmação de tipo, não lógica — e o preço é o arquivo em
 * 89,47% stmt / 83,33% branch, acima do gate de 80%.
 */
export function descricaoDe(chave: FeatureFlagKey): string {
  const definicao = FEATURE_FLAGS.find((f) => f.chave === chave);
  if (definicao === undefined) {
    throw new Error(`chave de flag fora do catálogo: ${chave}`);
  }
  return definicao.descricao;
}
