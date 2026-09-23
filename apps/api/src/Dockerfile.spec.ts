// apps/api/src/Dockerfile.spec.ts
//
// pt-BR: spec RED→GREEN do Task 1.5 (Fase telemetria) — garante que o
// Dockerfile.prod auto-carrega o tracing OTel via NODE_OPTIONS de forma
// ESM-aware (`--import`, NÃO `--require`). Justificativa ESM:
// --require é CJS-only e quebra em runtime `type: module`; o projeto
// é ESM puro (`type: module`, `module: NodeNext`).
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

// Resolve absoluto a partir do arquivo .ts — cwd-independente (testes
// rodam do apps/api/, mas o spec pode ser descoberto por paths absolutos).
const DOCKERFILE_PATH = new URL('../Dockerfile', import.meta.url);

describe('Dockerfile prod target — OTel tracing bootstrap (Task 1.5)', () => {
  it('declara NODE_OPTIONS com --import (ESM-aware) apontando para telemetry/tracing.js', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    // --require é CJS-only e quebraria ESM (ERR_REQUIRE_ESM) — não aceitar
    expect(dockerfile).not.toMatch(/NODE_OPTIONS=.*--require/);
    // --import é a forma ESM-aware (Node 20.6+ / 22+); path deve terminar em telemetry/tracing.js
    expect(dockerfile).toMatch(/NODE_OPTIONS=.*--import\s+\S*telemetry\/tracing\.js/);
  });

  it('mantém ENTRYPOINT/CMD executando node dist/main.js no target prod', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    // prod usa ENTRYPOINT (não CMD) por causa do `sh -c` que encadeia
    // `prisma migrate deploy` antes do `node dist/main.js`. A regex
    // aceita ambos para preservar o intent do teste.
    expect(dockerfile).toMatch(/(?:CMD|ENTRYPOINT).*node.*dist\/main/);
  });

  it('NODE_OPTIONS aponta para dist/ (artefato compilado), não src/', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    // Em prod rodamos a partir de apps/api/dist/ (output do `tsc -p tsconfig.build.json`)
    expect(dockerfile).not.toMatch(/NODE_OPTIONS=.*src\/shared\/infrastructure\/telemetry/);
  });
});
