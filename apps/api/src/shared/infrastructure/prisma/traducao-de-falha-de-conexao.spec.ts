import { describe, it, expect } from 'vitest';
import { traduzirFalhaDeConexao } from './traducao-de-falha-de-conexao.js';

// A senha aparece na URL do banco — e é o que a função NÃO pode imprimir.
// A senha nunca chega à função: ela não recebe o `DATABASE_URL`. O alvo vem
// da mensagem do próprio Prisma.
const SENHA = 'senha-super-secreta';

describe('traduzirFalhaDeConexao', () => {
  it('traduz o P1001 de um alvo local: causa, comando e ponteiro para o runbook', () => {
    const erro = {
      errorCode: 'P1001',
      message: "Can't reach database server at `localhost:5432`",
    };

    const mensagem = traduzirFalhaDeConexao(erro);

    expect(mensagem).toBeDefined();
    expect(mensagem).toContain('P1001');
    expect(mensagem).toContain('localhost:5432');
    expect(mensagem).toContain('projeto-base-pg-local');
    expect(mensagem).toContain('docker start projeto-base-pg-local');
    expect(mensagem).toContain('docs/como-rodar.md');
  });

  it('NUNCA imprime a credencial — e a função nem a recebe', () => {
    const erro = {
      errorCode: 'P1001',
      message: `Can't reach database server at \`app_runtime:${SENHA}@localhost:5432\``,
    };

    const mensagem = traduzirFalhaDeConexao(erro);

    // O alvo com `@` (a marca da credencial) é DESCARTADO — o filtro é o que
    // impede a senha de chegar ao log de boot.
    expect(mensagem).not.toContain(SENHA);
    expect(mensagem).not.toContain('app_runtime');
  });

  it('não traduz um erro sem errorCode — devolve undefined (o caller repassa intacto)', () => {
    expect(traduzirFalhaDeConexao(new Error('boom'))).toBeUndefined();
  });

  it('não traduz P1000 (credencial recusada) — o Prisma nomeia melhor do que nós', () => {
    expect(traduzirFalhaDeConexao({ errorCode: 'P1000', message: 'x' })).toBeUndefined();
  });

  it('alvo NÃO local: não recomenda o container local, que não existe no host', () => {
    const erro = {
      errorCode: 'P1001',
      message: "Can't reach database server at `postgres:5432`",
    };

    const mensagem = traduzirFalhaDeConexao(erro);

    expect(mensagem).toBeDefined();
    expect(mensagem).toContain('postgres:5432');
    expect(mensagem).not.toContain('docker start projeto-base-pg-local');
  });

  it('alvo sem porta (só o host): ainda reconhece o alvo local', () => {
    const erro = { errorCode: 'P1001', message: "Can't reach database server at `localhost`" };

    const mensagem = traduzirFalhaDeConexao(erro);

    expect(mensagem).toContain('localhost');
    expect(mensagem).toContain('docker start projeto-base-pg-local');
  });

  it('sem alvo na mensagem: a mensagem continua dizendo a causa e o que fazer', () => {
    const erro = { errorCode: 'P1001', message: "Can't reach database server" };

    const mensagem = traduzirFalhaDeConexao(erro);

    expect(mensagem).toBeDefined();
    expect(mensagem).toContain('P1001');
    expect(mensagem).toContain('docs/como-rodar.md');
    // Sem alvo, a mensagem NÃO afirma que o alvo é local — ela não sabe.
    expect(mensagem).not.toContain('docker start projeto-base-pg-local');
  });

  it('mensagem ausente: não quebra — devolve a mensagem neutra', () => {
    const mensagem = traduzirFalhaDeConexao({ errorCode: 'P1001' });

    expect(mensagem).toBeDefined();
    expect(mensagem).toContain('P1001');
  });
});
