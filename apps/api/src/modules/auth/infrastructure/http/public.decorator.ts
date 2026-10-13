// apps/api/src/modules/auth/infrastructure/http/public.decorator.ts
//
// Marcador de rota pública.
//
// ── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
//
// O `JwtAuthGuard` é aplicado na CLASSE (`@UseGuards(JwtAuthGuard)` em
// `UsersController`), e a decisão D-2 exige que `POST /users` continue
// PÚBLICO. Um `@UseGuards` no método NÃO removeria o guard da classe — os
// dois decoradores se SOMAM. O jeito idiomático de carve-out é metadata: o
// handler marca-se como público e o guard consulta o `Reflector` no início
// de `canActivate`.
//
// Alternativa descartada: um guarda global (`APP_GUARD`) com a lista de
// rotas públicas em vez de metadata. Trocaria um marcador declarativo no
// ponto de uso por uma lista centralizada que precisa ser lembrada — e
// esquecer uma rota nova a tranca silenciosamente.
//
// O uso de `SetMetadata` + `Reflector.getAllAndOverride` (e não `get`) é o
// que faz o método vencer a classe: `getAllAndOverride` percorre handler
// primeiro e para no primeiro que define a chave.
//
// ── POR QUE NÃO HÁ METADATA DE SWAGGER AQUI ──────────────────────────────────
//
// MEDIDO 2026-10-13: o `openapi.json` versionado anunciava
//
//   POST /api/v1/users  security=[{"bearer": []}]   ← cadastro ABERTO (D-2)
//   GET  /api/v1/users  security=[{"bearer": []}]
//
// As duas linhas idênticas. Nenhum teste de REQUEST acusa isso — a rota
// responde 201 sem token, o guard está certo. O defeito era SÓ no contrato.
//
// A causa 1: `@ApiSecurity('bearer', [])` produz `[{ bearer: [] }]`, byte a
// byte o que `@ApiBearerAuth()` produz. Os dois overloads do `ApiSecurity`
// (`name` e `securityObject`) não têm forma de emitir o array VAZIO que o
// OpenAPI define como "operação sem requisito de segurança".
//
// A causa 2, e a que fecha o caso: a metadata CRUA até emitiria `[]` — e o
// `@nestjs/swagger@11.4.7` a descarta. `swagger-explorer.js:123` faz
//
//   omitBy(methodMetadata, isEmpty)
//
// e o `isEmpty` do lodash responde `true` para `[]`. Não existe
// `operationBuilderFactory` nesta versão (medido em
// `SwaggerDocumentOptions`), então não há gancho suportado para escapar
// disso. `security: []` é INALCANÇÁVEL por metadata neste swagger — tentá-lo
// deixa código morto que aparenta funcionar.
//
// ── COMO ENTÃO O DOCUMENTO DECLARA A ROTA PÚBLICA ────────────────────────────
//
// Por AUSÊNCIA da chave `security` na operação. Isso está correto ENQUANTO o
// documento não tiver `security` global — e o `DocumentBuilder` de
// `scripts/export-openapi.ts` não define um (só `addBearerAuth()`, que
// registra o ESQUEMA, não o requisito).
//
// A diferença entre "ausente" e "`[]`" é invisível hoje e letal se alguém
// adicionar um requisito global ao `DocumentBuilder`. A spec
// `users.controller.auth.spec.ts` → "o carve-out público sobrevive ao OpenAPI"
// afirma AS DUAS coisas juntas (ausência em `POST /users` E ausência de
// `security` global): é ela que quebra se qualquer uma mudar. A garantia
// mora no teste, não neste decorator — que por isso segue sendo só guard.

import { SetMetadata } from '@nestjs/common';

/** Chave de metadata lida pelo `JwtAuthGuard`. */
export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Libera a rota do `JwtAuthGuard`.
 *
 * O carve-out no documento OpenAPI é consequência disto: ver o bloco acima.
 *
 * @example
 * ```ts
 * @Post()
 * @Public()
 * async create(...) {}
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
