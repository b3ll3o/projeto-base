// apps/api/src/modules/feature-flags/domain/ports/feature-flag-repository.port.ts
//
// pt-BR (feature-flags, 2026-10-18): port do estado das funcionalidades.
//
// Duas operações porque o estado cabe em dois lugares: a chave vem do CATÁLOGO
// (código, `shared/auth/feature-flag-catalog.ts`) e o booleano vem da LINHA.
// O repositório só conhece a linha — quem junta as duas coisas é o use case.

/** Token de injeção — a interface é apagada em runtime, sem token o Nest LANÇA. */
export const FEATURE_FLAG_REPOSITORY_PORT = Symbol('FeatureFlagRepositoryPort');

/** Uma linha gravada. `ativada: true` é redundante (D4), mas é o que há. */
export interface FeatureFlagEstado {
  readonly chave: string;
  readonly ativada: boolean;
}

export interface FeatureFlagRepositoryPort {
  /**
   * Todas as linhas gravadas — **não** o estado de todas as chaves.
   *
   * A diferença é D4 e ela é load-bearing: chave que não aparece aqui está
   * ATIVADA. Por isso o método devolve lista, e não um booleano por chave — um
   * `estaAtivada(chave)` esconderia a ausência dentro do valor e a regra
   * viraria detalhe de implementação em três lugares diferentes.
   */
  listar(): Promise<FeatureFlagEstado[]>;

  /**
   * Grava o estado de UMA chave, criando a linha se ela não existir.
   *
   * `chave` é `string` e não o tipo do catálogo de propósito: o banco não
   * conhece o catálogo, e quem garante que a chave existe é o use case
   * (`isFeatureFlagKey`), uma camada acima. Tipar aqui daria a ilusão de que
   * o repositório valida.
   *
   * Sem optimistic lock (D5): o `version` da tabela existe por convenção das
   * outras tabelas e não é lido. Uma tela de admin liga e desliga com o dedo,
   * no singular; perder uma escrita concorrente aqui não perde nada — o
   * próximo clique grava o estado que a tela mostra.
   */
  definir(chave: string, ativada: boolean): Promise<void>;
}
