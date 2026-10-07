// apps/web/src/telemetry/web-vitals-reporter.spec.tsx
//
// Spec do reporter de Web Vitals. Garante que o módulo:
//   1. registra callbacks para LCP/CLS/INP/FID/TTFB do `web-vitals` ao ser
//      importado (efeito colateral no module-load);
//   2. encaminha o `value` de cada métrica para o Histogram OTel cujo NOME
//      corresponde à métrica — via `Meter#createHistogram(nome).record()`.
//
// pt-BR (2026-10-06): a versão anterior deste arquivo testava o item 1 e o
// `record` do item 2, mas nunca o NOME do histogram — e o nome é o contrato
// inteiro do módulo. Se as cinco callbacks gravassem em
// `'web.vitals.lcp'`, a suíte anterior ficava verde e o painel de quem lê o
// collector veria uma métrica viva e quatro panelos vazios, sem nenhum sinal
// de erro. A tabela abaixo é o que fecha isso.
//
// Notas de design:
//
// - O reporter é um "marker component" (Client Component que retorna `null`)
//   cujo único propósito é ser montado no `app/layout.tsx` (T4.2). Como
//   `'use client'` garante que o módulo só entra no bundle do browser, as
//   inscrições no `web-vitals` acontecem uma única vez no carregamento da
//   página. Optou-se por side-effect no module-load em vez de `useEffect`
//   para (a) evitar re-registro caso o componente seja re-renderizado e
//   (b) casar com o padrão de inicialização eager usado em
//   `apps/web/instrumentation-client.ts`.
//
// - vitest roda em `environment: 'node'`, portanto não há
//   `PerformanceObserver`. Como `web-vitals` v4 encapsula o `observe` em
//   try/catch, `onLCP(...)` apenas no-op silenciosamente no servidor —
//   comportamento desejado.
//
// - `record` e `createHistogram` precisam estar acessíveis dentro do
//   `vi.mock(..., factory)`, que é hoisted ao topo do arquivo; por isso
//   declaram-se via `vi.hoisted(...)` — caso contrário a referência ficaria
//   em TDZ quando o factory fosse invocado durante o `import()` do reporter.
//
// - `vi.resetModules()` em `beforeEach` garante que cada teste reavalie o
//   módulo sob mocks frescos (especialmente o `web-vitals`, que tem o call
//   count zerado entre importações).
//
// - Desde o fix do build do Docker (PR #25), o module-load do reporter é
//   guardado por `if (typeof window !== 'undefined')` — equivalente ao
//   guard em `apps/web/instrumentation-client.ts`. O teste "sem window" no
//   fim deste arquivo exercita o lado FALSO desse guard, que é exatamente o
//   caminho que quebrou o build do Docker.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onLCP, onCLS, onINP, onFID, onTTFB } from 'web-vitals';

// pt-BR: aqui só há spies. A função que MONTA o objeto `{ record }` precisa
// viver dentro do factory de `vi.mock` — ver o comentário de lá.
const hoisted = vi.hoisted(() => ({
  createHistogram: vi.fn(),
  record: vi.fn(),
}));

vi.mock('web-vitals', () => ({
  onLCP: vi.fn(),
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onFID: vi.fn(),
  onTTFB: vi.fn(),
}));

vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: () => ({
      // pt-BR: o `record` do objeto devolvido PRECISA ser montado aqui
      // dentro do factory. Numa versão anterior, `createHistogram` era um
      // `vi.fn` definido dentro do `vi.hoisted`, com a implementação
      // referenciando `hoisted.record` — e o transform do Vitest reescrevia
      // essa referência para um `vi.fn()` novo a cada chamada. O módulo
      // gravava num spy e o teste olhava outro: `record` ficava em 0
      // chamadas, sem erro nenhum, com o retorno do mock parecendo
      // perfeitamente normal. Um teste que falha porque mede o objeto errado
      // é pior que um teste que não existe — ele aponta para o código
      // quando o defeito está no próprio teste.
      createHistogram: (nome: string) => {
        hoisted.createHistogram(nome);
        return { record: hoisted.record };
      },
    }),
  },
}));

