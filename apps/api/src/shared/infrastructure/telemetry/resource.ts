import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

type Env = Record<string, string | undefined>;

export function buildResource(env: Env = process.env): Resource {
  return new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: env.OTEL_SERVICE_NAME ?? 'projeto-base-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: env.OTEL_SERVICE_VERSION ?? '0.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env.NODE_ENV ?? 'development',
  });
}
