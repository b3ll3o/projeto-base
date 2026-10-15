// apps/web/lib/login-schema.spec.ts
//
// Contrato de validação do formulário de LOGIN.
//
// pt-BR: o login tem uma regra que o cadastro não tem, e ela é a razão de
// este arquivo existir separado: aqui NÃO se valida se a conta existe, e
// nenhuma mensagem pode sugerir isso. O schema só olha FORMATO. Um
// formulário que dissesse "e-mail não encontrado" antes de chamar a API
// seria enumeração de contas, e enumeração de contas é o ataque que o 401
// genérico da API existe para impedir (ver contrato (D)).
//
// O teste "campo em branco reprova" e o "e-mail malformado reprova" são o
// que garante que o formulário não vaza nada: ambos são decididos pela
// FORMA, sem perguntar nada a ninguém.

import { describe, it, expect } from 'vitest';
import { loginSchema } from './login-schema';

describe('loginSchema — o que ele exige', () => {
  it('aceita um par email/senha bem formado', () => {
    const r = loginSchema.safeParse({ email: 'maria@empresa.com', senha: 'segredo123' });

    expect(r.success).toBe(true);
  });

  it('campo em branco reprova — e a mensagem diz o que fazer', () => {
    const r = loginSchema.safeParse({ email: '', senha: '' });

    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain('Informe o e-mail.');
    expect(r.error?.issues.map((i) => i.message)).toContain('Informe a senha.');
  });

  it('e-mail malformado reprova com exemplo, não com código de status', () => {
    const r = loginSchema.safeParse({ email: 'nao-e-email', senha: 'segredo123' });

    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain('nome@empresa.com');
  });

  it('o e-mail é aparado nas pontas antes de ser comparado', () => {
    // pt-BR: colar com espaço é comum em Celular. O cadastro já apara o
    // e-mail e o login precisa concordar — senão a mesma conta digitada com
    // um espaço a mais falha no login e funcionava no cadastro.
    const r = loginSchema.safeParse({ email: '  maria@empresa.com  ', senha: 'segredo123' });

    expect(r.success).toBe(true);
    expect(r.data?.email).toBe('maria@empresa.com');
  });

  it('a senha NÃO é aparada — espaço nas pontas é parte do segredo', () => {
    // pt-BR: o mesmo motivo do schema de cadastro. Aparar um segredo é
    // mutá-lo em silêncio: a pessoa digita "senha " e entra "senha".
    const r = loginSchema.safeParse({ email: 'maria@empresa.com', senha: '  seg  ' });

    expect(r.success).toBe(true);
    expect(r.data?.senha).toBe('  seg  ');
  });

  it('a senha NÃO tem mínimo de 8 aqui, apesar de o cadastro ter', () => {
    // pt-BR: essa é uma divergência DELIBERADA contra
    // `cadastro-usuario-schema.ts` (que exige SENHA_MIN = 8). O motivo é
    // que o login não repete regra de cadastro: quem está entrando já tem
    // conta, e a única pergunta útil do formulário de entrada é "o campo
    // está em branco?". Se a senha for curta, a resposta certa é "senha
    // incorreta", vinda da API — e a API responde 401 genérico justamente
    // para não dar essa informação a quem não tem a senha.
    const r = loginSchema.safeParse({ email: 'maria@empresa.com', senha: 'curta' });

    expect(r.success).toBe(true);
  });
});

describe('loginSchema — o teto de 72 caracteres é o mesmo do cadastro', () => {
  it('o teto vem do MESMO número, não de uma cópia', () => {
    // pt-BR: se os dois arquivos declarassem o número cada um, o número
    // envelheceria num lado só. Importar é o que impede a divergência.
    const limite = loginSchema.safeParse({ email: 'maria@empresa.com', senha: 'x'.repeat(73) });

    expect(limite.success).toBe(false);
    expect(limite.error?.issues[0]?.message).toContain('72');
  });
});
