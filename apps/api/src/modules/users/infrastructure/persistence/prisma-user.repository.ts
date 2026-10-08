// apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.ts
//
// Implementação Prisma do UserRepositoryPort (Fase 6).
//
// - save(user, expectedVersion): faz INSERT (expectedVersion=0) ou UPDATE
//   com `updateMany WHERE version=expected` para optimistic locking. Nos DOIS
//   caminhos, colisão de `email` (P2002 → EmailAlreadyInUseException, 409) é
//   distinguida de race no `id` (→ ConcurrencyException, 412) e de qualquer
//   outra falha (→ propaga o erro original) — ver `traduzirFalhaDeUnicidade`.
//   O `email @unique` do schema não sabe de `deletedAt`, então a colisão é real
//   mesmo quando `findByEmail` diz que o email está livre.
// - findById/findByEmail: filtram soft-deleted por padrão (retornam null).
// - list: cursor opaco (id do último item), respeita includeDeleted.
//
// pt-BR: o agregado devolvido pelo repositório é um snapshot via
// `User.restaurarDePersistencia` — mutações no agregado retornado NÃO
// afetam o que está no banco (analogia com o clone() do InMemoryUserRepository).
// O `User.criar` é chamado pelos use-cases; aqui só persistimos.

import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service.js';
import type {
  UserRepositoryPort,
  UserListInput,
  UserListResult,
  FindByIdOptions,
} from '../../domain/ports/user-repository.port.js';
import type { User } from '../../domain/user.aggregate.js';
import type { UserId } from '../../domain/value-objects/user-id.vo.js';
import type { Email } from '../../domain/value-objects/email.vo.js';
import {
  ConcurrencyException,
  EmailAlreadyInUseException,
} from '../../domain/exceptions/user.exceptions.js';
import { UserPrismaMapper, type UserRow } from './user.prisma-mapper.js';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  /**
   * pt-BR: `@Inject(PrismaService)` é necessário porque o param é
   * tipado como `PrismaClient` (interface material — classe concreta
   * mas não a que está registrada no container). Sem o token explícito,
   * NestJS + emitDecoratorMetadata não conseguem resolver (apenas
   * `PrismaService` está em `PrismaModule.providers`). Bug latente
   * descoberto pelos testes e2e (Task 7.7).
   */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  /**
   * Persiste o agregado respeitando optimistic locking.
   *
   * - INSERT (criar novo): só permitido se expectedVersion === 0 e a row
   *   ainda não existe.
   * - UPDATE (mutação): faz `updateMany WHERE id=? AND version=expectedVersion`.
   *   Se `count === 0`, recarrega a versão atual e lança ConcurrencyException
   *   com a divergência observada.
   *
   * Devolve o agregado persistido (snapshot via User.restaurarDePersistencia).
   */
  async save(user: User, expectedVersion: number): Promise<User> {
    const row = UserPrismaMapper.toPersistence(user);
    const id = user.id().value;

    // INSERT path: row ainda não existe no banco.
    // Usamos `create` direto; um conflito de unicidade aqui tem DUAS causas
    // possíveis — race no `id` (outro processo gravou o mesmo id) e colisão no
    // `email` (@unique que não sabe de `deletedAt`). O `catch` abaixo separa as
    // duas em vez de tratar as duas como conflito de concorrência.
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (existing === null) {
      if (expectedVersion !== 0) {
        // Caller disse que esperava versão N>0 mas o agregado sumiu.
        throw new ConcurrencyException(expectedVersion, null);
      }
      try {
        await this.prisma.user.create({ data: row });
      } catch (erro) {
        throw await this.traduzirFalhaDeUnicidade(erro, {
          id,
          email: row.email,
          expectedVersion,
          esperavaLinhaAusente: true,
        });
      }
      return this.loadSnapshot(id);
    }

    // UPDATE path: aplica lock otimista via WHERE version=expected.
    //
    // pt-BR (2026-10-08): o `try`/`catch` NÃO é decoração. O `updateMany` grava
    // `email`, e o índice `@unique` do schema (prisma/schema.prisma:21) não
    // sabe de `deletedAt` — a linha soft-deleted continua segurando o email.
    // O pré-check de `atualizarEmail` (user-use-cases.ts:175) usa
    // `findByEmail`, que filtra soft-deleted, então ele libera a mutação e o
    // P2002 estoura aqui. Sem tradução, esse erro cru vira **500**: um email
    // que o usuário lê como "já cadastrado" chega à tela como falha genérica
    // de servidor. É a MESMA classe de defeito do INSERT, na metade que o
    // conserto do INSERT não cobria.
    let updated;
    try {
      updated = await this.prisma.user.updateMany({
        where: { id, version: expectedVersion },
        data: {
          email: row.email,
          name: row.name,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
          deletedAt: row.deletedAt,
          deletedBy: row.deletedBy,
          // Não incrementamos version manualmente — confiamos no mutator que já
          // bumped no agregado; só persistimos o estado final.
          version: row.version,
        },
      });
    } catch (erro) {
      throw await this.traduzirFalhaDeUnicidade(erro, {
        id,
        email: row.email,
        expectedVersion,
        esperavaLinhaAusente: false,
      });
    }

    if (updated.count === 0) {
      const actual = await this.prisma.user.findUnique({ where: { id } });
      throw new ConcurrencyException(expectedVersion, actual?.version ?? null);
    }

    return this.loadSnapshot(id);
  }

  /**
   * Devolve a exceção de domínio que corresponde a uma falha do Prisma.
   *
   * DEVOLVE, não lança — e o chamador escreve `throw await …`. Isso não é
   * estilo: a primeira versão lançava e retornava `Promise<never>`, e o `tsc`
   * acusou `'updated' is possibly 'undefined'` no UPDATE. O estreitamento por
   * `never` não atravessa `await` (a promise pode rejeitar), então o `let
   * updated` ficava possivelmente indefinido para o compilador — bem visto,
   * porque é isso que o fluxo diz. Devolver a exceção deixa o `throw` no
   * chamador, onde ele é inequívoco.
   *
   * pt-BR (2026-10-08): esta é a única implementação das três perguntas, e ela
   * atende INSERT e UPDATE. Antes havia a lógica só no `catch` do INSERT, com
   * um `catch` NO UPDATE inexistente — e o defeito que a suíte e2e mediu
   * (fluxo F4, 412 onde o contrato pede 409) é o mesmo nos dois caminhos, com
   * sintomas diferentes: no INSERT virava 412, no UPDATE virava 500.
   *
   * As três perguntas, nesta ordem — a ordem é o que dá o tipo certo:
   *
   *   1. A linha que deveria ter SUMIDO (`create` falhou e ela apareceu)?
   *      → race de concorrência (412). Esta pergunta só tem sentido quando
   *      `esperavaLinhaAusente` é verdadeiro — ver o MEDIDO abaixo.
   *   2. P2002? → violação de unicidade. Depois de (1) — quando ela se aplica —
   *      negativa, o único `@unique` que sobra é o `email` (schema.prisma:21).
   *      → 409.
   *   3. Qualquer outra coisa (conexão caiu, etc.) → propaga o erro original.
   *      Ela virava 412, o que afirmava "outro processo gravou" sem nenhuma
   *      evidência disso. Um erro desconhecido é 500, não 412.
   *
   * ── MEDIDO: a pergunta 1 precisa saber em que caminho está ────────────────
   *
   * A primeira versão desta extração perguntava "alguém gravou este id?" nos DOIS
   * caminhos, e o `updateMany` falhando com P2002 dava `ConcurrencyException`
   * — "versão esperada 1, encontrada 1", que não só é o tipo errado como é
   * FALSO: a linha existe e está na versão esperada, porque foi o próprio
   * `updateMany` que a encontrou. No INSERT a pergunta é a original; no UPDATE
   * ela é a NEGAÇÃO da precondição, e por isso responde sempre "sim".
   *
   * Não dá para inferir o caminho pelo erro, nem pelo `expectedVersion` (que é
   * 0 no INSERT e N>0 nos dois casos de UPDATE). Por isso o caminho é declarado
   * pelo chamador, e o teste que prova isso é o de email duplicado por outro
   * usuário VIVO: é o único em que o `id` procurado existe e o P2002 vem
   * mesmo assim.
   *
   * O ramo 3 tem teste próprio (com um `PrismaClient` que rejeita), porque os
   * dois primeiros provocam P2002 e nenhum deles diz o que fazer quando o erro
   * é outra coisa. Um `catch` que respondesse "email em uso" para QUALQUER
   * falha passaria por ambos.
   */
  private async traduzirFalhaDeUnicidade(
    erro: unknown,
    contexto: {
      id: string;
      email: string;
      expectedVersion: number;
      esperavaLinhaAusente: boolean;
    },
  ): Promise<unknown> {
    if (contexto.esperavaLinhaAusente) {
      const atual = await this.prisma.user.findUnique({ where: { id: contexto.id } });
      if (atual !== null) {
        return new ConcurrencyException(contexto.expectedVersion, atual.version);
      }
    }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return new EmailAlreadyInUseException(contexto.email);
    }
    return erro;
  }

  /**
   * findById com filtro de soft-delete opcional.
   *
   * - Default: retorna null se `deletedAt !== null` (caminho de produção).
   * - `options.includeDeleted === true`: retorna o agregado mesmo soft-deleted,
   *   usado por fluxos que precisam operar sobre ele (ex: `UserUseCases.restaurar`).
   */
  async findById(id: UserId, options?: FindByIdOptions): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id: id.value } });
    if (row === null) return null;
    if (!options?.includeDeleted && row.deletedAt !== null) return null;
    return UserPrismaMapper.toDomain(row);
  }

  /**
   * findByEmail: o VO já normaliza para lowercase. Filtra soft-deleted.
   */
  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email: email.value } });
    if (row === null) return null;
    if (row.deletedAt !== null) return null;
    return UserPrismaMapper.toDomain(row);
  }

  /**
   * Lista com cursor opaco (id do último item) e includeDeleted opcional.
   * Ordena por createdAt desc para casar com o índice do schema; usa id como
   * tie-breaker determinístico via ordem do id.
   */
  async list(input: UserListInput): Promise<UserListResult> {
    const includeDeleted = input.includeDeleted === true;
    const where = includeDeleted ? {} : { deletedAt: null };

    // Cursor opaco = id da última row da página anterior; pegamos `take=limit+1`
    // para detectar se há próxima página sem count(*) custoso.
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.user.findMany({
      where,
      ...(cursor ? { cursor, skip: 1 } : {}),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page[page.length - 1];
    return {
      users: page.map((r: UserRow) => UserPrismaMapper.toDomain(r)),
      nextCursor: hasMore && last !== undefined ? last.id : null,
    };
  }

  /**
   * Snapshot defensivo do agregado (recupera fresh do banco para evitar
   * que mutações no agregado devolvido pelo caller afetem o que está
   * persistido). Espelha o `clone()` do InMemoryUserRepository.
   */
  private async loadSnapshot(id: string): Promise<User> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    if (row === null) {
      // Em teoria inalcançável: só chamamos após persistir. Se acontecer,
      // propaga como ConcurrencyException(expectedVersion=?, actual=null).
      throw new ConcurrencyException(-1, null);
    }
    return UserPrismaMapper.toDomain(row);
  }
}
