// apps/web/src/telemetry/web-vitals-reporter.spec.tsx
//
// Spec do reporter de Web Vitals. Garante que o módulo:
//   1. registra callbacks para LCP/CLS/INP/FID/TTFB do `web-vitals` ao ser
//      importado (efeito colateral no module-load); e
//   2. encaminha o `value` de cada métrica para um Histogram OTel via
//      `Meter#createHistogram().record()`.
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
// - `record` precisa estar acessível dentro do `vi.mock('@opentelemetry/api',
//   factory)` que é hoisted ao topo do arquivo; por isso declaramos via
//   `vi.hoisted(() => ({ record: vi.fn() }))` — caso contrário a referência
//   ficaria em TDZ quando o factory fosse invocado durante o `import()` do
//   reporter no teste 1.
//
// - `vi.resetModules()` em `beforeEach` garante que cada teste reavalie o
//   módulo sob mocks frescos (especialmente o `web-vitals`, que tem o call
//   count zerado entre importações).
//
// - Desde o fix do build do Docker (PR #25), o module-load do reporter é
//   guardado por `if (typeof window !== 'undefined')` — equivalente ao
//   guard em `apps/web/instrumentation-client.ts`. Vitest roda em
//   `environment: 'node'` (ver `vitest.config.ts`), então stubamos
//   `window` via `vi.stubGlobal` para destravar o guard e exercitar o
//   mesmo caminho que o runtime browser executa. `vi.unstubAllGlobals()`
//   em `afterEach` garante cleanup entre testes.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onLCP, onCLS, onINP } from 'web-vitals';

const hoisted = vi.hoisted(() => ({ record: vi.fn() }));

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
      createHistogram: () => ({ record: hoisted.record }),
    }),
  },
}));

beforeEach(() => {
  vi.resetModules();
  hoisted.record.mockClear();
  vi.stubGlobal('window', {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebVitalsReporter', () => {
  it('registra reporters LCP/CLS/INP ao importar o módulo', async () => {
    await import('./web-vitals-reporter.js');
    expect(onLCP).toHaveBeenCalled();
    expect(onCLS).toHaveBeenCalled();
    expect(onINP).toHaveBeenCalled();
  });

  it('callback do onLCP chama meter.record() com o valor recebido', async () => {
    await import('./web-vitals-reporter.js');
    const cb = vi.mocked(onLCP).mock.calls[0]?.[0];
    expect(cb).toBeDefined();
    cb!({ value: 1234 } as never);
    expect(hoisted.record).toHaveBeenCalledWith(1234);
  });
});
