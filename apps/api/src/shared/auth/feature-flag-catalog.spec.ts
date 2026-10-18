// apps/api/src/shared/auth/feature-flag-catalog.spec.ts
//
// pt-BR (feature-flags, 2026-10-18): o catálogo é a fonte da verdade das
// chaves. Este spec existe para travar DUAS coisas que a tela de admin e o
// guard dependem:
//
//   1) uma chave que sai do catálogo não vira flag — `isFeatureFlagKey` é o
//      type guard que o VO e o guard usam para rejeitar string arbitrária;
//   2) `listAllFeatureFlags()` devolve o catálogo INTEIRO, incluindo a
//      descrição — a tela renderiza a união catálogo x linhas (D4), então uma
//      chave sem linha precisa continuar aparecendo como "ativada".

import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS, isFeatureFlagKey, listAllFeatureFlags } from './feature-flag-catalog.js';

describe('feature-flag-catalog', () => {
  it('aceita a chave catalogada e rejeita o resto', () => {
    expect(isFeatureFlagKey('tenancy.invites')).toBe(true);

    // Prefixo plausível que ninguém catalogou: é o erro que este spec existe
    // para impedir.
    expect(isFeatureFlagKey('tenancy.invit')).toBe(false);
    expect(isFeatureFlagKey('tenancy.invites.extra')).toBe(false);
    // Chave de permissão que NÃO é flag. A confusão entre os dois catálogos é
    // a outra metade do mesmo erro.
    expect(isFeatureFlagKey('admin.manage-feature-flags')).toBe(false);
    expect(isFeatureFlagKey('users.read')).toBe(false);
  });

  it('rejeita string vazia e tipos não-string', () => {
    expect(isFeatureFlagKey('')).toBe(false);
    expect(isFeatureFlagKey(undefined as unknown as string)).toBe(false);
    expect(isFeatureFlagKey(null as unknown as string)).toBe(false);
  });

  it('lista o catálogo inteiro com chave e descrição preenchida', () => {
    const lista = listAllFeatureFlags();

    expect(lista).toHaveLength(FEATURE_FLAGS.length);
    // Todo item precisa de descrição não-vazia: a tela mostra ela ao lado do
    // toggle, e descrição vazia renderiza uma linha sem explicação.
    for (const f of lista) {
      expect(f.chave).not.toBe('');
      expect(f.descricao.trim()).not.toBe('');
    }
    expect(lista.map((f) => f.chave)).toContain('tenancy.invites');
  });

  it('não devolve o array interno (mutação do consumidor não vaza)', () => {
    const a = listAllFeatureFlags();
    a.pop();
    expect(listAllFeatureFlags()).toHaveLength(FEATURE_FLAGS.length);
  });
});
