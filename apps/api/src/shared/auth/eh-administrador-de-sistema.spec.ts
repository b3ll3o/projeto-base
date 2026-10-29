// apps/api/src/shared/auth/eh-administrador-de-sistema.spec.ts
//
// pt-BR (feature-flags, 2026-10-18 — decisão D11 do plano): a regra saiu de
// `profiles.use-cases.ts`, onde era função de arquivo (não exportada) porque
// as duas classes do arquivo a usavam. O módulo de feature flags precisa da
// MESMA regra — e "administrador do sistema" não pode ter duas escritas.
//
// A tabela abaixo é a regra inteira. O caso que mais importa é o terceiro:
// admin DE EMPRESA (`tenantId` presente) NÃO é administrador do sistema, mesmo
// com `isAdmin` true. O bucket de sistema tem membros não-admin, e admin de
// empresa tem `isAdmin` — a interseção dos dois é o que separa uma coisa da
// outra.

import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  atorDe,
  ehAdministradorDeSistema,
  exigeAdministradorDeSistema,
  type AtorAutenticado,
} from './eh-administrador-de-sistema.js';

const ator = (tenantId: string | null, isAdmin: boolean): AtorAutenticado => ({
  userId: '0190f2c1-0000-7000-8000-000000000001',
  tenantId,
  isAdmin,
});

describe('ehAdministradorDeSistema', () => {
  it('é verdadeiro só no bucket de sistema com isAdmin', () => {
    expect(ehAdministradorDeSistema(ator(null, true))).toBe(true);
  });

  it('é falso para quem não é admin, mesmo no bucket de sistema', () => {
    expect(ehAdministradorDeSistema(ator(null, false))).toBe(false);
  });

  it('é falso para admin de empresa, mesmo com isAdmin true', () => {
    const daEmpresa = '0190f2c1-0000-7000-8000-0000000000a1';
    expect(ehAdministradorDeSistema(ator(daEmpresa, true))).toBe(false);
    expect(ehAdministradorDeSistema(ator(daEmpresa, false))).toBe(false);
  });
});

describe('atorDe', () => {
  it('mapeia o `req.user` publicado pelo JwtAuthGuard', () => {
    expect(
      atorDe({
        user: { sub: '0190f2c1-0000-7000-8000-000000000001', tenantId: null, isAdmin: true },
      }),
    ).toEqual({
      userId: '0190f2c1-0000-7000-8000-000000000001',
      tenantId: null,
      isAdmin: true,
    });
  });

  it('o `isAdmin` AUSENTE vira `false` — fail-closed, nunca `undefined`', () => {
    // `undefined` é falsy num `if` e VERDADEIRO num `!== false` — e o
    //esquecimento só apareceria num ator sem `isAdmin` no token.
    const mapeado = atorDe({ user: { sub: 'x' } });

    expect(mapeado.isAdmin).toBe(false);
    expect(mapeado.isAdmin).not.toBeUndefined();
  });

  it('o `tenantId` AUSENTE vira `null` — o bucket GLOBAL', () => {
    expect(atorDe({ user: { sub: 'x' } }).tenantId).toBeNull();
  });
});

describe('exigeAdministradorDeSistema', () => {
  it('deixa passar o administrador do sistema', () => {
    expect(() => exigeAdministradorDeSistema(ator(null, true), 'negado')).not.toThrow();
  });

  it('recusa o admin de EMPRESA com 403 — e o `detail` é o que separa os dois 403', () => {
    const daEmpresa = '0190f2c1-0000-7000-8000-0000000000a1';

    expect(() => exigeAdministradorDeSistema(ator(daEmpresa, true), 'negado')).toThrow(
      ForbiddenException,
    );
    try {
      exigeAdministradorDeSistema(ator(daEmpresa, true), 'só o administrador do sistema');
    } catch (erro) {
      expect((erro as ForbiddenException).getResponse()).toMatchObject({
        code: 'FORBIDDEN',
        detail: 'só o administrador do sistema',
      });
    }
  });
});
