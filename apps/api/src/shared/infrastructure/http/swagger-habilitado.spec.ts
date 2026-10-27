// apps/api/src/shared/infrastructure/http/swagger-habilitado.spec.ts
//
// pt-BR (#122): o `/api/docs` era montado sem Condição, inclusive em
// produção. Esta spec trava a DECISÃO — e a decisão é o que a spec mede,
// porque `main.ts` chama `bootstrap()` no carregamento do módulo: um spec
// que o importasse subiria a API inteira.

import { describe, it, expect } from 'vitest';
import { swaggerHabilitado } from './swagger-habilitado.js';

describe('swaggerHabilitado()', () => {
  // ── default-deny ─────────────────────────────────────────────────────────
  it('DESABILITA em produção', () => {
    expect(swaggerHabilitado({ NODE_ENV: 'production' })).toBe(false);
  });

  it('DESABILITA quando NODE_ENV está AUSENTE', () => {
    // Default-deny: `NODE_ENV` ausente não é "não é produção", é "não se
    // sabe o que é". Um ambiente que esqueceu a variável não publica a
    // API por acidente.
    expect(swaggerHabilitado({})).toBe(false);
  });

  it('DESABILITA em staging', () => {
    expect(swaggerHabilitado({ NODE_ENV: 'staging' })).toBe(false);
  });

  it('HABILITA em development', () => {
    // O Compose de dev FORÇA `NODE_ENV: development`
    // (docker-compose.dev.yml:5), então o dev não perde o Swagger.
    expect(swaggerHabilitado({ NODE_ENV: 'development' })).toBe(true);
  });

  // ── a flag explícita manda nos dois sentidos ────────────────────────────
  it('a flag HABILITA em qualquer ambiente', () => {
    expect(swaggerHabilitado({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })).toBe(true);
    expect(swaggerHabilitado({ NODE_ENV: 'production', SWAGGER_ENABLED: '1' })).toBe(true);
    expect(swaggerHabilitado({ SWAGGER_ENABLED: 'true' })).toBe(true);
  });

  it('a flag DESABILITA em qualquer ambiente', () => {
    expect(swaggerHabilitado({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' })).toBe(false);
    expect(swaggerHabilitado({ NODE_ENV: 'development', SWAGGER_ENABLED: '0' })).toBe(false);
  });

  it('a flag ignora caixa e espaços', () => {
    expect(swaggerHabilitado({ NODE_ENV: 'production', SWAGGER_ENABLED: ' TRUE ' })).toBe(true);
    expect(swaggerHabilitado({ NODE_ENV: 'production', SWAGGER_ENABLED: 'False' })).toBe(false);
  });

  it('uma flag INCONHUTA cai no default (desabilitado em produção)', () => {
    // Uma flag mal escrita não pode virar "habilitado": o default é o
    // caminho seguro.
    expect(swaggerHabilitado({ NODE_ENV: 'production', SWAGGER_ENABLED: 'talvez' })).toBe(false);
    expect(swaggerHabilitado({ NODE_ENV: 'production', SWAGGER_ENABLED: '' })).toBe(false);
  });
});
