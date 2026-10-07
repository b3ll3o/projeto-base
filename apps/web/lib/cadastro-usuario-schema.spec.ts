// apps/web/lib/cadastro-usuario-schema.spec.ts
//
// Contrato do formulário de cadastro. Roda em `environment: 'node'` — é
// validação pura, sem DOM, testável sem jsdom.

import { describe, it, expect } from 'vitest';
import { cadastroUsuarioSchema, NOME_MAX, EMAIL_MAX } from './cadastro-usuario-schema.js';

const valido = { nome: 'Maria Silva', email: 'maria@empresa.com' };

describe('cadastroUsuarioSchema — entrada válida', () => {
  it('aceita nome e email bem formados', () => {
    const r = cadastroUsuarioSchema.safeParse(valido);
    expect(r.success).toBe(true);
  });

  it('apara espaços nas pontas antes de validar', () => {
    const r = cadastroUsuarioSchema.safeParse({
      nome: '  Maria Silva  ',
      email: '  maria@empresa.com  ',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nome).toBe('Maria Silva');
      expect(r.data.email).toBe('maria@empresa.com');
    }
  });
});

describe('cadastroUsuarioSchema — nome', () => {
  it('rejeita nome vazio', () => {
    const r = cadastroUsuarioSchema.safeParse({ ...valido, nome: '' });
    expect(r.success).toBe(false);
  });

  it('rejeita nome com só espaços (o backend aceitaria)', () => {
    const r = cadastroUsuarioSchema.safeParse({ ...valido, nome: '    ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Informe o nome do usuário.');
    }
  });

  it('aceita nome no limite exato', () => {
    const r = cadastroUsuarioSchema.safeParse({
      ...valido,
      nome: 'a'.repeat(NOME_MAX),
    });
    expect(r.success).toBe(true);
  });

  it('rejeita nome acima do limite', () => {
    const r = cadastroUsuarioSchema.safeParse({
      ...valido,
      nome: 'a'.repeat(NOME_MAX + 1),
    });
    expect(r.success).toBe(false);
  });
});

describe('cadastroUsuarioSchema — email', () => {
  it.each([
    ['sem @', 'maria.empresa.com'],
    ['sem domínio', 'maria@'],
    ['sem local', '@empresa.com'],
    ['com espaço', 'maria silva@empresa.com'],
  ])('rejeita email inválido: %s', (_caso, email) => {
    const r = cadastroUsuarioSchema.safeParse({ ...valido, email });
    expect(r.success).toBe(false);
  });

  it('a mensagem de email diz o que fazer (traz exemplo)', () => {
    const r = cadastroUsuarioSchema.safeParse({ ...valido, email: 'nao-e-email' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(' ');
      expect(msg).toContain('Exemplo: nome@empresa.com');
    }
  });

  it('rejeita email acima do limite', () => {
    const local = 'a'.repeat(EMAIL_MAX);
    const r = cadastroUsuarioSchema.safeParse({
      ...valido,
      email: `${local}@empresa.com`,
    });
    expect(r.success).toBe(false);
  });
});

describe('cadastroUsuarioSchema — campos desconhecidos', () => {
  it('ignora campo extra (o form manda mais campos que o contrato)', () => {
    const r = cadastroUsuarioSchema.safeParse({ ...valido, isAdmin: true });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty('isAdmin');
    }
  });
});
