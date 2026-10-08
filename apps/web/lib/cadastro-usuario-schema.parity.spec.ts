// apps/web/lib/cadastro-usuario-schema.parity.spec.ts
//
// PARIDADE entre a cópia deliberada do frontend e a regra de domínio.
//
// `cadastro-usuario-schema.ts` é cópia, por decisão de arquitetura: o
// frontend não arrasta dependência de código de servidor. Cópia sem
// guardião é transcrição que envelhece sozinha — e MEDIDO, envelheceu:
// o arquivo declarava `NOME_MAX = 120` e `EMAIL_MAX = 255` enquanto a
// regra de domínio aceita 2..100 e até 254. Um nome de 105 chars passava
// o formulário e a API devolvia 500.
//
// Por que LER O ARQUIVO em vez de importar: importar o VO da API dentro
// de um spec do web cria uma dependência entre apps no typecheck, que é
// exatamente o que a decisão de não-importar evita. Ler o arquivo-fonte
// mede o LITERAL — que é a coisa que diverge quando alguém digita um
// número novo — e falha alto (ENOENT) se o VO for movido ou renomeado.
//
// ⚠️ Este spec NÃO mede que os testes passam, nem que a UI está certa. Ele
// mede uma coisa só: os três números batem.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NOME_MIN, NOME_MAX, EMAIL_MAX } from './cadastro-usuario-schema.js';

const VO_DIR = fileURLToPath(
  new URL('../../api/src/modules/users/domain/value-objects/', import.meta.url),
);

/** Lê `export const NOME = <n>;` do fonte de um VO. */
function limiteDoVo(arquivo: string, constante: string): number {
  const fonte = readFileSync(`${VO_DIR}${arquivo}`, 'utf8');
  const achado = new RegExp(`export const ${constante} = (\\d+);`).exec(fonte);
  if (!achado?.[1]) {
    throw new Error(
      `não achei "export const ${constante} = <n>;" em ${arquivo} — ` +
        `o VO mudou de forma e a cópia do web precisa ser revisada junto`,
    );
  }
  return Number(achado[1]);
}

describe('paridade web ↔ domínio (a cópia é guardada, não é confiança)', () => {
  it('NOME_MIN bate com UserName.MIN_LENGTH', () => {
    expect(NOME_MIN).toBe(limiteDoVo('user-name.vo.ts', 'MIN_LENGTH'));
  });

  it('NOME_MAX bate com UserName.MAX_LENGTH', () => {
    // MEDIDO 2026-10-08: aqui era 120 contra 100. Com o schema do
    // formulário aceitando 105 chars, o formulário liberava e a API
    // respondia 500.
    expect(NOME_MAX).toBe(limiteDoVo('user-name.vo.ts', 'MAX_LENGTH'));
  });

  it('EMAIL_MAX bate com Email.MAX_LENGTH', () => {
    // Era 255 contra 254 — um octeto, e era o suficiente para o email
    // de 255 chars virar 500.
    expect(EMAIL_MAX).toBe(limiteDoVo('email.vo.ts', 'MAX_LENGTH'));
  });
});
