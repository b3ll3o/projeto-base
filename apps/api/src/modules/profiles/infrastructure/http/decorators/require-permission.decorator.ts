// apps/api/src/modules/profiles/infrastructure/http/decorators/require-permission.decorator.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): decorator que marca um controller
// method como requerendo uma (ou mais) permission keys. O
// PermissionsGuard lê o metadata e compara com `req.user.permissions`.
//
// Uso: `@RequirePermission('users.write')` ou
//      `@RequirePermission('users.write', 'users.delete')` (lógica OR).

import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '../../../../../shared/auth/permissions-catalog.js';

export const PERMISSION_KEYS_METADATA = 'rbac.permissionKeys';

export const RequirePermission = (...keys: PermissionKey[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEYS_METADATA, keys);
