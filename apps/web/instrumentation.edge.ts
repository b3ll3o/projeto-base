// apps/web/instrumentation.edge.ts
// Edge runtime is NOT a target for this project (no edge routes configured).
// Stub exists to satisfy the dynamic import in `instrumentation.ts`
// (T3.2) and to document the project decision in code. If Edge runtime
// is added in the future, replace this stub with a real OTel init using
// `@opentelemetry/sdk-trace-base` (lightweight, edge-compatible — NOT
// `@opentelemetry/sdk-node` which is Node-only).

export {}; // side-effect-free: do nothing
