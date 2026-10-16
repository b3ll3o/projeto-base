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

/** Stub que grava o input recebido — é o limite que o teste vigia. */
function controllerComCaptura() {
  const recebido: CreateProfileInput[] = [];
  const useCases = {
    criar: async (input: CreateProfileInput) => {
      recebido.push(input);
      return DETALHE;
    },
  } as unknown as ProfileUseCases;
  return {
    controller: new AdminProfilesController(useCases),
    capturado: (): CreateProfileInput => {
      expect(recebido).toHaveLength(1);
      return recebido[0] as CreateProfileInput;
    },
  };
}

describe('AdminProfilesController.create — isAdmin/isSystem só via seed (#97)', () => {
  it('NÃO repassa isAdmin do body, mesmo vindo do cliente', async () => {
    const { controller, capturado } = controllerComCaptura();

    // `as never`: o corpo é o que o HTTP realmente entrega — o tipo não
    // filtra nada em runtime.
    await controller.create({
      slug: 'sneaky',
      name: 'Sneaky',
      isAdmin: true,
    } as never);

    expect(capturado()).not.toHaveProperty('isAdmin');
    expect(capturado()).toEqual({ slug: 'sneaky', name: 'Sneaky' });
  });

  it('NÃO repassa isSystem do body', async () => {
    const { controller, capturado } = controllerComCaptura();

    await controller.create({ slug: 'sneaky', name: 'Sneaky', isSystem: true } as never);

    expect(capturado()).not.toHaveProperty('isSystem');
  });

  it('NÃO repassa as duas juntas', async () => {
    const { controller, capturado } = controllerComCaptura();

    await controller.create({
      slug: 'root',
      name: 'Root',
      isAdmin: true,
      isSystem: true,
    } as never);

    expect(Object.keys(capturado()).sort()).toEqual(['name', 'slug']);
  });

  it('ainda repassa o que É legítimo (description, initialPermissions)', async () => {
    const { controller, capturado } = controllerComCaptura();

    await controller.create({
      slug: 'editor',
      name: 'Editor',
      description: 'perfil de edição',
      initialPermissions: ['users.read'],
    });

    expect(capturado()).toEqual({
      slug: 'editor',
      name: 'Editor',
      description: 'perfil de edição',
      initialPermissions: ['users.read'],
    });
  });
});
