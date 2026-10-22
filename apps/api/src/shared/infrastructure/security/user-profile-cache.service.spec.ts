// apps/api/src/shared/infrastructure/security/user-profile-cache.service.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): smoke test do UserProfileCacheService.
// Garante que o cache de 5s TTL para user→{isAdmin, permissions[]} funciona.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UserProfileCacheService } from './user-profile-cache.service.js';

describe('UserProfileCacheService', () => {
  // pt-BR (Fase 3): a chave passou a ser o par (tenant, user). Este bloco
  // exercita TTL e invalidação, que não dependem do tenant — um tenant fixo
  // basta. O isolamento entre empresas tem bloco próprio abaixo.
  const TENANT = '0190a8b6-0000-4000-8000-00000000000a';
  let svc: UserProfileCacheService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    svc = new UserProfileCacheService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna null para userId não cacheado', async () => {
    expect(await svc.getUserProfileAndPermissions(TENANT, 'user-1')).toBeNull();
  });

  it('set + get retorna valor armazenado', async () => {
    await svc.setUserProfileAndPermissions(TENANT, 'user-1', {
      isAdmin: true,
      permissions: ['users.read'],
      profileId: 'p1',
      profileSlug: 'admin',
      profileName: 'Admin',
    });
    expect(await svc.getUserProfileAndPermissions(TENANT, 'user-1')).toEqual({
      isAdmin: true,
      permissions: ['users.read'],
      profileId: 'p1',
      profileSlug: 'admin',
      profileName: 'Admin',
    });
  });

  it('valor expira após 5s (TTL)', async () => {
    await svc.setUserProfileAndPermissions(TENANT, 'user-1', {
      isAdmin: false,
      permissions: [],
      profileId: null,
      profileSlug: null,
      profileName: null,
    });
    expect(await svc.getUserProfileAndPermissions(TENANT, 'user-1')).not.toBeNull();
    vi.advanceTimersByTime(5_001);
    expect(await svc.getUserProfileAndPermissions(TENANT, 'user-1')).toBeNull();
  });

  // pt-BR (2026-10-17): o teste de TTL acima é cego para o vazamento. Ele relê
  // a chave, e o `get` é justamente o caminho que JÁ apaga a entrada expirada —
  // então "a entrada sumiu" não distingue "a varredura pegou" de "a leitura
  // pegou". Este aqui não lê nada: escreve 3, deixa expirar, e mede o `Map` pelo
  // `tamanho()` logo depois do `set` que dispara a varredura. Sem a varredura,
  // `tamanho()` seria 4.
  it('a varredura no set apaga o que expirou sem ninguem reler', async () => {
    const VAZIO = {
      isAdmin: false,
      permissions: [],
      profileId: null,
      profileSlug: null,
      profileName: null,
    };
    await svc.setUserProfileAndPermissions(TENANT, 'user-1', VAZIO);
    await svc.setUserProfileAndPermissions(TENANT, 'user-2', VAZIO);
    await svc.setUserProfileAndPermissions(TENANT, 'user-3', VAZIO);
    expect(svc.tamanho()).toBe(3);

    vi.advanceTimersByTime(5_001);

    // Sem ler nada: o unico `set` seguinte varre o `Map` antes de escrever.
    await svc.setUserProfileAndPermissions(TENANT, 'user-4', VAZIO);

    expect(svc.tamanho()).toBe(1);
  });

  it('valor persiste antes de 5s', async () => {
    await svc.setUserProfileAndPermissions(TENANT, 'user-1', {
      isAdmin: true,
      permissions: [],
      profileId: null,
      profileSlug: null,
      profileName: null,
    });
    vi.advanceTimersByTime(4_999);
    expect(await svc.getUserProfileAndPermissions(TENANT, 'user-1')).not.toBeNull();
  });

  it('invalidateUser remove apenas o userId', async () => {
    await svc.setUserProfileAndPermissions(TENANT, 'user-1', {
      isAdmin: true,
      permissions: [],
      profileId: null,
      profileSlug: null,
      profileName: null,
    });
    await svc.setUserProfileAndPermissions(TENANT, 'user-2', {
      isAdmin: false,
      permissions: [],
      profileId: null,
      profileSlug: null,
      profileName: null,
    });
    await svc.invalidateUser('user-1');
    expect(await svc.getUserProfileAndPermissions(TENANT, 'user-1')).toBeNull();
    expect(await svc.getUserProfileAndPermissions(TENANT, 'user-2')).not.toBeNull();
  });

  it('invalidateAll limpa tudo', async () => {
    await svc.setUserProfileAndPermissions(TENANT, 'user-1', {
      isAdmin: true,
      permissions: [],
      profileId: null,
      profileSlug: null,
      profileName: null,
    });
    await svc.setUserProfileAndPermissions(TENANT, 'user-2', {
      isAdmin: true,
      permissions: [],
      profileId: null,
      profileSlug: null,
      profileName: null,
    });
    await svc.invalidateAll();
    expect(await svc.getUserProfileAndPermissions(TENANT, 'user-1')).toBeNull();
    expect(await svc.getUserProfileAndPermissions(TENANT, 'user-2')).toBeNull();
  });
});

