// apps/api/src/modules/feature-flags/infrastructure/http/admin-feature-flags.controller.spec.ts
//
// pt-BR (feature-flags, 2026-10-18 — Fase 3): a FRONTEIRA de `admin/feature-flags`.
//
// POR QUE UM SPEC DE CONTROLLER E NÃO SÓ DE USE CASE
// O `feature-flag.use-cases.spec.ts` monta a use case com `new` + fake, então
// passa com qualquer grafo de DI quebrado, com `req` errado ou com decorator
// faltando. As três coisas que este arquivo trava são INVISÍVEIS de lá:
//
//   1) A TRADUÇÃO do `req.user` em `AtorAutenticado`. `tenantId` ausente virar
//      `undefined` em vez de `null` é o defeito do bucket de sistema
//      (`ehAdministradorDeSistema` compara `=== null`), e `isAdmin` ausente
//      virar `undefined` em vez de `false` é fail-open em qualquer `if` futuro.
//   2) A chave do toggle vem da URL. Um controller que pegasse `body.chave`
//      deixaria o cliente escolher a linha — e a tela manda a chave na URL
//      justamente para que o recurso seja endereçável.
//   3) `@RequirePermission` em CADA handler. Sem o decorator o
//      `PermissionsGuard` NÃO recusa: `required === undefined` ⇒ `return true`
//      (`permissions.guard.ts:60`) — o handler fica ABERTO, não fechado. É o
//      oposto do senso comum, e por isso vale uma spec que não olha a rota.
//
// A assinatura dos handlers é a do Nest: `(chave, body, req)`. Os specs
// chamam o método direto, então a ordem dos parâmetros É o contrato medido.

import { describe, expect, it } from 'vitest';
import { AdminFeatureFlagsController } from './admin-feature-flags.controller.js';
import { FeatureFlagUseCases } from '../../application/feature-flag.use-cases.js';
import { PERMISSION_KEYS_METADATA } from '../../../profiles/infrastructure/http/decorators/require-permission.decorator.js';
import type { AtorAutenticado } from '../../../../shared/auth/eh-administrador-de-sistema.js';

const DTO = {
  chave: 'tenancy.invites',
  descricao: 'Emissão de convites por empresa. Desligar não impede quem já tem convite de entrar.',
  ativada: false,
};

/** `req.user` do admin do sistema: `tenantId: null` porque a rota não tem empresa. */
const REQ_ADMIN = {
  user: { sub: '0190f2c1-7a4b-7000-8000-0000000000ff', tenantId: null, isAdmin: true },
};

/**
 * Stub que REGISTRA o que recebeu. Um stub que só devolve o DTO deixa passar
 * um controller que não repassa o ator — e o `ator` é o 1º parâmetro de
 * `definir`, o único que o `as unknown as` apaga do tipo.
 */
function controllerComCaptura() {
  const listagens: AtorAutenticado[] = [];
  const definicoes: { ator: AtorAutenticado; chave: string; ativada: boolean }[] = [];

  const useCases = {
    listar: async (ator: AtorAutenticado) => {
      listagens.push(ator);
      return [DTO];
    },
    definir: async (ator: AtorAutenticado, chave: string, ativada: boolean) => {
      definicoes.push({ ator, chave, ativada });
      return { ...DTO, chave, ativada };
    },
  } as unknown as FeatureFlagUseCases;

  return {
    controller: new AdminFeatureFlagsController(useCases),
    atorDaListagem: (): AtorAutenticado => {
      expect(listagens).toHaveLength(1);
      return listagens[0] as AtorAutenticado;
    },
    definicao: () => {
      expect(definicoes).toHaveLength(1);
      return definicoes[0] as { ator: AtorAutenticado; chave: string; ativada: boolean };
    },
  };
}

