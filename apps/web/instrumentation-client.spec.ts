// apps/web/instrumentation-client.spec.ts
//
// Contrato do bootstrap de telemetria do BROWSER.
//
// pt-BR: este arquivo é avaliado no bootstrap do bundle do cliente. Uma
// exceção aqui não produz tela quebrada — produz uma aplicação que renderiza
// e não reage a clique nenhum, sem erro visível. Foi exatamente o que
// aconteceu: o `OTLPTraceExporter` exige URL absoluta, o fallback era
// `/api/otel/collect` (rota que não existe), e o `Could not parse
// user-provided export URL` abortava a hidratação.
//
// O que este teste segura, em uma frase: **importar este módulo não joga**,
// aconteça o que acontecer com o ambiente. Os testes 1 e 2 são a regressão
// do defeito real; 3 e 4 cobrem os dois caminhos que sobram.
//
// jsdom é obrigatório: o módulo só executa o side-effect sob
// `typeof window !== 'undefined'`, e em ambiente `node` ele seria um no-op
// que testaria nada.

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// pt-BR: `vi.mock` é içado para o topo do arquivo, antes de qualquer
// `const`. Por isso o alvo precisa vir de `vi.hoisted` — declarar um objeto
// aqui e usá-lo dentro da factory daria ReferenceError na hora do import.
const h = vi.hoisted(() => ({
  provider: { addSpanProcessor: vi.fn(), register: vi.fn() },
  exporter: vi.fn(),
  spanProcessor: vi.fn(),
  autoInstrumentations: vi.fn(),
  warn: vi.fn(),
  // permite simular "o OTel explodiu" sem depender de nenhum detalhe do SDK
  explodirNoExporter: false,
}));

vi.mock('@opentelemetry/sdk-trace-web', () => ({
  WebTracerProvider: vi.fn(() => h.provider),
}));
vi.mock('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: vi.fn((e: unknown) => {
    h.spanProcessor(e);
    return { tipo: 'BatchSpanProcessor' };
  }),
}));
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn((cfg: { url: string }) => {
    // pt-BR: reproduz o comportamento REAL do SDK, que valida a URL no
    // construtor e lança. A recusa de URL RELATIVA é INCONDICIONAL de
    // propósito: na primeira versão deste mock o throw dependia só da flag,
    // e o teste 2 ("endpoint relativo é recusado") passava sem que nada
    // fosse recusado — falso positivo que sobreviveria a um conserto errado.
    if (!/^https?:\/\//i.test(cfg.url)) {
      throw new Error(`Configuration: Could not parse user-provided export URL: '${cfg.url}'`);
    }
    if (h.explodirNoExporter) {
      throw new Error('falha simulada do SDK');
    }
    h.exporter(cfg);
    return { tipo: 'OTLPTraceExporter' };
  }),
}));
vi.mock('@opentelemetry/auto-instrumentations-web', () => ({
  getWebAutoInstrumentations: h.autoInstrumentations,
}));
vi.mock('@opentelemetry/resources', () => ({ Resource: vi.fn(() => ({})) }));

const CHAVE = 'NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT';

/** Importa o módulo do zero — ele age na importação, não na chamada. */
async function carregarModulo(): Promise<void> {
  vi.resetModules();
  await import('./instrumentation-client');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.explodirNoExporter = false;
  delete process.env[CHAVE];
  delete process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME;
  vi.spyOn(console, 'warn').mockImplementation(h.warn);
});

afterEach(() => {
  delete process.env[CHAVE];
  vi.restoreAllMocks();
});

describe('instrumentation-client — a telemetria nunca derruba a aplicação', () => {
  it('sem endpoint configurado, importa sem lançar e não monta exporter', async () => {
    // pt-BR: este é o estado PADRÃO de qualquer dev que não tenha a
    // variável no `.env`. Antes do conserto era aqui que a hidratação morria.
    await expect(carregarModulo()).resolves.toBeUndefined();

    expect(h.exporter).not.toHaveBeenCalled();
    expect(h.provider.register).not.toHaveBeenCalled();
  });

  it('endpoint RELATIVO é recusado em vez de explodir no construtor', async () => {
    // pt-BR: a regressão exata. `/api/otel/collect` é relativo; o SDK exige
    // absoluta e lança. O guard tem que barrar ANTES de construir.
    process.env[CHAVE] = '/api/otel/collect';

    await expect(carregarModulo()).resolves.toBeUndefined();

    expect(h.exporter).not.toHaveBeenCalled();
    expect(h.provider.register).not.toHaveBeenCalled();
  });

  it('endpoint absoluto liga a telemetria de verdade', async () => {
    process.env[CHAVE] = 'http://localhost:4318/v1/traces';

    await carregarModulo();

    expect(h.exporter).toHaveBeenCalledWith({ url: 'http://localhost:4318/v1/traces' });
    // pt-BR: o `register()` vem ANTES das auto-instrumentations. Cada
    // instrumentação chama `trace.getTracer()` no construtor super(), e isso
    // resolve pelo provider global — inverter a ordem devolve NoopTracers,
    // ou seja, telemetria que parece ligada e não emite nada.
    expect(h.provider.register).toHaveBeenCalledTimes(1);
    expect(h.autoInstrumentations).toHaveBeenCalledTimes(1);
    expect(h.provider.addSpanProcessor).toHaveBeenCalledTimes(1);
  });

  it('se o OTel explodir, a aplicação continua e o motivo fica registrado', async () => {
    // pt-BR: mesmo com endpoint válido, qualquer erro futuro de OTel tem que
    // ser absorvido. O sintoma sem isto não é tela quebrada — é uma app que
    // não responde a clique, com o motivo escondido no console.
    process.env[CHAVE] = 'http://localhost:4318/v1/traces';
    h.explodirNoExporter = true;

    await expect(carregarModulo()).resolves.toBeUndefined();

    expect(h.warn).toHaveBeenCalledWith(
      '[otel] telemetria do browser desabilitada:',
      expect.objectContaining({ message: expect.stringContaining('falha simulada') }),
    );
    expect(h.provider.register).not.toHaveBeenCalled();
  });
});
