// tooling/scripts/compose-observability-profile.spec.ts
//
// pt-BR: Smoke spec do docker compose profile `observability` adicionado em T5.2.
// Faz shell-out para `docker compose config` (sem e com `--profile observability`)
// e valida 6 invariantes do serviço `otel-collector`:
//
//   1. Default profile EXCLUI otel-collector (gating por profile funciona).
//   2. Profile `observability` INCLUI otel-collector.
//   3. Imagem pinada em `otel/opentelemetry-collector-contrib:0.103.0` (sem `:latest`).
//   4. Volume mount aponta para `infra/otelcol/config.yaml` em modo read-only.
//   5. Portas OTLP gRPC (4317) e HTTP (4318) expostas.
//   6. Comando `--config=/etc/otelcol/config.yaml` presente.
//
// Defende contra regressões futuras em T5.2 (e.g., alguém acidentalmente
// tirando o `profiles: [observability]`, fixando a imagem em `:latest`,
// perdendo o volume mount ou trocando as portas).
//
// Notas de formato do `docker compose config`:
//   - `source: ./infra/otelcol/config.yaml` no YAML vira
//     `source: /<abs>/infra/otelcol/config.yaml` no render (path absoluto).
//   - `ports: ['4317:4317']` vira `published: "4317"` (string com aspas).
//   - Indentação: 4 espaços para chaves de serviço, 8 para campos aninhados.

import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// spec vive em tooling/scripts/, REPO_ROOT está 2 níveis acima.
// Em URL resolution do Node, `..` aplicado a um file URL remove o basename
// do arquivo como 1 segmento + sobe 1 diretório a mais, então do path
// `.../base/tooling/scripts/foo.spec.ts` precisamos de 2 `..`s para chegar
// em `.../base/`.
const REPO_ROOT = new URL('../..', import.meta.url).pathname;

function composeConfig(profile?: string): string {
  const profileFlag = profile ? ` --profile ${profile}` : '';
  return execSync(`docker compose${profileFlag} config`, {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('docker compose profile: observability (Task 5.4)', () => {
  it('exclui otel-collector do default profile (gating funciona)', () => {
    const defaultConfig = composeConfig();
    const matches = (defaultConfig.match(/^  otel-collector:/gm) ?? []).length;
    expect(matches).toBe(0);
  });

  it('inclui otel-collector quando --profile observability é setado', () => {
    const obsConfig = composeConfig('observability');
    expect(obsConfig).toMatch(/^  otel-collector:/m);
  });

  it('pina imagem em otel/opentelemetry-collector-contrib:0.103.0 (sem :latest)', () => {
    const obsConfig = composeConfig('observability');
    expect(obsConfig).toMatch(/image:\s+otel\/opentelemetry-collector-contrib:0\.103\.0/);
    // Garante que NENHUMA linha de imagem do otel-collector termina em :latest.
    expect(obsConfig).not.toMatch(/image:\s+otel\/opentelemetry-collector.*:latest/m);
  });

  it('monta infra/otelcol/config.yaml read-only em /etc/otelcol/config.yaml', () => {
    const obsConfig = composeConfig('observability');
    // `docker compose config` normaliza `source:` para path absoluto.
    expect(obsConfig).toMatch(/source:\s+\/.*infra\/otelcol\/config\.yaml/);
    expect(obsConfig).toMatch(/target:\s+\/etc\/otelcol\/config\.yaml/);
    expect(obsConfig).toMatch(/read_only:\s+true/);
  });

  it('expõe portas OTLP gRPC (4317) e HTTP (4318)', () => {
    const obsConfig = composeConfig('observability');
    expect(obsConfig).toMatch(/published:\s+"4317"/);
    expect(obsConfig).toMatch(/published:\s+"4318"/);
  });

  it('passa --config=/etc/otelcol/config.yaml como argumento de command', () => {
    const obsConfig = composeConfig('observability');
    expect(obsConfig).toMatch(/--config=\/etc\/otelcol\/config\.yaml/);
  });
});