describe('AdminFeatureFlagsController — o ator chega ao use case', () => {
  it('listar repassa userId, tenantId e isAdmin vindos do req.user', async () => {
    const { controller, atorDaListagem } = controllerComCaptura();

    await controller.listar({
      user: {
        sub: '0190f2c1-7a4b-7000-8000-0000000000ff',
        tenantId: '0190a8b6-0000-4000-8000-00000000000a',
        isAdmin: true,
      },
    });

    expect(atorDaListagem()).toEqual({
      userId: '0190f2c1-7a4b-7000-8000-0000000000ff',
      tenantId: '0190a8b6-0000-4000-8000-00000000000a',
      isAdmin: true,
    });
  });

  it('tenantId AUSENTE vira null, nunca undefined', async () => {
    // `ehAdministradorDeSistema` compara `tenantId === null`. Um `undefined`
    // aqui não é "sem empresa": é um valor que falha a comparação e passa como
    // empresa desconhecida — o oposto do que a ausência significa.
    const { controller, atorDaListagem } = controllerComCaptura();

    await controller.listar({ user: { sub: 'u-1' } });

    expect(atorDaListagem()).toHaveProperty('tenantId', null);
  });

  it('isAdmin AUSENTE vira false (fail-closed, não undefined)', async () => {
    const { controller, definicao } = controllerComCaptura();

    await controller.definir('tenancy.invites', { ativada: false }, { user: { sub: 'u-1' } });

    // `toBeFalsy()` passaria com `undefined`; a porta de D2 é `=== true` do
    // outro lado, então o que precisa ser provado é o VALOR, não a falsidade.
    expect(definicao().ator.isAdmin).toBe(false);
  });

  it('definir repassa o ator TAMBÉM (o PUT grava por baixo de quem mandou)', async () => {
    const { controller, definicao } = controllerComCaptura();

    await controller.definir('tenancy.invites', { ativada: false }, REQ_ADMIN);

    expect(definicao().ator).toEqual({
      userId: '0190f2c1-7a4b-7000-8000-0000000000ff',
      tenantId: null,
      isAdmin: true,
    });
  });
});

describe('AdminFeatureFlagsController — a chave vem da URL', () => {
  it('definir usa a chave do PATH e o booleano do BODY', async () => {
    const { controller, definicao } = controllerComCaptura();

    await controller.definir('tenancy.invites', { ativada: true }, REQ_ADMIN);

    const { chave, ativada } = definicao();
    expect(chave).toBe('tenancy.invites');
    expect(ativada).toBe(true);
  });

  it('ignora uma chave que o cliente mande no BODY', async () => {
    const { controller, definicao } = controllerComCaptura();

    // `as never`: o corpo é o que o HTTP realmente entrega — o tipo não
    // filtra nada em runtime. Um controller que lesse `body.chave` deixaria o
    // cliente escolher a linha alternada, e a URL pararia de endereçar.
    await controller.definir(
      'tenancy.invites',
      { ativada: false, chave: 'tenancy.linha_orfa' } as never,
      REQ_ADMIN,
    );

    expect(definicao().chave).toBe('tenancy.invites');
  });
});

describe('AdminFeatureFlagsController — a permissão está em CADA handler', () => {
  // MEDIDO 2026-10-18 no `PermissionsGuard`: sem metadata o guard devolve
  // `true` (`permissions.guard.ts:60`, `required === undefined || length === 0
  // ⇒ return true`). Ou seja: decorator faltando = rota ABERTA. Um controller
  // novo cuja única defesa fosse o `@RequirePermission` passaria despercebido
  // por todos os specs de use case.
  const ESPERADO = 'admin.manage-feature-flags';

  it('listar declara a permissão', () => {
    expect(
      Reflect.getMetadata(PERMISSION_KEYS_METADATA, AdminFeatureFlagsController.prototype.listar),
    ).toEqual([ESPERADO]);
  });

  it('definir declara a permissão', () => {
    expect(
      Reflect.getMetadata(PERMISSION_KEYS_METADATA, AdminFeatureFlagsController.prototype.definir),
    ).toEqual([ESPERADO]);
  });
});
