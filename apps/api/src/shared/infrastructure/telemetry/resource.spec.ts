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
});
