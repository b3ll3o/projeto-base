// apps/api/src/modules/feature-flags/infrastructure/http/guards/feature-flag.guard.spec.ts
//
// pt-BR (feature-flags, 2026-10-18 — Fase 4): o guard que decide se a
// FUNCIONALIDADE está ligada.
//
// Os 5 casos do plano: sem decorator passa · flag ligada passa · LINHA AUSENTE
// passa (D4) · flag desligada => 404 · sem `req.user` => 403.
//
// ⚠️ A porta falsa é IN-MEMORY e não `{ ativada: true }` literal: com um literal
// o guard passaria nos 5 casos mesmo se tratasse a AUSÊNCIA como desligada, que
// é exatamente a inversão de D4. A ausência é o caso padrão deste sistema,
// então um fake que não a produz não exercita nada.

import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { FeatureFlagGuard, registrarBloqueio } from './feature-flag.guard.js';
import {
  FEATURE_FLAG_REPOSITORY_PORT,
  type FeatureFlagEstado,
  type FeatureFlagRepositoryPort,
} from '../../../domain/ports/feature-flag-repository.port.js';

/** Porta em memória — o que o Postgres devolve, sem o Postgres. */
class PortaEmMemoria implements FeatureFlagRepositoryPort {
  constructor(private linhas: FeatureFlagEstado[] = []) {}
  async listar(): Promise<FeatureFlagEstado[]> {
    return [...this.linhas];
  }
  async definir(chave: string, ativada: boolean): Promise<void> {
    this.linhas = [...this.linhas.filter((l) => l.chave !== chave), { chave, ativada }];
  }
}

function makeCtx(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeGuard(meta: unknown, linhas: FeatureFlagEstado[] = []) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(meta),
  } as unknown as Reflector;
  const repositorio = new PortaEmMemoria(linhas);
  return { guard: new FeatureFlagGuard(reflector, repositorio), repositorio };
}

const ATOR = { sub: 'user-1' };

