// apps/web/lib/convite-schema.spec.ts
//
// Contrato do token de convite.
//
// pt-BR (onboarding de empresa, 2026-10-21): o token é 32 bytes em hex —
// 64 caracteres de `0-9a-f`. A cópia web existe para RECUSAR na entrada o que
// a API recusaria com 400, e para o cadastro não mandar um token
// manifestamente inválido para o banco.
//
// Este spec tem DUAS partes, e as duas importam:
//
//  1. O COMPORTAMENTO do validador.
//  2. A PARIDADE dos literais com a API, lendo o fonte dos DOIS controllers
//     que recebem token (`POST /users` com `destino.tipo='convite'` e
//     `POST /invitations/accept`). Cópia sem guardião envelhece sozinha — e
//     o `slug` da empresa já divergeu uma vez (MEDIDO 2026-10-08:
//     `NOME_MAX = 120` contra 100 do domínio).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONVITE_TOKEN_REGEX, ehTokenDeConvite } from './convite-schema';

/** 32 bytes em hex — o que `randomBytes(32)` produz. */
const TOKEN_VALIDO = 'a'.repeat(64);

const SCHEMA_DA_API = fileURLToPath(
  new URL('../../api/src/modules/users/infrastructure/http/users.schemas.ts', import.meta.url),
);

const CONTROLLER_DA_API = fileURLToPath(
  new URL(
    '../../api/src/modules/tenancy/infrastructure/http/tenancy-invitations.controller.ts',
    import.meta.url,
  ),
);

describe('ehTokenDeConvite', () => {
  it('aceita um token de 64 caracteres hexadecimais', () => {
    expect(ehTokenDeConvite(TOKEN_VALIDO)).toBe(true);
  });

  it('recusa o token vazio', () => {
    expect(ehTokenDeConvite('')).toBe(false);
  });

  it('recusa o token curto demais — 63 caracteres', () => {
    expect(ehTokenDeConvite('a'.repeat(63))).toBe(false);
  });

  it('recusa o token longo demais — 65 caracteres', () => {
    expect(ehTokenDeConvite('a'.repeat(65))).toBe(false);
  });

  it('recusa maiúscula, espaço e caractere fora do hex', () => {
    expect(ehTokenDeConvite('A'.repeat(64))).toBe(false);
    expect(ehTokenDeConvite(`${'a'.repeat(63)} `)).toBe(false);
    expect(ehTokenDeConvite('z'.repeat(64))).toBe(false);
  });
});

describe('paridade web ↔ API (a cópia é guardada, não é confiança)', () => {
  it('a expressão do token é a mesma da que o cadastro da API aceita', () => {
    const fonte = readFileSync(SCHEMA_DA_API, 'utf8');
    expect(fonte).toContain(CONVITE_TOKEN_REGEX.source);
    expect(fonte).toContain('.length(64)');
  });

  it('a expressão do token é a mesma da que o aceite da API aceita', () => {
    const fonte = readFileSync(CONTROLLER_DA_API, 'utf8');
    expect(fonte).toContain(CONVITE_TOKEN_REGEX.source);
    expect(fonte).toContain('.length(64)');
  });
});
