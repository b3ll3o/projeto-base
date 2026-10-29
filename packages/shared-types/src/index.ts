/**
 * Re-exporta todos os tipos públicos do pacote.
 * Importadores usam: import type { UserOutputDto } from '@projeto/shared-types';
 */
export type {
  UUID,
  ISODateString,
  UserOutputDto,
  CreateUserInputDto,
  DestinoContaDto,
  UpdateUserInputDto,
  RestoreUserInputDto,
  AuditOperationType,
  UserHistoryEntryDto,
  UserArchiveEntryDto,
  UsersPageDto,
  UserHistoryPageDto,
  ProblemDetailsDto,
  ProblemDetailsError,
} from './user.js';

export type {
  ProfileSummary,
  ProfileDetail,
  MeProfileDto,
  CreateProfileInputDto,
  UpdateProfileInputDto,
  AssignProfileInputDto,
} from './profile.js';

export type { FeatureFlagDto, UpdateFeatureFlagInputDto } from './feature-flag.js';

export type {
  EmpresaDto,
  EmpresaDoUsuarioDto,
  CriarEmpresaInputDto,
  ConviteAceitoDto,
  MembroDaEmpresaDto,
  EmpresaComMembrosDto,
  EmpresaComPerfilDto,
  UsuarioComEmpresasDto,
  InventarioAdminTenancyDto,
} from './tenant.js';
