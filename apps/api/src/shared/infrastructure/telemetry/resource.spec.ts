import { describe, it, expect } from 'vitest';
import { buildResource } from './resource.js';

describe('buildResource', () => {
  it('returns SERVICE_NAME from env when set', () => {
    const r = buildResource({ OTEL_SERVICE_NAME: 'svc-x' });
    expect(r.attributes['service.name']).toBe('svc-x');
  });

  it('defaults SERVICE_NAME to "projeto-base-api" when env unset', () => {
    const r = buildResource({});
    expect(r.attributes['service.name']).toBe('projeto-base-api');
  });

  it('includes SERVICE_VERSION from env or default "0.0.0"', () => {
    expect(buildResource({ OTEL_SERVICE_VERSION: '1.2.3' }).attributes['service.version']).toBe(
      '1.2.3',
    );
    expect(buildResource({}).attributes['service.version']).toBe('0.0.0');
  });

  it('includes DEPLOYMENT_ENVIRONMENT from NODE_ENV or "development"', () => {
    expect(buildResource({ NODE_ENV: 'production' }).attributes['deployment.environment']).toBe(
      'production',
    );
    expect(buildResource({}).attributes['deployment.environment']).toBe('development');
  });

  // pt-BR: o `resources` 3.x trocou a classe `Resource` (que injetava
  // `telemetry.sdk.*` sozinha) pela função `resourceFromAttributes` (que não
  // injeta). O conserto é a mescla com `defaultResource()` — e estas duas
  // specs prendem os DOIS lados dela: o que a mescla precisa trazer (o SDK) e
  // o que ela NÃO pode deixar o default ganhar (o nome do serviço).
  it('mantém os atributos do SDK que a classe 1.x injetava sozinha', () => {
    const r = buildResource({});
    expect(r.attributes['telemetry.sdk.name']).toBe('opentelemetry');
    expect(r.attributes['telemetry.sdk.language']).toBe('nodejs');
    expect(r.attributes['telemetry.sdk.version']).toBeDefined();
  });

  it('o nome do serviço do app vence o default do SDK (a ORDEM da mescla importa)', () => {
    // `defaultResource()` traz `service.name` = `unknown_service:<argv0>`.
    // Se a ordem da mescla inverter, o painel perde o nome do serviço e
    // passa a mostrar `unknown_service:...`.
    const r = buildResource({});
    expect(r.attributes['service.name']).toBe('projeto-base-api');
    expect(String(r.attributes['service.name'])).not.toContain('unknown_service');
  });
});
