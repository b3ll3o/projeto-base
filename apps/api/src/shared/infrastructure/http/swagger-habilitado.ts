// apps/api/src/shared/infrastructure/http/swagger-habilitado.ts
//
// pt-BR (#122): o documento OpenAPI era montado SEM CONDIÇÃO — em qualquer
// ambiente, inclusive em produção. O `/api/docs` expõe a superfície completa
// da API (rotas, schemas, requisitos de auth) a quem descobrir a URL.
//
// A assimetria que o achado denuncia: 20 linhas acima, o CORS ABORTA o
// bootstrap em produção quando `ALLOWED_ORIGINS` tem o default de dev. A
// API já sabia recusar o que é de dev — e o Swagger ficava do lado de fora
// dessa decisão.
//
// ⚠️ Default-DENY, e não "habilitado fora de produção": `NODE_ENV` ausente
// não é "não é produção", é "não se sabe o que é". O Compose de dev FORÇA
// `NODE_ENV: development` (docker-compose.dev.yml:5), então o dev não perde
// o Swagger — e um ambiente que esqueceu a variável não publica a API
// por acidente. É o mesmo default-deny do `JWT_SECRET` (ADR-0002) e do admin
// local do seed (PR #115).
//
// A decisão é uma FUNÇÃO PURA, e não um `if` no bootstrap: `main.ts` chama
// `bootstrap()` no carregamento do módulo, então um spec que o importasse
// subiria a API inteira. A spec deste arquivo pega a decisão sozinha.

/** O ambiente mínimo que a decisão precisa. */
export interface AmbienteDoSwagger {
  NODE_ENV?: string;
  SWAGGER_ENABLED?: string;
}

/**
 * Decide se o Swagger é montado.
 *
 * `SWAGGER_ENABLED` tem precedência explícita nos dois sentidos; sem ele, o
 * Swagger só existe em `development`.
 */
export function swaggerHabilitado(env: AmbienteDoSwagger): boolean {
  const flag = env.SWAGGER_ENABLED?.trim().toLowerCase();

  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;

  // Sem flag explícita: só `development` tem Swagger.
  return env.NODE_ENV?.trim().toLowerCase() === 'development';
}
