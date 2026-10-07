// apps/web/instrumentation.spec.ts
//
// Contrato do SHIM que escolhe o runtime da telemetria.
//
// pt-BR: `instrumentation.ts` é o único ponto do app que o Next chama em
// todos os runtimes, e a escolha do que carregar sai de `NEXT_RUNTIME`. É um
// dispatch de 6 linhas, e é o tipo de arquivo que ninguém olha — mas é
// ele que decide se o servidor inteiro tem telemetria ou não. Se o shim
// carregar o arquivo errado, o app não quebra: ele só fica silencioso, e
// silêncio é indistinguível de "não configurado".
//
// O terceiro caso deste arquivo (`NEXT_RUNTIME` ausente) é o que segura a
// verdade: rodar a suíte fora do `next dev` é o estado NORMAL de quem
// executa `vitest`, e um shim que importasse algo fora desse caso derrubaria
// a suíte de todo mundo.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Quantas vezes cada runtime foi CARREGADO, no teste corrente.
 *
 * ## Por que `vi.doMock` e não `vi.mock`
 *
 * A primeira versão deste arquivo usava `vi.mock` (hoisted, registrado uma
 * vez) e um contador incrementado dentro do factory. MEDIDO 2026-10-06, com o
 * shim mutado para `NEXT_RUNTIME !== 'edge'` — que carrega Node em TODOS os
 * casos menos `edge`, inclusive os dois que deveriam não carregar nada:
 *
 *     SHIM entrou com runtime= undefined
 *     SHIM vai importar NODE          ← o import aconteceu
 *     t3 node= 0 edge= 0             ← e o contador não viu
 *
 * Os 4 testes seguiam verdes. O factory de `vi.mock` é avaliado **uma vez por
 * specifier por arquivo**, e `vi.resetModules()` limpa o registro de módulos
 * mas não o do factory: o segundo import do MESMO specifier devolve a
 * instância memorizada, e o `h.node++` não corre de novo.
 *
 * Isso tornava inertes os 4 testes, e não só 2: em t1 o `toBe(0)` de `edge`
 * e em t2 o de `node` liam "o factory do outro nunca rodou neste arquivo" e
 * liam como "não carregou". Quatro asserções verde por ausência — a forma em
 * que um teste não distingue "verifiquei e passou" de "não havia o que
 * verificar".
 *
 * `vi.doMock` não é hoisted e é re-registrado a cada chamada do helper, então
 * o factory é reavaliado por teste. MEDIDO com o mesmo shim mutado:
 * `t3 node= 1`, `t4 node= 1` — os dois casos que precisam acusar, acusam.
 *
 * `vi.isolateModulesAsync` foi a terceira hipótese testada e **não** serve:
 * os 4 testes falham com ela (o módulo importado dentro do isolate não
 * enxerga o mock registrado fora).
 */
const h = { node: 0, edge: 0 };

/**
 * Carrega o shim do zero e CHAMA `register()`, que é onde o dispatch vive.
 *
 * pt-BR: a primeira versão deste helper só fazia `import('./instrumentation')`
 * e o contador ficava em 0 nos dois casos — o `import()` dinâmico está dentro
 * de `register()`, e importar um módulo que exporta uma função não executa
 * nada. A falha parecia "o shim está quebrado"; o shim estava certo e o
 * teste é que não rodava o sujeito.
 */
async function registrar(runtime: string | undefined): Promise<void> {
  if (runtime === undefined) {
    delete process.env.NEXT_RUNTIME;
  } else {
    process.env.NEXT_RUNTIME = runtime;
  }
  vi.doMock('./instrumentation.node', () => {
    h.node++;
    return {};
  });
  vi.doMock('./instrumentation.edge', () => {
    h.edge++;
    return {};
  });
  vi.resetModules();
  const { register } = await import('./instrumentation');
  await register();
}

beforeEach(() => {
  h.node = 0;
  h.edge = 0;
  delete process.env.NEXT_RUNTIME;
});

afterEach(() => {
  delete process.env.NEXT_RUNTIME;
});

describe('instrumentation.ts — o shim carrega o runtime certo', () => {
  it('NEXT_RUNTIME=nodejs carrega a instrumentação do Node e não a da edge', async () => {
    await registrar('nodejs');

    expect(h.node).toBe(1);
    expect(h.edge).toBe(0);
  });

  it('NEXT_RUNTIME=edge carrega o stub da edge e não a do Node', async () => {
    await registrar('edge');

    expect(h.edge).toBe(1);
    expect(h.node).toBe(0);
  });

  it('sem NEXT_RUNTIME não carrega nada e não lança', async () => {
    // pt-BR: este é o estado de qualquer `vitest run` e de qualquer build
    // que não passe pelo shim. Se o shim importasse algo fora dos dois
    // casos declarados, quem roda a suíte fora do `next dev` perderia a
    // suíte inteira — o sintoma seria a ausência, não um erro.
    await expect(registrar(undefined)).resolves.toBeUndefined();

    expect(h.node).toBe(0);
    expect(h.edge).toBe(0);
  });

  it('um valor fora da lista não é adivinhado para nodejs', async () => {
    // pt-BR: o fallback silencioso seria perigoso aqui — carregar o
    // `sdk-node` (que é Node-only) dentro de outro runtime quebra o
    // bundle, e o default "se não sei, node" esconde exatamente isso.
    await registrar('workerd');

    expect(h.node).toBe(0);
    expect(h.edge).toBe(0);
  });
});
