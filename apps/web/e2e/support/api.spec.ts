// apps/web/e2e/support/api.spec.ts
//
// pt-BR (2026-10-22): a decisão de levantar a API.
//
// A suíte se levanta sozinha quando a API morre no meio (o F1 e o F5 a
// derrubam de propósito; um worker morto ou um abort do run a deixam fora) —
// e sem isso os specs seguintes falham TODOS com `ECONNREFUSED`, um erro que
// não é do teste deles.
//
// ⚠️ O que está sob teste é a DECISÃO, e não o boot: um teste que subisse a
// API de verdade mediria o bootstrap do Nest (45 s, banco, migrations), e a
// decisão — que é o que tem dente — passaria verde com o PID errado.

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { ambienteDaApi, apiPrecisaSubir } from './api';

describe('apiPrecisaSubir — a API precisa subir?', () => {
  it('sem PID: PRECISA — a API nunca subiu, ou foi derrubada de propósito', () => {
    expect(apiPrecisaSubir(null)).toBe(true);
  });

  it('com o processo VIVO: NÃO precisa — é o caso normal, e o caminho que não pode virar restart', () => {
    // O próprio processo do teste: ele está vivo, e o PID é dele.
    expect(apiPrecisaSubir(process.pid)).toBe(false);
  });

  it('com o processo MORRIDO: PRECISA — o PID é válido e o `estado.json` não foi reescrito', async () => {
    // Um processo que já morreu: o número do PID existe, o processo não.
    const morto = spawn(process.execPath, ['-e', 'process.exit(0)']);
    const pid = morto.pid;
    expect(pid).toBeTypeOf('number');

    await new Promise<void>((resolve) => {
      morto.on('exit', () => {
        expect(apiPrecisaSubir(pid ?? null)).toBe(true);
        resolve();
      });
    });
  });
});

describe('ambienteDaApi — o ambiente com que a API do harness sobe', () => {
  const ambiente = ambienteDaApi({
    porta: 3000,
    databaseUrl: 'postgresql://app_runtime:x@127.0.0.1:5432/projeto_base',
    jwtSecret: 'segredo-de-teste',
  });

  it('levanta o rate limit MUITO acima do default — a suíte inteira é um IP só', () => {
    // pt-BR: o limitador global da API é POR IP (`ThrottlerModule.forRoot`,
    // 100 req/min por padrão) e a suíte e2e inteira sai de 127.0.0.1 — todas as
    // requisições caem no MESMO balde. MEDIDO 2026-10-27: na execução que
    // derrubou o `f4-cadastro-email-duplicado`, o log da API tinha 8 respostas
    // 429 no `/me/profile`, e o spec falhou por um motivo que não era dele.
    //
    // A afirmação é sobre o NÚMERO, e não sobre a presença da variável: um
    // `THROTTLE_LIMIT` igual ao default (100) seria "presente" e ainda assim
    // deixaria a suíte no mesmo balde. O default está escrito aqui de propósito
    // — é o que a API usa quando a variável não vem.
    expect(Number(ambiente.THROTTLE_LIMIT)).toBeGreaterThan(100);
  });

  it('o segredo, a porta e o banco continuam no ambiente — a proteção não pode custar o boot', () => {
    expect(ambiente.PORT).toBe('3000');
    expect(ambiente.DATABASE_URL).toContain('127.0.0.1:5432');
    expect(ambiente.JWT_SECRET).toBe('segredo-de-teste');
  });
});
