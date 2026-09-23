// apps/web/src/telemetry/web-vitals-reporter.tsx
//
// "Marker component" para Web Vitals → OpenTelemetry.
//
// Este módulo é um Client Component (`'use client'`) cujo único propósito é
// ser montado em `app/layout.tsx` (Task 4.2). Ao ser importado pelo
// runtime do browser, ele registra callbacks de `web-vitals` para os 5
// Core Web Vitals + TTFB e encaminha cada valor para um Histogram OTel
// (`web.vitals.{lcp|cls|inp|fid|ttfb}`).
//
// Por que side-effect no module-load (e não em `useEffect`):
//
//   1. O reporter é stateless (não renderiza nada). Usar `useEffect`
//      obrigaria a renderizar o componente no DOM só para disparar a
//      inscrição — overhead desnecessário.
//   2. O conjunto de inscrições é global à página; re-registrar a cada
//      re-renderização do componente (que pode acontecer em hot-reload,
//      em `React.StrictMode` ou em transições de layout) duplicaria
//      observadores.
//   3. Casa com o padrão de inicialização eager usado em
//      `apps/web/instrumentation-client.ts`.
//
// SSR-safety:
//
//   IMPORTANTE: mesmo com `'use client'`, o Next.js avalia este módulo
//   durante o build pipeline (prerender de páginas estáticas como
//   `/_not-found` e `/`). O callback de `web-vitals` é registrado via
//   `whenActivated(...)`, que referencia `document.prerendering` no setup
//   do `PerformanceObserver` — isso lança `ReferenceError: document is
//   not defined` no Node.js e quebra o build do Docker (PR #25,
//   `docker-build-prod` CI check). Mesmo padrão já adotado em
//   `apps/web/instrumentation-client.ts`: guard top-level
//   `if (typeof window !== 'undefined')` para que o módulo só execute
//   no browser em runtime, mas o build pipeline faça tree-shaking
//   seguro sem `document` reference no Node.

'use client';

import { onLCP, onCLS, onINP, onFID, onTTFB } from 'web-vitals';
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('projeto-base-web');

if (typeof window !== 'undefined') {
  onLCP((metric) => {
    meter.createHistogram('web.vitals.lcp').record(metric.value);
  });
  onCLS((metric) => {
    meter.createHistogram('web.vitals.cls').record(metric.value);
  });
  onINP((metric) => {
    meter.createHistogram('web.vitals.inp').record(metric.value);
  });
  onFID((metric) => {
    meter.createHistogram('web.vitals.fid').record(metric.value);
  });
  onTTFB((metric) => {
    meter.createHistogram('web.vitals.ttfb').record(metric.value);
  });
}

export function WebVitalsReporter(): null {
  return null;
}
