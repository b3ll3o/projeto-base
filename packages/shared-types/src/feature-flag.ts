// packages/shared-types/src/feature-flag.ts
//
// pt-BR (feature-flags, 2026-10-18): contrato da tela de admin de feature
// flags. Fica no pacote compartilhado pelo mesmo motivo das demais:
// `apps/web` tipa o que a API devolve, sem duplicar o shape à mão.

/**
 * Uma linha da tela: a chave vem do catálogo do servidor (o web NÃO tem
 * catálogo próprio — ele renderiza o que a API devolveu), e `ativada` é o
 * estado efetivo.
 *
 * ⚠️ `ativada` chega `true` para chave sem linha no banco: linha ausente
 * significa ATIVADA (decisão D4 do plano). O cliente nunca infere o estado a
 * partir da ausência — ele só lê o booleano.
 */
export interface FeatureFlagDto {
  readonly chave: string;
  readonly descricao: string;
  readonly ativada: boolean;
}

/** Corpo do PUT de toggle. Só o estado muda; a chave vem da URL. */
export interface UpdateFeatureFlagInputDto {
  readonly ativada: boolean;
}
