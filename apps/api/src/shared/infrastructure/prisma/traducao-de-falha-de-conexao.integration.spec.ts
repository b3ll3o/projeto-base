// apps/api/src/shared/infrastructure/prisma/traducao-de-falha-de-conexao.integration.spec.ts
//
// O P1001 DE VERDADE.
//
// POR QUE ESTA SPEC EXISTE (achado M1 da 2ª revisão do #144)
//
// A spec UNITÁRIA desta tradução fabrica o erro do Prisma: ela inventa a
// frase "Can't reach database server at `localhost:5432`". O acoplamento ao
// formato REAL da mensagem fica, então, **não preso**: se um upgrade do
// Prisma mudar a frase, a tradução degrada em silêncio para a mensagem neutra
// — e a spec unitária continua VERDE, porque mede o erro que ela mesma
// inventou. É a classe que o repo já nomeou: *verde que não mediu nada*.
//
// Aqui o erro é REAL: um `PrismaClient` de verdade, apontado para uma porta
// que ninguém escuta. O motor do Prisma produz o P1001 de verdade, e a spec
// afirma que a tradução ainda nomeia o alvo. Se o Prisma mudar a frase, esta
// spec fica VERMELHA.
//
// ⚠️ POR QUE INTEGRAÇÃO E NÃO UNITÁRIA
//
// O `PrismaClient` importado aqui é o CLIENT GERADO (`prisma generate`), que
// não existe num clone novo — e a suíte unitária tem de ser verde sem ele.
// O projeto `integration` roda no CI DEPOIS do `db:generate`
// (`.github/workflows/ci.yml`), e esta spec **não precisa de banco**: só de
// uma porta que ninguém escuta. MEDIDO em 2026-11-05: o `$connect()` contra
// a porta fechada falha em ~125 ms — o engine não espera, a conexão é
// recusada na hora.
//
// ⚠️ A PORTA é MEDIDA, não cravada: uma porta fixa (59999) pode estar
// ocupada na máquina de quem roda a spec, e aí o teste mediria outra coisa.

import { describe, it, expect, beforeAll } from 'vitest';
import { createServer } from 'node:net';
import { inspect } from 'node:util';
import { traduzirFalhaDeConexao } from './traducao-de-falha-de-conexao.js';

/** A senha aparece na URL do banco — e é o que a tradução NÃO pode imprimir. */
const SENHA = 'senha-super-secreta';

/**
 * Uma porta que ninguém está escutando.
 *
 * A porta é medida (bind em `0` → o SO escolhe uma livre) e o servidor é
 * **fechado** antes do `connect` — então a conexão é recusada.
 */
function portaFechada(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const servidor = createServer();
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const endereco = servidor.address();
      if (endereco === null || typeof endereco === 'string') {
        servidor.close();
        reject(new Error('portaFechada(): endereço sem porta'));
        return;
      }
      servidor.close(() => resolve(endereco.port));
    });
  });
}

describe('traduzirFalhaDeConexao — o P1001 REAL', () => {
  let erro: unknown;
  let porta: number;

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    porta = await portaFechada();
    const cliente = new PrismaClient({
      datasourceUrl: `postgresql://app_runtime:${SENHA}@127.0.0.1:${porta}/app`,
    });
    try {
      await cliente.$connect();
    } catch (e) {
      erro = e;
    } finally {
      await cliente.$disconnect().catch(() => {});
    }
  });

  it('o erro é o P1001 de verdade — a spec NÃO fabrica a mensagem', () => {
    expect(erro).toBeDefined();
    expect((erro as { errorCode?: unknown }).errorCode).toBe('P1001');
    // A forma REAL, medida: o engine nomeia o alvo entre crases.
    expect((erro as { message: string }).message).toMatch(/at `[^`]+`/);
  });

  it('a tradução nomeia o alvo — se o Prisma mudar a frase, esta spec fica VERMELHA', () => {
    const mensagem = traduzirFalhaDeConexao(erro);

    expect(mensagem).toBeDefined();
    expect(mensagem).toContain(`127.0.0.1:${porta}`);
    expect(mensagem).toContain('projeto-base-pg-local');
    expect(mensagem).toContain('docker start projeto-base-pg-local');
    expect(mensagem).toContain('docs/como-rodar.md');
  });

  it('a senha NÃO vaza — nem na mensagem traduzida, nem no erro que o log imprime', () => {
    const mensagem = traduzirFalhaDeConexao(erro);

    expect(mensagem).not.toContain(SENHA);
    // ⚠️ O `util.inspect` é o canal que imprime: o `main.ts` faz
    // `console.error('Bootstrap falhou:', err)`, e o `cause` (o erro do Prisma)
    // entra na cadeia impressa.
    expect(inspect(erro)).not.toContain(SENHA);
  });
});
