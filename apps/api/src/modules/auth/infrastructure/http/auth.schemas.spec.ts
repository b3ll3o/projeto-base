// apps/api/src/modules/auth/infrastructure/http/auth.schemas.spec.ts
//
// O LoginSchema NÃO revalida a política de senha. Este spec existe para
// fixar essa decisão em código, porque ela é contra-intuitiva e a próxima
// pessoa a mexer no arquivo vai tentar "consertar":
//
//   No CADASTRO, senha curta → 400, com campo corrigível.
//   No LOGIN,    senha curta → a senha PODE estar errada; rejeitar no
//                boundary daria "senha curta" para alguém cujo e-mail
//                também não existe, e o status 400 passaria a distinguir
//                os dois casos. A política vale onde o usuário pode
//                corrigir — o cadastro.

import { describe, it, expect } from 'vitest';
import { LoginSchema, RefreshSchema } from './auth.schemas.js';
import {
  MAX_LENGTH as SENHA_MAX,
  MIN_LENGTH as SENHA_MIN,
} from '../../../users/domain/value-objects/password-hash.vo.js';
import { MAX_LENGTH as EMAIL_MAX } from '../../../users/domain/value-objects/email.vo.js';

describe('LoginSchema', () => {
  it('aceita e-mail válido + senha de 1 caractere', () => {
    const r = LoginSchema.safeParse({ email: 'joao@example.com', senha: 'a' });
    expect(r.success).toBe(true);
  });

  it('NÃO aplica o mínimo de senha do VO (senha de 3 chars passa)', () => {
    const curta = 'a'.repeat(SENHA_MIN - 1);
    expect(curta.length).toBeGreaterThanOrEqual(1);
    expect(LoginSchema.safeParse({ email: 'joao@example.com', senha: curta }).success).toBe(true);
  });

  it('NÃO aplica o mínimo de senha, mas rejeita string vazia', () => {
    // pt-BR: `min(1)` é o piso de "tem algo para verificar", não a
    // política. Sem ele, um `senha: ''` passaria o boundary e viraria
    // argon2 sobre string vazia — 48 ms de CPU por tentativa, de graça.
    expect(LoginSchema.safeParse({ email: 'joao@example.com', senha: '' }).success).toBe(false);
  });

  it('rejeita e-mail inválido (400 no boundary, antes do use case)', () => {
    expect(LoginSchema.safeParse({ email: 'nao-e-email', senha: 'qualquer' }).success).toBe(false);
  });

  it('rejeita e-mail acima do teto do VO', () => {
    const longo = `${'a'.repeat(EMAIL_MAX)}@example.com`;
    expect(LoginSchema.safeParse({ email: longo, senha: 'x' }).success).toBe(false);
  });

  it('o teto de senha vem do VO, não de um literal aqui', () => {
    // pt-BR: 72 é o limite de ENTRADA (convenção NIST/indústria), não o
    // teto de 72 bytes do bcrypt. Um `.max(72)` literal aqui seria uma
    // transcrição que envelhece sozinha — o mesmo defeito que o
    // `CreateUserSchema` teve com `.max(120)` contra o VO.
    const limiteDoSchema = (LoginSchema.shape.senha as { maxLength?: number }).maxLength;
    expect(limiteDoSchema).toBe(SENHA_MAX);
  });

  it('campos desconhecidos são aceitos (o VO, não o schema, é a autoridade)', () => {
    const r = LoginSchema.safeParse({ email: 'joao@example.com', senha: 'x', remember: true });
    expect(r.success).toBe(true);
  });
});

describe('RefreshSchema', () => {
  it('aceita um refreshToken não-vazio', () => {
    expect(RefreshSchema.safeParse({ refreshToken: 'eyJhbGciOi...' }).success).toBe(true);
  });

  it('rejeita refreshToken vazio ou ausente', () => {
    expect(RefreshSchema.safeParse({ refreshToken: '' }).success).toBe(false);
    expect(RefreshSchema.safeParse({}).success).toBe(false);
  });
});
