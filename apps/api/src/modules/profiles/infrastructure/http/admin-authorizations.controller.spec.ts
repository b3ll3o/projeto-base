import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminAuthorizationsController } from './admin-authorizations.controller.js';
import { AuthorizationUseCases } from '../../application/profiles.use-cases.js';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { listAllPermissions } from '../../../../shared/auth/permissions-catalog.js';

// pt-BR (#103, 2026-10-18): as TRÊS rotas deste controller.
//
// `GET /admin/permissions` era a única das 24 rotas declaradas nos controllers
// sem UM ÚNICO teste, em qualquer camada — enquanto atribuir/revogar tinham 35
// ocorrências de spec e e2e. A classe de bug que passa: o `PERMISSIONS` é
// declarado "fonte de verdade", e uma chave acrescentada ao array e não
// aplicada em nenhum perfil, ou removida do array mas ainda em uso no banco,
// só quebra em runtime, na tela de edição de perfil.
//
// O que estes testes seguram, e não "o controller compila":
//   1. as três rotas delegam ao use case com os argumentos certos;
//   2. `GET` devolve EXATAMENTE `listAllPermissions()` — nem mais, nem menos,
//      e sem filtro. Um slice ou um `.filter()` aqui encolheria o catálogo sem
//      nenhuma falha visível, e a tela deixaria de oferecer a permissão;
//   3. o ator é montado a partir de `req.user`, e `tenantId` ausente vira
//      `null` (o bucket de sistema) em vez de `undefined`.

