// apps/api/src/modules/profiles/infrastructure/http/admin-profiles.controller.spec.ts
//
// pt-BR (#97): o controller é a FRONTEIRA onde `isAdmin`/`isSystem`
// deixam de existir. A interface `CreateProfileBody` sem esses campos é
// só TypeScript — some na transpilação. Quem manda `{isAdmin:true}` por
// HTTP chega no objeto inteiro, e um `...body` espalhado aqui criaria um
// profile de bypass total para qualquer ator com `admin.manage-profiles`.

import { describe, it, expect } from 'vitest';
import { AdminProfilesController } from './admin-profiles.controller.js';
import type {
  ProfileUseCases,
  ProfileDetail,
  CreateProfileInput,
} from '../../application/profiles.use-cases.js';

const DETALHE: ProfileDetail = {
  id: 'p-1',
  slug: 'viewer',
  name: 'Visualizador',
  isAdmin: false,
  isSystem: false,
  description: null,
  permissionCount: 0,
  permissions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
};

/**
 * `req.user` mínimo do `JwtAuthGuard`. `sub` tem cara de UUID porque é o que
 * o `UserId.create()` do use case aceita — o stub aqui não chega lá, mas um id
 * falso seria um convite a copiar.
 */
const REQ = { user: { sub: '0190f2c1-7a4b-7000-8000-000000000001', isAdmin: true } };

/** Stub que grava o input recebido — é o limite que o teste vigia. */
function controllerComCaptura() {
  const recebido: CreateProfileInput[] = [];
  const atores: unknown[] = [];
  const useCases = {
    criar: async (input: CreateProfileInput, ator: unknown) => {
      recebido.push(input);
      atores.push(ator);
      return DETALHE;
    },
  } as unknown as ProfileUseCases;
  return {
    controller: new AdminProfilesController(useCases),
    capturado: (): CreateProfileInput => {
      expect(recebido).toHaveLength(1);
      return recebido[0] as CreateProfileInput;
    },
    ator: (): unknown => {
      expect(atores).toHaveLength(1);
      return atores[0];
    },
  };
}

describe('AdminProfilesController.create — isAdmin/isSystem só via seed (#97)', () => {
  it('NÃO repassa isAdmin do body, mesmo vindo do cliente', async () => {
    const { controller, capturado } = controllerComCaptura();

    // `as never`: o corpo é o que o HTTP realmente entrega — o tipo não
    // filtra nada em runtime.
    await controller.create(
      {
        slug: 'sneaky',
        name: 'Sneaky',
        isAdmin: true,
      } as never,
      REQ,
    );

    expect(capturado()).not.toHaveProperty('isAdmin');
    expect(capturado()).toEqual({ slug: 'sneaky', name: 'Sneaky' });
  });

  it('NÃO repassa isSystem do body', async () => {
    const { controller, capturado } = controllerComCaptura();

    await controller.create({ slug: 'sneaky', name: 'Sneaky', isSystem: true } as never, REQ);

    expect(capturado()).not.toHaveProperty('isSystem');
  });

  it('NÃO repassa as duas juntas', async () => {
    const { controller, capturado } = controllerComCaptura();

    await controller.create(
      {
        slug: 'root',
        name: 'Root',
        isAdmin: true,
        isSystem: true,
      } as never,
      REQ,
    );

    expect(Object.keys(capturado()).sort()).toEqual(['name', 'slug']);
  });

  it('ainda repassa o que É legítimo (description, initialPermissions)', async () => {
    const { controller, capturado } = controllerComCaptura();

    await controller.create(
      {
        slug: 'editor',
        name: 'Editor',
        description: 'perfil de edição',
        initialPermissions: ['users.read'],
      },
      REQ,
    );

    expect(capturado()).toEqual({
      slug: 'editor',
      name: 'Editor',
      description: 'perfil de edição',
      initialPermissions: ['users.read'],
    });
  });
});

/**
 * pt-BR (#97, A1.3): `initialPermissions` só é trava de escalada se o ATOR
 * chegar ao use case. Um `req` esquecido aqui deixa `criar` rodando sem
 * ator — e o teste acima (que só olha o `input`) continuaria verde. É a
 * mesma classe do B1: o asserto afirma o objeto errado da sessão.
 */
describe('AdminProfilesController.create — o ator chega ao use case (#97/A1.3)', () => {
  it('repassa userId e isAdmin vindos do req.user', async () => {
    const { controller, ator } = controllerComCaptura();

    await controller.create(
      { slug: 'editor', name: 'Editor' },
      {
        user: { sub: '0190f2c1-7a4b-7000-8000-0000000000ff', isAdmin: false },
      },
    );

    expect(ator()).toEqual({
      userId: '0190f2c1-7a4b-7000-8000-0000000000ff',
      isAdmin: false,
    });
  });

  it('trata isAdmin AUSENTE como false (fail-closed, não undefined)', async () => {
    const { controller, ator } = controllerComCaptura();

    await controller.create(
      { slug: 'editor', name: 'Editor' },
      {
        user: { sub: '0190f2c1-7a4b-7000-8000-0000000000ff' },
      },
    );

    // `req.user.isAdmin === true` e não `req.user.isAdmin` — o segundo
    // devolveria `undefined`, que é falsy no `if` do use case mas fica `true`
    // se alguém comparar com `!== false` em vez de testar por verdade.
    expect((ator() as { isAdmin: boolean }).isAdmin).toBe(false);
  });
});
