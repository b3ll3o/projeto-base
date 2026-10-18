// apps/api/src/modules/feature-flags/infrastructure/http/decorators/require-feature-flag.decorator.ts
//
// pt-BR (feature-flags, 2026-10-18 — Fase 4): decorator que marca um handler
// como dependente de uma ou mais FUNCIONALIDADES ligadas. O `FeatureFlagGuard`
// lê o metadata; sem ele, o guard não exige nada.
//
// Uso: `@RequireFeatureFlag('tenancy.invites')`.
//
// Cópia de `require-permission.decorator.ts:13-16` — inclusive a chave do
// metadata como NOME (`'rbac.permissionKeys'` → `'featureFlags.keys'`), que é o
// mesmo acordo do resto do HTTP do repo.

import { SetMetadata } from '@nestjs/common';
import type { FeatureFlagKey } from '../../../../../shared/auth/feature-flag-catalog.js';

export const FEATURE_FLAG_KEYS_METADATA = 'featureFlags.keys';

export const RequireFeatureFlag = (...keys: FeatureFlagKey[]): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_FLAG_KEYS_METADATA, keys);