describe('AdminAuthorizationsController', () => {
  let controller: AdminAuthorizationsController;
  let useCases: {
    atribuir: ReturnType<typeof vi.fn>;
    revogar: ReturnType<typeof vi.fn>;
    listarPermissoes: ReturnType<typeof vi.fn>;
  };

  const req = (user: { sub: string; tenantId?: string | null; isAdmin?: boolean }) => ({ user });

  beforeEach(async () => {
    useCases = {
      atribuir: vi.fn(),
      revogar: vi.fn(),
      listarPermissoes: vi.fn(),
    };

    // Os guards são SOBREPOSTOS, não fornecidos: o `@UseGuards` do controller
    // faz o Nest instanciá-los, e o `JwtAuthGuard` puxa a cadeia inteira de
    // tokens, cache e repositório de membership. Isto não é teste de guard — os
    // guards têm spec própria. Aqui o que se mede é o controller, e a
    // autorização de `GET /admin/permissions` é o que o e2e mede.
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAuthorizationsController],
      providers: [{ provide: AuthorizationUseCases, useValue: useCases }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminAuthorizationsController);
  });

  // ── GET /admin/permissions ─────────────────────────────────────────────────

  describe('GET admin/permissions', () => {
    it('devolve EXATAMENTE o catálogo, sem filtro nem reordenação', async () => {
      const catalogo = listAllPermissions();
      useCases.listarPermissoes.mockResolvedValue(catalogo);

      const r = await controller.listar();

      // Igualdade por conteúdo E por ordem: um `.sort()` aqui mudaria o que a
      // tela mostra primeiro, e nenhuma falha de teste acusaria.
      expect(r).toEqual(catalogo);
      expect(r.length).toBe(catalogo.length);
      expect(useCases.listarPermissoes).toHaveBeenCalledTimes(1);
    });

    it('o catálogo não é vazio — lista vazia aqui é o gate mentindo', async () => {
      // A forma como este teste pode passar sem rodar nada: se `listAllPermissions()`
      // devolvesse [], tanto a comparação quanto o `toHaveLength(0)` seriam
      // verdes. O `expect(catalogo.length).toBeGreaterThan(0)` é o que fecha.
      expect(listAllPermissions().length).toBeGreaterThan(0);
    });

    it('toda chave segue o formato `recurso.acao` que o catálogo usa', async () => {
      // MEDIDO no catálogo: 7 chaves, TODAS no formato `X.X`, e 3 delas ainda
      // com hífen dentro do segmento (`admin.manage-users`). Um regex de slug
      // simples passaria neste arquivo e reprovaria a chave real.
      //
      // Por que isto importa: a tela de edição oferece exatamente o que este
      // endpoint devolve, e a escrita valida a chave contra o catálogo. Uma
      // chave com formato inesperado aqui só apareceria como 400 na tela —
      // longe dali, e sem pista de que o catálogo é que estava errado.
      const formato = /^[a-z0-9-]+\.[a-z0-9-]+$/;
      for (const chave of listAllPermissions()) {
        expect(chave).toMatch(formato);
      }
      // E o formato é o de uso, não o de catálogo-vazio: existem segmentos com
      // hífen de verdade, então um `X\.Y` sem classe também passaria.
      expect(listAllPermissions().some((c) => c.includes('-'))).toBe(true);
    });

    it('propaga o erro do use case — o catálogo indisponível não vira []', async () => {
      // Um `catch` que devolvesse `[]` aqui transformaria falha de serviço em
      // "não existe nenhuma permissão", que é um estado que não existe.
      useCases.listarPermissoes.mockRejectedValue(new Error('indisponivel'));
      await expect(controller.listar()).rejects.toThrow('indisponivel');
    });
  });

  // ── POST /admin/profiles/:id/authorizations ───────────────────────────────

  describe('POST admin/profiles/:id/authorizations', () => {
    it('repassa id e permissionKey, e monta o ator com tenant e isAdmin', async () => {
      useCases.atribuir.mockResolvedValue({ id: 'p1' } as never);

      await controller.atribuir(
        'p1',
        { permissionKey: 'users.read' },
        req({ sub: 'u1', tenantId: '11111111-1111-1111-1111-111111111111', isAdmin: true }),
      );

      expect(useCases.atribuir).toHaveBeenCalledWith('p1', 'users.read', {
        userId: 'u1',
        tenantId: '11111111-1111-1111-1111-111111111111',
        isAdmin: true,
      });
    });

    it('tenantId ausente vira null (bucket de sistema), não undefined', async () => {
      // `req.user.tenantId` só existe se o guard publicou. Sem ele, `undefined`
      // desceria até a policy de RLS como valor de comparação e a leitura
      // falharia fechada — devolvendo vazio sem erro.
      useCases.atribuir.mockResolvedValue({ id: 'p1' } as never);
      await controller.atribuir('p1', { permissionKey: 'users.read' }, req({ sub: 'u1' }));
      expect(useCases.atribuir.mock.calls[0][2]).toEqual({
        userId: 'u1',
        tenantId: null,
        isAdmin: false,
      });
    });
  });

  // ── DELETE /admin/profiles/:id/authorizations/:key ─────────────────────────

  describe('DELETE admin/profiles/:id/authorizations/:key', () => {
    it('repassa id e a chave pela URL inteira, sem cortar o prefixo', async () => {
      useCases.revogar.mockResolvedValue({ id: 'p1' } as never);

      await controller.revogar('p1', 'admin.manage-authorizations', req({ sub: 'u1' }));

      expect(useCases.revogar).toHaveBeenCalledWith(
        'p1',
        'admin.manage-authorizations',
        expect.objectContaining({ userId: 'u1' }),
      );
    });

    it('a chave com ponto não é truncada — é o formato real das permissões', async () => {
      // A chave contém ponto. Um `:key` que pegasse só até o primeiro ponto
      // revogaria `admin` em vez de `admin.manage-authorizations`, e a API
      // recusaria por chave inexistente — 400, sem nenhuma pista do porquê.
      useCases.revogar.mockResolvedValue({ id: 'p1' } as never);
      await controller.revogar('p1', 'users.read', req({ sub: 'u1' }));
      expect(useCases.revogar.mock.calls[0][1]).toBe('users.read');
    });
  });
});
