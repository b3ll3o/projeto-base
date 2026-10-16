// apps/web/cliente-prisma-unico.spec.ts
//
// GUARD: o suporte do e2e tem UM `PrismaClient`, e nada amarra isso.
//
// pt-BR: o F5 (`e2e/support/banco.ts`) faz `docker stop` no Postgres de
// propósito, para medir "banco fora do ar". O `docker stop` fecha o lado do
// servidor de TODAS as conexões abertas — e o `/health` voltando a 200 prova
// que o Postgres restarted, NÃO que as conexões que o pool do Prisma já tinha
// voltaram: elas morreram com o container. A única cura é o `$disconnect()` do
// `catch` de `limparBase()`, que reconecta e repete.
//
// MEDIDO 2026-10-16 (CI run 38978299713, `quality` vermelho): `rbac.ts` tinha um
// SEGUNDO `PrismaClient`, que ninguém curava. `semearPerfil()` recebia
// `Server has closed the connection` e derrubava o `f9-admin-profiles` inteiro —
// passando isolado e falhando na suíte completa, porque o Playwright REUSA o
// processo do worker entre arquivos e a conexão morta do F5 sobrevivia dentro
// do processo em que o F9 roda.
//
// A forma dessa falha é o que a torna cara: verde isolado, vermelho na suíte,
// sem nenhum erro que seja do spec que caiu. Igual ao `workers: 1` sem amarra
// que este guard vizinho amarra — mesma doença, outro objeto.
//
// ⚠️ O que este guard NÃO promete: ele lê o texto das fontes de
// `e2e/support/`. Um `PrismaClient` construído em outro diretório (o
// `global-setup.ts`, por exemplo) não entra na contagem — e nem deveria, porque
// o `global-setup` roda antes de qualquer container ser derrubado e o seu pool
// não atravessa o ciclo do F5. O que este guard proíbe é o que quebrou:
// um segundo cliente dentro de `support/`, ao lado da cura.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SUPORTE = fileURLToPath(new URL('./e2e/support/', import.meta.url));

/** Uma linha que constrói um cliente, com o arquivo e a linha para o erro nomear. */
function construcoesDePrismaClient(): string[] {
  return readdirSync(SUPORTE)
    .filter((arquivo) => arquivo.endsWith('.ts') && !arquivo.endsWith('.spec.ts'))
    .flatMap((arquivo) =>
      readFileSync(new URL(`./e2e/support/${arquivo}`, import.meta.url), 'utf8')
        .split('\n')
        .flatMap((texto, i) =>
          texto.includes('new PrismaClient(') ? [`${arquivo}:${i + 1}`] : [],
        ),
    );
}

describe('o suporte do e2e tem um único PrismaClient', () => {
  it('não há um segundo pool sem a recuperação do `limparBase()`', () => {
    // MEDIDO 2026-10-16: mutação verificada — devolver a um `rbac.ts` o seu
    // `new PrismaClient(...)` deixa ESTE teste vermelho. Sem a mutação, um guard
    // que nunca disparou é indistinguível de um que funciona.
    const construcoes = construcoesDePrismaClient();
    expect(
      construcoes.length === 1 && construcoes[0]?.startsWith('dados.ts:') === true,
      'o `e2e/support/` ganhou um `PrismaClient` novo — agora são ' +
        `${construcoes.length}: [${construcoes.join(', ')}]. Só o cliente de ` +
        '`dados.ts` sabe se curar do `docker stop` do F5 — é o `$disconnect()` ' +
        'no `catch` de `limparBase()` que reabre o pool. Um cliente ao lado ' +
        'recebe a conexão morta do container e morre com `Server has closed ' +
        'the connection` — passando isolado e caindo na suíte completa, que é ' +
        'a forma de falha mais cara de diagnosticar. Se o novo cliente é de ' +
        '`global-setup`, ele não pertence a este diretório.',
    ).toBe(true);
  });
});
