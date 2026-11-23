import { defaultResource, resourceFromAttributes, type Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

type Env = Record<string, string | undefined>;

export function buildResource(env: Env = process.env): Resource {
  // O `Resource` virou interface no `resources` 3.x: a classe saiu e o
  // construtor virou a função `resourceFromAttributes`.
  //
  // O `defaultResource()` entra na mescla porque a classe 1.x injetava
  // `telemetry.sdk.*` sozinha e a função 3.x não: sem a mescla, o painel
  // perde o nome e a versão do SDK que produziu o span.
  return defaultResource().merge(
    resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: env.OTEL_SERVICE_NAME ?? 'projeto-base-api',
      [SemanticResourceAttributes.SERVICE_VERSION]: env.OTEL_SERVICE_VERSION ?? '0.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env.NODE_ENV ?? 'development',
    }),
  );
}