// pt-BR (Fase 3 — tenancy, 2026-10-16): a chave passa a ser o PAR
// (tenant, user). Com a chave só por usuário, o mesmo usuário em duas
// empresas recebe o perfil da empresa anterior por até 5s — vazamento
// horizontal de privilégio, não só um cache que erra.
//
// ⚠️ Por que o primeiro teste é "mesma empresa, dois usuários" e não
// "mesmo usuário, duas empresas": a implementação antiga usava o
// PRIMEIRO argumento como chave. Um teste que só variasse o tenant
// passaria nela por acidente — viraria a chave `userId` para `tenantId`
// e ainda "funcionaria" com um tenant só. Já a colisão entre usuários
// DENTRO do mesmo tenant não existe no código antigo, que nem recebe o
// userId. É esse teste que fica vermelho e prova que a assinatura mudou.
describe('UserProfileCacheService — par (tenant, user)', () => {
  const ACME = '0190a8b6-0000-4000-8000-00000000000a';
  const GLOBEX = '0190a8b6-0000-4000-8000-00000000000b';
  const USER_1 = '0190a8b6-0000-4000-8000-000000000001';
  const USER_2 = '0190a8b6-0000-4000-8000-000000000002';

  const PERFIL_ADMIN = {
    isAdmin: true,
    permissions: ['admin.manage-users'],
    profileId: 'p-admin',
    profileSlug: 'admin',
    profileName: 'Admin',
  };
  const PERFIL_GESTOR = {
    isAdmin: false,
    permissions: ['users.read'],
    profileId: 'p-gestor',
    profileSlug: 'coordenador',
    profileName: 'Coordenador',
  };

  let svc: UserProfileCacheService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    svc = new UserProfileCacheService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('nao colide entre usuarios da MESMA empresa', async () => {
    await svc.setUserProfileAndPermissions(ACME, USER_1, PERFIL_ADMIN);
    await svc.setUserProfileAndPermissions(ACME, USER_2, PERFIL_GESTOR);

    expect(await svc.getUserProfileAndPermissions(ACME, USER_1)).toEqual(PERFIL_ADMIN);
    expect(await svc.getUserProfileAndPermissions(ACME, USER_2)).toEqual(PERFIL_GESTOR);
  });

  it('NAO entrega o perfil da empresa A ao pedir o da empresa B (vazamento horizontal)', async () => {
    await svc.setUserProfileAndPermissions(ACME, USER_1, PERFIL_ADMIN);

    // O pedido é de GLOBEX e o único valor cacheado é de ACME. Se a chave
    // ainda fosse só o usuário, aqui viria `PERFIL_ADMIN` — `isAdmin: true`
    // numa empresa onde o usuário não administra nada.
    expect(await svc.getUserProfileAndPermissions(GLOBEX, USER_1)).toBeNull();
  });

  it('o mesmo usuario tem perfil independente em cada empresa', async () => {
    await svc.setUserProfileAndPermissions(ACME, USER_1, PERFIL_ADMIN);
    await svc.setUserProfileAndPermissions(GLOBEX, USER_1, PERFIL_GESTOR);

    expect(await svc.getUserProfileAndPermissions(ACME, USER_1)).toEqual(PERFIL_ADMIN);
    expect(await svc.getUserProfileAndPermissions(GLOBEX, USER_1)).toEqual(PERFIL_GESTOR);
  });

  it('tenant ausente e um bucket proprio, nao o perfil de empresa alguma', async () => {
    await svc.setUserProfileAndPermissions(ACME, USER_1, PERFIL_ADMIN);

    // `null` = rota sem `X-Tenant-Id`, que resolve o perfil GLOBAL. O que NAO
    // pode e o bucket `null` herdar o perfil da ACME.
    expect(await svc.getUserProfileAndPermissions(null, USER_1)).toBeNull();
  });

  it('invalidateUser limpa o usuario em TODAS as empresas', async () => {
    await svc.setUserProfileAndPermissions(ACME, USER_1, PERFIL_ADMIN);
    await svc.setUserProfileAndPermissions(GLOBEX, USER_1, PERFIL_GESTOR);
    await svc.setUserProfileAndPermissions(ACME, USER_2, PERFIL_ADMIN);

    await svc.invalidateUser(USER_1);

    expect(await svc.getUserProfileAndPermissions(ACME, USER_1)).toBeNull();
    expect(await svc.getUserProfileAndPermissions(GLOBEX, USER_1)).toBeNull();
    // ...e nao leva junto o outro usuario da mesma empresa.
    expect(await svc.getUserProfileAndPermissions(ACME, USER_2)).toEqual(PERFIL_ADMIN);
  });
});