// pt-BR: a tabela é a especificação. O nome do histogram é o contrato
// observável deste módulo — é o que o painel de quem lê o collector consome.
const METRICAS = [
  { nome: 'LCP', registrar: onLCP, histogram: 'web.vitals.lcp' },
  { nome: 'CLS', registrar: onCLS, histogram: 'web.vitals.cls' },
  { nome: 'INP', registrar: onINP, histogram: 'web.vitals.inp' },
  { nome: 'FID', registrar: onFID, histogram: 'web.vitals.fid' },
  { nome: 'TTFB', registrar: onTTFB, histogram: 'web.vitals.ttfb' },
] as const;

async function importar(): Promise<void> {
  await import('./web-vitals-reporter.js');
}

beforeEach(() => {
  vi.resetModules();
  // pt-BR (2026-10-06): `vi.resetModules()` NÃO limpa os spies de
  // `vi.mock('web-vitals', ...)`. Sem esta linha, `mock.calls[0]` devolvia o
  // callback de um teste ANTERIOR — cujo `record` já tinha sido zerado — e a
  // falha aparecia como "a métrica não grava o valor", longe da causa. Os
  // testes 2 e 3 liam o call 0; o 3 precisa dele zerado de verdade, senão o
  // guard de SSR vê acúmulo e acusa métrica rodando fora do browser.
  vi.clearAllMocks();
  hoisted.createHistogram.mockClear();
  hoisted.record.mockClear();
  vi.stubGlobal('window', {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebVitalsReporter — inscrição no module-load', () => {
  it('registra as 5 métricas do Core Web Vitals + TTFB', async () => {
    await importar();

    for (const { nome, registrar } of METRICAS) {
      expect(registrar, `${nome} não foi registrado`).toHaveBeenCalledTimes(1);
    }
  });

  it('cada métrica grava no histogram COM O NOME DELA', async () => {
    await importar();

    for (const { nome, registrar, histogram } of METRICAS) {
      const cb = vi.mocked(registrar).mock.calls[0]?.[0];
      expect(cb, `${nome} não recebeu callback`).toBeDefined();

      cb!({ value: 1234 } as never);

      expect(hoisted.createHistogram, `${nome} não criou histogram`).toHaveBeenCalledWith(
        histogram,
      );
      expect(hoisted.record, `${nome} não gravou o valor`).toHaveBeenCalledWith(1234);
    }
  });

  it('nenhuma métrica grava no histogram de outra (o mapeamento é 1:1)', async () => {
    // pt-BR: o teste anterior passaria se as cinco callbacks usassem o mesmo
    // nome. Este é o que transforma "o nome foi chamado" em "o nome certo
    // foi chamado, uma vez, e nenhum vizinho foi tocado".
    await importar();

    for (const { registrar, histogram } of METRICAS) {
      vi.mocked(registrar).mock.calls[0]![0]({ value: 1 } as never);
    }

    const pedidos = hoisted.createHistogram.mock.calls.map((c) => c[0]);
    expect(pedidos).toEqual(METRICAS.map((m) => m.histogram));
  });
});

describe('WebVitalsReporter — o guard de SSR', () => {
  it('sem window, o módulo não registra nada e não lança', async () => {
    // pt-BR: este é o caminho do build do Docker (PR #25). O
    // `whenActivated` do `web-vitals` referencia `document.prerendering` no
    // setup do `PerformanceObserver` e estourava `ReferenceError: document is
    // not defined` no Node. O guard é o que segura isso.
    vi.unstubAllGlobals();
    expect(typeof window).toBe('undefined');

    await expect(importar()).resolves.toBeUndefined();

    for (const { nome, registrar } of METRICAS) {
      expect(registrar, `${nome} rodou fora do browser`).not.toHaveBeenCalled();
    }
    expect(hoisted.createHistogram).not.toHaveBeenCalled();
  });
});

describe('WebVitalsReporter — o componente', () => {
  it('é um marker component que renderiza nada', async () => {
    const { WebVitalsReporter } = await import('./web-vitals-reporter.js');

    expect(WebVitalsReporter()).toBeNull();
  });
});
