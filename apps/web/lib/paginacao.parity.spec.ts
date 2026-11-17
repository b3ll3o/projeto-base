// apps/web/lib/paginacao.parity.spec.ts
//
// A PARIDADE do limite de página entre o web e a API.
//
// ⚠️ Este spec NÃO mede que os testes passam, nem que a tela está certa. Ele
// mede uma coisa só: o **número** que o web pede é o número que a API aceita.
//
// pt-BR (2026-11-17): o web tinha o seu próprio `TAMANHO_DA_PAGINA_HISTORICO = 100`
// — uma cópia do `LIMITE_MAXIMO` da API, sem dono. Se a API baixasse o limite
// para 50, o `?limit=100` do web viraria **400 `VALIDATION_ERROR`**, e a
// seção "Histórico" viraria um `Alerta` para **toda** pessoa — e **nenhum
// teste acusaria**: o web mocka o cliente (e o mock não valida o limite), e a
// API não conhece o número do web.
//
// O instrumento é o mesmo do `cadastro-usuario-schema.parity.spec.ts`: o
// número é lido do FONTE da API, e a comparação falha ALTO se a API mudar de
// forma (o erro diz o que aconteceu, em vez de um "expected 100, received 50"
// que não diz de onde veio o 50).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TAMANHO_DA_PAGINA_HISTORICO } from './tenancy.js';

const PORTA_REPO = fileURLToPath(
  new URL('../../api/src/modules/users/domain/ports/', import.meta.url),
);

/** Lê `export const <NOME> = <n>;` do fonte da porta da API. */
function limiteDaApi(nome: string): number {
  const fonte = readFileSync(`${PORTA_REPO}user-repository.port.ts`, 'utf8');
  const achado = new RegExp(`export const ${nome} = (\\d+);`).exec(fonte);
  if (!achado?.[1]) {
    throw new Error(
      `não achei "export const ${nome} = <n>;" em user-repository.port.ts — ` +
        'a API mudou de forma e a cópia do web precisa ser revisada junto',
    );
  }
  return Number(achado[1]);
}

describe('paridade web ↔ API (o limite de página)', () => {
  it('TAMANHO_DA_PAGINA_HISTORICO bate com o LIMITE_MAXIMO da API', () => {
    expect(TAMANHO_DA_PAGINA_HISTORICO).toBe(limiteDaApi('LIMITE_MAXIMO'));
  });
});