describe('FeatureFlagGuard', () => {
  it('sem `@RequireFeatureFlag` passa — e não consulta o banco', async () => {
    const { guard, repositorio } = makeGuard(undefined);
    const listar = vi.spyOn(repositorio, 'listar');

    await expect(guard.canActivate(makeCtx(ATOR))).resolves.toBe(true);
    expect(listar).not.toHaveBeenCalled();
  });

  it('metadata vazia passa pelo mesmo caminho', async () => {
    const { guard } = makeGuard([]);

    await expect(guard.canActivate(makeCtx(ATOR))).resolves.toBe(true);
  });

  it('flag LIGADA passa', async () => {
    const { guard } = makeGuard(['tenancy.invites'], [{ chave: 'tenancy.invites', ativada: true }]);

    await expect(guard.canActivate(makeCtx(ATOR))).resolves.toBe(true);
  });

  it('LINHA AUSENTE passa — D4: o padrão do sistema é ligado', async () => {
    // A porta tem linhas, mas não desta chave. Se o guard tratasse `find()`
    // ausente como desligado, é aqui que ele cairia.
    const { guard } = makeGuard(['tenancy.invites'], [{ chave: 'outra.coisa', ativada: true }]);

    await expect(guard.canActivate(makeCtx(ATOR))).resolves.toBe(true);
  });

  it('flag DESLIGADA => 404, não 403 — o recurso não existe enquanto está off', async () => {
    const { guard } = makeGuard(
      ['tenancy.invites'],
      [{ chave: 'tenancy.invites', ativada: false }],
    );

    await expect(guard.canActivate(makeCtx(ATOR))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sem `req.user` => 403 — fail-closed: o guard não é substituto de autenticação', async () => {
    const { guard, repositorio } = makeGuard(['tenancy.invites']);
    const listar = vi.spyOn(repositorio, 'listar');

    await expect(guard.canActivate(makeCtx(undefined))).rejects.toBeInstanceOf(ForbiddenException);
    expect(listar).not.toHaveBeenCalled();
  });

  it('DUAS chaves: uma só desligada já barra (AND, não OR)', async () => {
    const umaDesligada = makeGuard(
      ['tenancy.invites', 'tenancy.exports'],
      [
        { chave: 'tenancy.invites', ativada: false },
        { chave: 'tenancy.exports', ativada: true },
      ],
    );
    await expect(umaDesligada.guard.canActivate(makeCtx(ATOR))).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const ambasLigadas = makeGuard(
      ['tenancy.invites', 'tenancy.exports'],
      [
        { chave: 'tenancy.invites', ativada: true },
        { chave: 'tenancy.exports', ativada: true },
      ],
    );
    await expect(ambasLigadas.guard.canActivate(makeCtx(ATOR))).resolves.toBe(true);
  });

  it('o token da porta é um símbolo — o contrato com o `@Inject` do Nest', () => {
    expect(typeof FEATURE_FLAG_REPOSITORY_PORT).toBe('symbol');
  });

  it('um `warn` que LANÇA não troca o 404 por 500', async () => {
    // O invariante está no JSDoc de `registrarBloqueio` e o código não o
    // implementava: o `warn` era chamado antes do `throw` sem proteção, então
    // stdout em pipe morto / disco cheio fazia o `NotFoundException` nunca
    // rodar — e o filtro global mapeava 500 e logava a stack.
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      throw new Error('EPIPE');
    });
    const { guard } = makeGuard(
      ['tenancy.invites'],
      [{ chave: 'tenancy.invites', ativada: false }],
    );

    await expect(guard.canActivate(makeCtx(ATOR))).rejects.toBeInstanceOf(NotFoundException);

    warn.mockRestore();
  });

  // ── pt-BR (#111): o rastro é CONSULTÁVEL ──────────────────────────────────
  //
  // A spec de `users.controller.spec.ts` afirma o rastro com
  // `JSON.stringify(warn.mock.calls)` + `toContain` — que casa campo E
  // substring. Uma implementação que voltasse a concatenar
  // `` `[${id}] … feature "${chave}" desligada` `` PASSARIA nela, porque o
  // nome da chave está no texto.
  //
  // Estes testes afirmam o **objeto**, não a string: é o que separa "campo
  // consultável" de "linha legível".
  describe('o rastro é estruturado, não texto', () => {
    function camposDoWarn(): Record<string, unknown> {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const req = { method: 'POST', url: '/api/v1/tenants/t1/invitations', id: 'req-1' };
      registrarBloqueio('tenancy.invites', req);
      const objeto = warn.mock.calls[0]?.[0];
      warn.mockRestore();
      // O Pino recebe objeto como 1º argumento; a assinatura do Nest é
      // `warn(message, ...optionalParams)`.
      return typeof objeto === 'object' && objeto !== null
        ? (objeto as Record<string, unknown>)
        : {};
    }

    it('`featureFlag`, `rota`, `metodo` e `traceId` são CAMPOS do objeto', () => {
      const campos = camposDoWarn();
      expect(campos.featureFlag).toBe('tenancy.invites');
      expect(campos.rota).toBe('/api/v1/tenants/t1/invitations');
      expect(campos.metodo).toBe('POST');
      expect(campos.traceId).toBe('req-1');
    });

    it('o primeiro argumento NÃO é string — é o objeto de campos', () => {
      // A mutação que este teste pega: voltar à concatenação. `expect.objectContaining`
      // passaria numa string que contém os valores; `typeof` não.
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      registrarBloqueio('tenancy.invites', { url: '/x' });
      expect(typeof warn.mock.calls[0]?.[0]).toBe('object');
      warn.mockRestore();
    });

    it('o ator vem de `req.user.sub`, e sem usuário é "anônimo"', () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      registrarBloqueio('tenancy.invites', { user: { sub: 'u-42' } });
      expect((warn.mock.calls[0]?.[0] as Record<string, unknown>).ator).toBe('u-42');

      warn.mockClear();
      registrarBloqueio('tenancy.invites', {});
      expect((warn.mock.calls[0]?.[0] as Record<string, unknown>).ator).toBe('anônimo');
      warn.mockRestore();
    });
  });
});
