// apps/api/src/modules/auth/infrastructure/persistence/prisma-refresh-token.repository.ts
//
// Adapter Prisma do REGISTRO de refresh tokens (#132).
//
// ── POR QUE A CREDENCIAL DE SISTEMA, E NÃO A DE RUNTIME ─────────────────────
//
// O caminho de request (o guard, os controllers) nunca chega nesta tabela:
// login, refresh e logout falam com ela pelo bucket de SISTEMA —
// `comEscopoDeSistema`, que usa a `SYSTEM_DATABASE_URL` (a credencial que
// o `app_system` tem). E a migration `20261108000000_refresh_tokens` faz
// `REVOKE ALL … FROM app_runtime`: a credencial que a doc do repo classifica
// como "a que mais vaza" NÃO alcança esta tabela — e sem esse REVOKE ela
// podia DESREVOGAR qualquer refresh token (um `UPDATE … SET revoked_at =
// NULL`), o que trocaria o controle (revogação) por um controle menor.
//
// ⚠️ A tabela tem `user_id` e NÃO tem `tenant_id`, e por isso NÃO tem RLS: o
// predicado de escopo do banco (`no_escopo_atual`) compara a coluna com a
// EMPRESA (`app.tenant_id`), e aqui a coluna é o USUÁRIO. Não há policy que
// case as duas — e uma policy que não filtra nada é pior do que nenhuma.

import { Injectable } from '@nestjs/common';
import { comEscopoDeSistema } from '../../../../shared/infrastructure/prisma/escopo.js';
import type {
  EstadoDeRefreshToken,
  RefreshTokenRepositoryPort,
} from '../../domain/ports/refresh-token-repository.port.js';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepositoryPort {
  // ⚠️ SEM CONSTRUTOR, e sem `PrismaService`: o cliente que esta classe
  // usa é o de SISTEMA, e ele vem do AMBIENTE (`comEscopoDeSistema` resolve
  // o `SYSTEM_DATABASE_URL`). Injetar o `PrismaService` (o cliente de
  // RUNTIME) seria ruído que sugere o oposto do que o código faz — e o
  // `PrismaService` é `@Global()`, então ele existe de qualquer jeito.

  async registrar(jti: string, userId: string, expiresAt: Date): Promise<void> {
    await comEscopoDeSistema(async (tx) => {
      await tx.refreshToken.upsert({
        where: { jti },
        create: { jti, userId, expiresAt },
        // ⚠️ O `update` NÃO ressuscita um token revogado: um `jti` é
        // único por construção (`randomUUID`), e a linha existe — ou não
        // existe. Reescrever o `revokedAt` aqui abriria a porta de um
        // `registrar` repetido para DESPREVOGAR.
        update: { expiresAt },
      });
    });
  }

  async estadoDe(jti: string): Promise<EstadoDeRefreshToken> {
    const linha = await comEscopoDeSistema(async (tx) =>
      tx.refreshToken.findUnique({
        where: { jti },
        select: { revokedAt: true, userId: true },
      }),
    );
    if (linha === null) return { registrado: false, revogadoEm: null, userId: null };
    return { registrado: true, revogadoEm: linha.revokedAt, userId: linha.userId };
  }

  async revogar(jti: string): Promise<boolean> {
    return comEscopoDeSistema(async (tx) => {
      // ⚠️ O `where` com `revokedAt: null` é o que torna a revogação
      // ATÔMICA: só um dos dois chamadores concorrentes consegue marcar a
      // linha, e o outro recebe `count = 0`. É o que fecha a corrida da
      // rotação (dois refreshes simultâneos com o mesmo token).
      const revogados = await tx.refreshToken.updateMany({
        where: { jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return revogados.count === 1;
    });
  }

  async rotacionar(
    jtiAntigo: string,
    jtiNovo: string,
    userId: string,
    expiresAt: Date,
  ): Promise<boolean> {
    return comEscopoDeSistema(async (tx) => {
      // ⚠️ O CONSUMO e o REGISTRO na MESMA transação: se o processo morresse
      // entre eles, o token antigo já estaria consumido e o novo nunca
      // entraria no registro — e quem pegasse o intervalo ficaria SEM
      // refresh token nenhum, sem caminho de recuperação.
      //
      // O consumo primeiro, e o registro só DEPOIS: se o consumo falhar
      // (o `jti` já tinha sido usado), o `throw` desfaz a transação — e o
      // registro novo também.
      const consumidos = await tx.refreshToken.updateMany({
        where: { jti: jtiAntigo, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (consumidos.count !== 1) return false;

      await tx.refreshToken.create({ data: { jti: jtiNovo, userId, expiresAt } });
      return true;
    });
  }

  async revogarTodosDoUsuario(userId: string): Promise<void> {
    await comEscopoDeSistema(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }
}
