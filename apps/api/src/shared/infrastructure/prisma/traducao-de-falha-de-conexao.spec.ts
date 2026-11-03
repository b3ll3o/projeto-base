import { describe, it, expect } from 'vitest';
import { traduzirFalhaDeConexao } from './traducao-de-falha-de-conexao.js';

// A URL tem credencial: a senha é `senha-super-secreta`. NENHUMA mensagem
// pode carregá-la — o erro de boot é logado, e log é onde senha vaza.
const SENHA = 'senha-super-secreta';
const URL_LOCAL = `postgresql://app_runtime:${SENHA}@localhost:5432/projeto_base?schema=public`;

describe('traduzirFalhaDeConexao', () => {
  it('traduz o P1001 de um alvo local: causa, comando e ponteiro para o runbook', () => {
    const erro = { errorCode: 'P1001', message: "Can't reach database server at `localhost:5432`" };

    const mensagem = traduzirFalhaDeConexao(erro, URL_LOCAL);

    expect(mensagem).toBeDefined();
    expect(mensagem).toContain('P1001');
    expect(mensagem).toContain('localhost:5432');
    expect(mensagem).toContain('projeto-base-pg-local');
    expect(mensagem).toContain('docker start projeto-base-pg-local');
    expect(mensagem).toContain('docs/como-rodar.md');
  });

  it('NUNCA inclui a senha da URL na mensagem', () => {
    const erro = { errorCode: 'P1001', message: 'boom' };

    const mensagem = traduzirFalhaDeConexao(erro, URL_LOCAL);

    expect(mensagem).not.toContain(SENHA);
    expect(mensagem).not.toContain('app_runtime');
  });

  it('não traduz um erro sem errorCode — devolve undefined (o caller repassa intacto)', () => {
    expect(traduzirFalhaDeConexao(new Error('boom'), URL_LOCAL)).toBeUndefined();
  });

  it('não traduz P1000 (credencial recusada) — o Prisma nomeia melhor do que nós', () => {
    expect(traduzirFalhaDeConexao({ errorCode: 'P1000', message: 'x' }, URL_LOCAL)).toBeUndefined();
  });

  it('alvo NÃO local: não recomenda o container local, que não existe no host', () => {
    const erro = { errorCode: 'P1001', message: 'boom' };
    const urlCompose = `postgresql://app_runtime:${SENHA}@postgres:5432/projeto_base?schema=public`;

    const mensagem = traduzirFalhaDeConexao(erro, urlCompose);

    expect(mensagem).toBeDefined();
    expect(mensagem).toContain('postgres:5432');
    expect(mensagem).not.toContain('docker start projeto-base-pg-local');
  });

  it('sem URL: traduz o P1001 mesmo assim, sem inventar alvo', () => {
    const mensagem = traduzirFalhaDeConexao({ errorCode: 'P1001', message: 'boom' }, undefined);

    expect(mensagem).toBeDefined();
    expect(mensagem).toContain('P1001');
  });
});
