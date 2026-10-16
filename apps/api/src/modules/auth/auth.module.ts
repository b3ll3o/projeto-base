// apps/api/src/modules/auth/auth.module.ts
//
// AuthModule — desde da autenticação (BC Auth).
//
// ── O QUE ESTE MÓDULO EXPORTE, E POR QUE ISSO IMPORTA ──────────────────────
//
// `JwtAuthGuard` e `TOKEN_ISSUER_PORT`. O `UsersModule` importa o
// `AuthModule` para RESOLVER o guard em `@UseGuards(JwtAuthGuard)` no
// `UsersController`.
//
// A direção da aresta é `users → auth`, e nunca o contrário. Se o
// `UsersController` importasse o ARQUIVO do guard direto
// (`../../../auth/infrastructure/http/jwt-auth.guard.js`), o módulo `auth`
// continuaria importando `users/` (para `PASSWORD_HASHER_PORT` e
// `USER_REPOSITORY_PORT`) e o par formaria um ciclo de import ES — que em
// ESM não falha "às vezes": executa o módulo parcialmente inicializado e a
// classe exportada no momento do acesso é `undefined`. Por isso o guard é
// resolvido pelo CONTAINER (module + DI), não por caminho de arquivo.
//
// ── `AUTH_GUARD_SLOT` ───────────────────────────────────────────────────────
//
// O guard é provider do AuthModule e tem dois nomes: a classe
// (`JwtAuthGuard`, que é o que `@UseGuards` pede) e um token estável
// (`AUTH_GUARD_SLOT`). O token existe para que o binding do guard NÃO
// mude de forma quando ele for substituído — um consumidor que importasse
// o símbolo diretamente passaria a acoplar na implementação. Quem escreve
// `@UseGuards(...)` usa a classe; quem registra provider usa o slot.
//
// ── `JWT_SECRET` SEM DEFAULT ────────────────────────────────────────────────
//
// `JwtTokenService` (em `infrastructure/security/`) lê `JWT_SECRET` no
// CONSTRUTOR e lança quando ausente — ou seja, o boot aborta na
// instanciação do provider, e não no primeiro login. Um default embutido no
// repositório seria um segredo que ninguém rotaciona e que vaza no
// `git log`. Os testes recebem um valor via `test.env` no
// `vitest.config.ts` — credencial DE TESTE, não de produção.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthUseCases, AUTH_USE_CASES } from './application/auth-use-cases.js';
import { AuthController } from './infrastructure/http/auth.controller.js';
import { JwtAuthGuard } from './infrastructure/http/jwt-auth.guard.js';
import { JwtTokenService } from './infrastructure/security/jwt-token.service.js';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher.js';
import { TOKEN_ISSUER_PORT } from './domain/ports/token-issuer.port.js';
import { PASSWORD_HASHER_PORT } from '../users/domain/ports/password-hasher.port.js';
import { PrismaPersistenceModule } from '../users/infrastructure/prisma-persistence.module.js';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module.js';
import { UserProfileCacheService } from '../../shared/infrastructure/security/user-profile-cache.service.js';

/**
 * Token estável do guard de autenticação.
 *
 * Provider e exportado com este nome; a classe `JwtAuthGuard` é o mesmo
 * objeto. Ver a nota "AUTH_GUARD_SLOT" no topo.
 */
export const AUTH_GUARD_SLOT = JwtAuthGuard;

@Module({
  imports: [
    ConfigModule,
    // pt-BR: `JwtService` sem segredo aqui — o segredo é repassado por
    // CHAMADA no `JwtTokenService`, que o lê no construtor. Assim a recusa
    // do boot acontece na instanciação do provider, que é anterior a
    // qualquer request, em vez de no primeiro login.
    JwtModule.register({}),
    // `auth → users`: só a DIREÇÃO certa (port + repositório implementados
    // pelos use cases de auth, registrados aqui).
    PrismaPersistenceModule,
    // pt-BR: `PrismaModule` é `@Global()`, mas "global" quer dizer "não
    // precisa ser importado por quem consome" — NÃO "existe sozinho".
    // Se o `AuthModule` for a raiz do grafo (como nos specs de DI, que não
    // sobrem o `AppModule`), sem esta linha o `PrismaUserRepository`
    // recebe `PrismaService` como `undefined`.
    PrismaModule,
  ],
  controllers: [AuthController],
  providers: [
    // pt-BR: `@Inject(TOKEN)` explícito em todo provider cujo parâmetro é
    // interface. `tsx` (esbuild) não emite `design:paramtypes`, então sem
    // o token o Nest resolve `undefined` e o defeito só se manifesta em
    // dev, no primeiro request.
    { provide: AUTH_USE_CASES, useClass: AuthUseCases },
    { provide: TOKEN_ISSUER_PORT, useClass: JwtTokenService },
    { provide: PASSWORD_HASHER_PORT, useClass: Argon2PasswordHasher },
    { provide: AUTH_GUARD_SLOT, useClass: JwtAuthGuard },
    // pt-BR (#93.1 — RBAC, 2026-10-16): cache do guard. Registrado aqui
    // e não em ProfilesModule para evitar ciclo (auth ← profiles ← auth
    // via `obterPerfilDoUsuario`). ProfilesModule também o registra (tem
    // `invalidateAll` no fim de transações), mas o cache é singleton —
    // o Nest reusa a mesma instância em todo o grafo.
    UserProfileCacheService,
  ],
  exports: [AUTH_GUARD_SLOT, TOKEN_ISSUER_PORT, AUTH_USE_CASES, PASSWORD_HASHER_PORT],
})
export class AuthModule {}
