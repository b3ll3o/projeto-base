import { describe, it, expect } from 'vitest';
import { traduzirFalhaDeConexao } from './traducao-de-falha-de-conexao.js';

// A senha aparece na URL do banco — e é o que a função NÃO pode imprimir.
// A senha nunca chega à função: ela não recebe o `DATABASE_URL`. O alvo vem
// da mensagem do próprio Prisma.
const SENHA = 'senha-super-secreta';

/**
 * A mensagem REAL do P1001 — MEDIDA em 2026-11-05 no Prisma 6.19.3, contra um
 * `PrismaClient` de verdade apontado para uma porta fechada.
 *
 * ⚠️ A forma é medida, mas quem a **prende** é a spec de INTEGRAÇÃO
 * (`traducao-de-falha-de-conexao.integration.spec.ts`): ela produz o erro
 * real e falha se o Prisma mudar a frase. Esta unitária fixa o COMPORTAMENTO
 * sobre a forma real — e é por isso que ela não pode inventar uma forma
 * diferente da real (a invenção é o que a deixava cega).
 */
const MENSAGEM_DO_P1001 = (alvo: string): string =>
  `Can't reach database server at \`${alvo}\`\n\n` +
  `Please make sure your database server is running at \`${alvo}\`.`;

describe('traduzirFalhaDeConexao', () => {
  it('traduz o P1001 de um alvo local: causa, comando e ponteiro para o runbook', () => {
    const erro = {
      errorCode: 'P1001',
      message: MENSAGEM_DO_P1001('localhost:5432'),
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
      message: MENSAGEM_DO_P1001(`app_runtime:${SENHA}@localhost:5432`),
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
      message: MENSAGEM_DO_P1001('postgres:5432'),
    };

    const mensagem = traduzirFalhaDeConexao(erro);

    expect(mensagem).toBeDefined();
    expect(mensagem).toContain('postgres:5432');
    expect(mensagem).not.toContain('docker start projeto-base-pg-local');
  });

  it('alvo sem porta (só o host): ainda reconhece o alvo local', () => {
    const erro = { errorCode: 'P1001', message: MENSAGEM_DO_P1001('localhost') };

    const mensagem = traduzirFalhaDeConexao(erro);

    expect(mensagem).toContain('localhost');
    expect(mensagem).toContain('docker start projeto-base-pg-local');
  });

  // ⚠️ A CONTRAPARTIDA (achado M1): fora do formato que o Prisma usa, o
  // veredito é o NEUTRO — ele diz a causa e o remédio, e NÃO afirma o que
  // não sabe. Uma degradação silenciosa para um texto "meio traduzido" seria
  // pior que a degradação para o neutro: o neutro diz que não sabe.
  it('fora do formato esperado: o veredito é o NEUTRO — diz a causa e o remédio, e não afirma o que não sabe', () => {
    const erro = { errorCode: 'P1001', message: 'formato que o Prisma não usa' };

    const mensagem = traduzirFalhaDeConexao(erro);

    expect(mensagem).toBeDefined();
    expect(mensagem).toContain('P1001');
    // A causa e o remédio:
    expect(mensagem).toContain('pnpm ambiente:check');
    expect(mensagem).toContain('docs/como-rodar.md');
    // ⚠️ E o que NÃO pode afirmar: que o alvo é local (não sabe), nem mandar
    // `docker start` de um container que talvez nem seja o banco.
    expect(mensagem).not.toContain('docker start');
    expect(mensagem).not.toContain('O banco local não está no ar');
    expect(mensagem).not.toContain('não conseguiu alcançar');
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
