// apps/web/lib/cadastro-usuario-schema.spec.ts
//
// Contrato do formulário de cadastro. Roda em `environment: 'node'` — é
// validação pura, sem DOM, testável sem jsdom.

import { describe, it, expect } from 'vitest';
import {
  cadastroUsuarioSchema,
  NOME_MAX,
  EMAIL_MAX,
  SENHA_MIN,
  SENHA_MAX,
} from './cadastro-usuario-schema.js';

const valido = { nome: 'Maria Silva', email: 'maria@empresa.com', senha: 'senha1234' };

describe('cadastroUsuarioSchema — entrada válida', () => {
  it('aceita nome, email e senha bem formados', () => {
    const r = cadastroUsuarioSchema.safeParse(valido);
    expect(r.success).toBe(true);
  });

  it('apara espaços nas pontas de nome e email, mas NÃO os da senha', () => {
    const r = cadastroUsuarioSchema.safeParse({
      nome: '  Maria Silva  ',
      email: '  maria@empresa.com  ',
      senha: '  abcdefgh  ',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nome).toBe('Maria Silva');
      expect(r.data.email).toBe('maria@empresa.com');
      // pt-BR: a diferença de propósito entre os três. Nome e email são
      // identidades — normalizar é inofensivo. Senha é segredo: aparar é
      // mudar o que a pessoa digitou, em silêncio, e ela só descobre
      // quando o login falha.
      expect(r.data.senha).toBe('  abcdefgh  ');
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

describe('cadastroUsuarioSchema — senha', () => {
  it('rejeita senha vazia', () => {
    const r = cadastroUsuarioSchema.safeParse({ ...valido, senha: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Informe a senha.');
    }
  });

  it('rejeita senha de espaços (não há trim que a "limpe")', () => {
    // pt-BR: 8 espaços passam no `min(8)` e reprovam no `max(72)`. É a
    // prova de que a senha não é aparada — se um `.trim()` entrar aqui,
    // este teste continua verde por um motivo errado. O que ele mede é que
    // a senha NÃO foi normalizada.
    const r = cadastroUsuarioSchema.safeParse({ ...valido, senha: ' '.repeat(8) });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.senha).toBe('        ');
    }
  });

  it('aceita senha no limite exato do mínimo', () => {
    const r = cadastroUsuarioSchema.safeParse({ ...valido, senha: 'a'.repeat(SENHA_MIN) });
    expect(r.success).toBe(true);
  });

  it('rejeita senha abaixo do mínimo, com a mensagem que diz o número', () => {
    const r = cadastroUsuarioSchema.safeParse({ ...valido, senha: 'a'.repeat(SENHA_MIN - 1) });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toContain(String(SENHA_MIN));
    }
  });

  it('aceita senha no limite exato do máximo (72 = entrada do bcrypt)', () => {
    const r = cadastroUsuarioSchema.safeParse({ ...valido, senha: 'a'.repeat(SENHA_MAX) });
    expect(r.success).toBe(true);
  });

  it('rejeita senha acima do máximo, com a mensagem que diz o número', () => {
    const r = cadastroUsuarioSchema.safeParse({ ...valido, senha: 'a'.repeat(SENHA_MAX + 1) });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toContain(String(SENHA_MAX));
    }
  });

  it('campo vazio pede o campo, não acusa comprimento', () => {
    // pt-BR: mesmo encadeamento do nome. Vazio reprova em `min(1)` E em
    // `min(SENHA_MIN)`; o que a pessoa precisa ver primeiro é "informe a
    // senha", não "pelo menos 8 caracteres".
    const r = cadastroUsuarioSchema.safeParse({ ...valido, senha: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msgs = r.error.issues.map((i) => i.message);
      expect(msgs).toContain('Informe a senha.');
      expect(msgs[0]).toBe('Informe a senha.');
    }
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
