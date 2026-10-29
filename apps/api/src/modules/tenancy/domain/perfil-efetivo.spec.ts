// apps/api/src/modules/tenancy/domain/perfil-efetivo.spec.ts
//
// pt-BR (visão de admin, 2026-10-29 — revisão do PR #127): a regra do "perfil
// efetivo" tem UM dono, e este spec é o que segura a REGUA.
//
// ⚠️ A REGRA TINHA TRÊS CASAS (`findProfileId`,
// `perfilEfetivoPorUsuario` e a visão de admin), e nenhuma via o mesmo dono.
// Este arquivo fixa o critério uma vez — e é ele que as três importam.
//
// ⚠️ O caso que mais importa é o ÚLTIMO: o perfil de OUTRA empresa. Ele
// resolve `null` — e mostrar o slug dele diria que a pessoa veste um perfil
// que a API NÃO resolve para aquela empresa. O defeito é invisível: todo o
// resto da tela funciona.

import { describe, expect, it } from 'vitest';
import { temPerfilEfetivo } from './perfil-efetivo.js';

const ACME = '0190a8b6-0000-4000-8000-0000000000ac';
const GLOBEX = '0190a8b6-0000-4000-8000-0000000000b1';

describe('temPerfilEfetivo', () => {
  it('membership sem perfil NÃO tem perfil efetivo', () => {
    expect(temPerfilEfetivo(null, ACME)).toBe(false);
    expect(temPerfilEfetivo(null, null)).toBe(false);
  });

  it('no bucket da EMPRESA, o perfil GLOBAL vale — ele serve a qualquer empresa (D3)', () => {
    expect(temPerfilEfetivo({ tenantId: null }, ACME)).toBe(true);
  });

  it('no bucket da EMPRESA, o perfil DAQUELA empresa vale', () => {
    expect(temPerfilEfetivo({ tenantId: ACME }, ACME)).toBe(true);
  });

  it('no bucket da EMPRESA, o perfil de OUTRA empresa NÃO vale', () => {
    expect(temPerfilEfetivo({ tenantId: GLOBEX }, ACME)).toBe(false);
  });

  it('no bucket GLOBAL (o de sistema), só o perfil global vale', () => {
    expect(temPerfilEfetivo({ tenantId: null }, null)).toBe(true);
    // O perfil de uma EMPRESA não é alcançável no bucket de sistema — e é o
    // mesmo filtro que o `findProfileId` faz no ramo global.
    expect(temPerfilEfetivo({ tenantId: ACME }, null)).toBe(false);
  });
});
