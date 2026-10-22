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
import { apiPrecisaSubir } from './api';

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
