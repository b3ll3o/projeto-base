import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('init.ts (bootstrap side-effect)', () => {
  beforeEach(() => {
    // Reset the global between tests so each import sees a fresh state
    delete (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__;
    delete process.env.OTEL_SDK_DISABLED;
    vi.resetModules();
  });

  it('chama initTracing() quando importado (via side-effect)', async () => {
    const tracingModule = await import('./tracing.js');
    const spy = vi.spyOn(tracingModule, 'initTracing');
    await import('./init.js');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('aponta para um módulo que existe e tem side-effect', async () => {
    // Static check: the file must exist and contain the call
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const initPath = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), 'init.ts');
    const src = await readFile(initPath, 'utf8');
    expect(src).toMatch(/initTracing\(/);
  });

  // ⚠️ O preload tem que vir ANTES do app — e a ORDEM é o que importa.
  //
  // MEDIDO 2026-11-24 (sink OTLP local na porta 4319, requisição real em
  // `/api/v1/health`):
  //
  //   SEM o preload (`node --import tsx/esm src/main.ts`)
  //     → 0 requests no sink — a API não exporta span NENHUM
  //
  //   COM o preload (`--import ./src/.../telemetry/init.ts`)
  //     → `POST /v1/traces bytes=2285 spans=[3:dns.lookup]`
  //     → `POST /v1/traces bytes=2883 spans=[2:GET]`  ← o span SERVER da
  //       requisição (kind 2 = SERVER no OTLP)
  //
  // O motivo: os imports ESTÁTICOS do `main.ts` (Nest, Fastify) são avaliados
  // ANTES do corpo do módulo — o `http` carrega antes de o SDK subir, e a
  // instrumentação não patcheia nada. O `init.ts` pré-carregado sobe o SDK
  // antes de o app carregar qualquer módulo.
  it('o preload da telemetria é carregado ANTES do app (o `dev` e o `ci:boot`)', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');

    const raizApp = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../../../..');
    const PRELOAD = './src/shared/infrastructure/telemetry/init.ts';

    const pkg = JSON.parse(await readFile(path.join(raizApp, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const dev = pkg.scripts?.dev ?? '';
    expect(dev).toContain(PRELOAD);
    expect(dev.indexOf(PRELOAD)).toBeLessThan(dev.indexOf('src/main.ts'));

    const boot = await readFile(
      path.resolve(raizApp, '../..', '.tooling/scripts/ci/boot-local.ts'),
      'utf8',
    );
    expect(boot).toContain(PRELOAD);
    expect(boot.indexOf(PRELOAD)).toBeLessThan(boot.indexOf("'src/main.ts'"));
  });
});
