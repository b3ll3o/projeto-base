import { initTracing } from './tracing.js';

// Side-effect: inicializa o SDK OTel imediatamente ao carregar este
// módulo. Projetado para `node --import <path>` no Dockerfile prod e
// para o side-effect import em apps/api/src/main.ts. Idempotente via
// globalThis.__otel_sdk__ (ver tracing.ts:11-14).
initTracing();
