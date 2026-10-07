// apps/web/instrumentation.node.spec.ts
//
// Contrato da inicialização do OpenTelemetry no runtime do Node.
//
// pt-BR: este arquivo age por IMPORTAÇÃO, não por chamada — é um side-effect
// puro, contract do `await import('./instrumentation.node')` feito por
// `instrumentation.ts`. Isso tem duas consequências que os testes precisam
// modelar:
//
//  1. um `throw` aqui não é um erro de telemetria, é o servidor inteiro
//     fora do ar — Server Actions, RSC e API routes morrem juntos;
//  2. a idempotência (`globalThis.__otel_sdk__`) é load-bearing em dev,
//     porque o HMR reimporta o módulo a cada edição.
//
// O fato de o irmão `instrumentation-client.ts` já ter suffered exatamente
// do problema do item 1 (URL relativa de OTLP) é o motivo do teste 2 existir
// aqui: o conserto foi aplicado de um lado só.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sdk: { start: vi.fn(), stop: vi.fn() },
  exporter: vi.fn(),
  autoInstrumentations: vi.fn(),
  construtorDoSdk: vi.fn(),
  explodirNoExporter: false,
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn((cfg: unknown) => {
    h.construtorDoSdk(cfg);
    return h.sdk;
  }),
}));
vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: h.autoInstrumentations,
}));
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn((cfg: { url: string }) => {
    // pt-BR: reproduz o comportamento REAL do SDK, que valida a URL no
    // construtor e lança. A recusa de URL RELATIVA é incondicional de
    // propósito: na primeira versão deste mock o throw dependia só da flag,
    // e o teste "endpoint relativo é recusado" passava sem que nada fosse
    // recusado — um falso positivo que teria sobrevivido ao conserto errado.
    if (!/^https?:\/\//i.test(cfg.url)) {
      throw new Error(`Could not parse user-provided export URL: '${cfg.url}'`);
    }
    if (h.explodirNoExporter) {
      throw new Error('falha simulada do SDK');
    }
    h.exporter(cfg);
    return { tipo: 'OTLPTraceExporter' };
  }),
}));
// pt-BR: `@opentelemetry/semantic-conventions` NÃO é mockado de propósito —
// o `Resource` recebe as chaves reais ('service.name', 'deployment.environment'),
// e um teste que passa com chaves inventadas não prova nada.
vi.mock('@opentelemetry/resources', () => ({
  Resource: vi.fn((atributos: unknown) => ({ atributos })),
}));

const CHAVE_ENDPOINT = 'OTEL_EXPORTER_OTLP_ENDPOINT';
const CHAVE_SERVICO = 'OTEL_SERVICE_NAME';
const CHAVE_OTEL_SDK = '__otel_sdk__';

async function carregar(): Promise<void> {
  vi.resetModules();
  await import('./instrumentation.node');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.explodirNoExporter = false;
  delete process.env[CHAVE_ENDPOINT];
  delete process.env[CHAVE_SERVICO];
  delete (globalThis as Record<string, unknown>)[CHAVE_OTEL_SDK];
});

afterEach(() => {
  delete process.env[CHAVE_ENDPOINT];
  delete process.env[CHAVE_SERVICO];
  delete (globalThis as Record<string, unknown>)[CHAVE_OTEL_SDK];
  vi.restoreAllMocks();
});

describe('instrumentation.node — a telemetria do servidor nunca derruba o servidor', () => {
  it('sem endpoint configurado, sobe o SDK apontando para o collector padrão', async () => {
    await expect(carregar()).resolves.toBeUndefined();

    expect(h.exporter).toHaveBeenCalledWith({ url: 'http://otel-collector:4318/v1/traces' });
    expect(h.sdk.start).toHaveBeenCalledTimes(1);
    expect((globalThis as Record<string, unknown>)[CHAVE_OTEL_SDK]).toBe(h.sdk);
  });

  it('endpoint RELATIVO cai no collector padrão em vez de derrubar o servidor', async () => {
    // pt-BR: a mesma regressão que matou a hidratação no browser, e que
    // naquele lado foi corrigida. A URL relativa é o valor natural de quem
    // aponta para uma rota do próprio Next, e o SDK exige absoluta.
    //
    // O comportamento escolhido aqui difere do cliente de propósito: no
    // browser, sem endpoint o app FICA sem telemetria; no servidor, cair no
    // collector padrão preserva a telemetria de dev sem ninguém precisar
    // lembrar de configurar a variável.
    process.env[CHAVE_ENDPOINT] = '/api/otel/collect';

    await expect(carregar()).resolves.toBeUndefined();

    expect(h.exporter).toHaveBeenCalledWith({ url: 'http://otel-collector:4318/v1/traces' });
    expect(h.sdk.start).toHaveBeenCalledTimes(1);
  });

  it('o SDK sobe UMA vez, mesmo com o módulo importado de novo', async () => {
    // pt-BR: `sdk.start()` duas vezes registra o provider global duas vezes
    // e o segundo registro vence com instrumentações que já não acham o
    // trace. É o caminho que o HMR de `next dev` percorre a cada edição.
    await carregar();
    await carregar();
    await carregar();

    expect(h.construtorDoSdk).toHaveBeenCalledTimes(1);
    expect(h.sdk.start).toHaveBeenCalledTimes(1);
  });

  it('os atributos de recurso saem das variáveis de ambiente', async () => {
    process.env[CHAVE_SERVICO] = 'cadastro-web';
    process.env.NODE_ENV = 'production';

    await carregar();

    expect(h.construtorDoSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: {
          atributos: {
            'service.name': 'cadastro-web',
            'deployment.environment': 'production',
          },
        },
      }),
    );
  });

  it('sem OTEL_SERVICE_NAME, o nome do serviço cai no default do app', async () => {
    // pt-BR: `?? 'projeto-base-web'` é o que impede o atributo de virar
    // `undefined` e sumir do painel de quem lê o collector.
    delete process.env[CHAVE_SERVICO];
    process.env.NODE_ENV = 'production';

    await carregar();

    expect(h.construtorDoSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.objectContaining({
          atributos: expect.objectContaining({ 'service.name': 'projeto-base-web' }),
        }),
      }),
    );
  });

  it('a instrumentação de fs fica desabilitada', async () => {
    // pt-BR: fs gera ruído massivo em RSC — cada leitura de arquivo vira
    // um span. Deixá-la ligada é o que faz o collector ficar ilegível.
    await carregar();

    expect(h.autoInstrumentations).toHaveBeenCalledWith({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    });
  });

  it('se o OTel explodir, o módulo registra o motivo e não propaga', async () => {
    // pt-BR: mesmo com endpoint válido, um erro futuro do SDK não pode
    // derrubar o servidor. O sintoma sem isto não é tela quebrada — é um
    // deploy que volta, porque o motivo estava escondido no import.
    process.env[CHAVE_ENDPOINT] = 'http://otel-collector:4318/v1/traces';
    h.explodirNoExporter = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(carregar()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      '[otel] telemetria do server desabilitada:',
      expect.objectContaining({ message: expect.stringContaining('falha simulada') }),
    );
    expect((globalThis as Record<string, unknown>)[CHAVE_OTEL_SDK]).toBeUndefined();
  });
});
