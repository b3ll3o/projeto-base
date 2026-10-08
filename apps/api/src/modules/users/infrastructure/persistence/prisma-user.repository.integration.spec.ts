// apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.integration.spec.ts
//
// Testes de integração do PrismaUserRepository usando Testcontainers.
//
// - Sobe postgres:16-alpine no beforeAll (uma vez por arquivo via fork pool + singleFork)
// - Aplica migrations Prisma via `prisma migrate deploy`
// - Trunca tabelas entre testes (cleanDatabase)
// - Cobre o contrato do UserRepositoryPort: save (INSERT/UPDATE com optimistic
//   locking), findById, findByEmail, list (cursor + includeDeleted)
//
// pt-BR: o agregado é mutado ANTES do save() (renomear/marcarExcluido/restaurar)
// e o save recebe expectedVersion = version()-1, que é o estado pré-mutação.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../../test/testcontainers-helper.js';
import { PrismaUserRepository } from './prisma-user.repository.js';
import { User } from '../../domain/user.aggregate.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import {
  ConcurrencyException,
  EmailAlreadyInUseException,
} from '../../domain/exceptions/user.exceptions.js';

describe('PrismaUserRepository (Testcontainers)', () => {
  let ctx: TestContext;
  let repo: PrismaUserRepository;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
    repo = new PrismaUserRepository(ctx.prisma);
  });

  it('save (INSERT) + findById round-trip preserva campos essenciais', async () => {
    const u = User.criar({
      nome: 'Ana',
      email: 'ana@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    const saved = await repo.save(u, 0);

    const got = await repo.findById(UserId.create(saved.id().value));
    expect(got).not.toBeNull();
    expect(got!.id().value).toBe(saved.id().value);
    expect(got!.email().value).toBe('ana@example.com');
    expect(got!.nome().value).toBe('Ana');
    expect(got!.version()).toBe(1);
    expect(got!.deletedAt()).toBeNull();
  });

  it('save (UPDATE) com expectedVersion correto persiste e incrementa versão', async () => {
    const u = User.criar({
      nome: 'Carla',
      email: 'carla@example.com',
      agora: new Date(),
    });
    await repo.save(u, 0);

    u.renomear('Carla Maria', new Date());
    const saved = await repo.save(u, u.version() - 1); // expectedVersion=1 (pré-mutação)
    expect(saved.nome().value).toBe('Carla Maria');
    expect(saved.version()).toBe(2);

    const refetched = await repo.findById(UserId.create(saved.id().value));
    expect(refetched!.nome().value).toBe('Carla Maria');
    expect(refetched!.version()).toBe(2);
  });

  it('save (UPDATE) lança ConcurrencyException quando expectedVersion está obsoleto', async () => {
    const u = User.criar({
      nome: 'Bob',
      email: 'bob@example.com',
      agora: new Date(),
    });
    await repo.save(u, 0);

    u.renomear('Bob Silva', new Date());
    // Esperado 999, mas a row está na versão 1 (pré-mutação).
    await expect(repo.save(u, 999)).rejects.toThrow(ConcurrencyException);
  });

  it('softDelete (via save após marcarExcluido) esconde User nas consultas default', async () => {
    const u = User.criar({
      nome: 'Diego',
      email: 'diego@example.com',
      agora: new Date(),
    });
    await repo.save(u, 0);

    u.marcarExcluido('test', new Date());
    await repo.save(u, u.version() - 1);

    expect(await repo.findById(UserId.create(u.id().value))).toBeNull();
    expect(await repo.findByEmail(Email.create('diego@example.com'))).toBeNull();
  });

  it('list com includeDeleted=true devolve soft-deleted', async () => {
    const u = User.criar({
      nome: 'Eva',
      email: 'eva@example.com',
      agora: new Date(),
    });
    await repo.save(u, 0);

    u.marcarExcluido(null, new Date());
    await repo.save(u, u.version() - 1);

    const hidden = await repo.list({ limit: 10 });
    expect(hidden.users.find((x) => x.id().value === u.id().value)).toBeUndefined();

    const shown = await repo.list({ limit: 10, includeDeleted: true });
    const found = shown.users.find((x) => x.id().value === u.id().value);
    expect(found).toBeDefined();
    expect(found!.deletedAt()).toBeInstanceOf(Date);
  });

  it('save (INSERT) com email de um soft-deleted lança EmailAlreadyInUseException, não ConcurrencyException', async () => {
    // pt-BR (2026-10-08): o defeito que este teste cobre foi MEDIDO na suíte
    // e2e de frontend (F4): cadastrar de novo um email que estava soft-deleted
    // respondia **412 CONCURRENCY_CONFLICT** em vez de **409 EMAIL_IN_USE**.
    //
    // A cadeia, toda ela neste repositório:
    //   1. `findByEmail` filtra soft-deleted → o pré-check do use-case diz que o
    //      email está livre;
    //   2. o índice `email @unique` do schema (prisma/schema.prisma:21) NÃO sabe
    //      de `deletedAt` → `prisma.user.create` estoura P2002;
    //   3. o `catch` sem binding transformava QUALQUER erro em
    //      `ConcurrencyException` — e só distinguia recarregando por `id`, que
    //      num conflito de email devolve `null` (a linha vencedora tem outro id);
    //   4. `ConcurrencyException(0, null)` → 412 no filtro de exceção.
    //
    // O critério não é só "lança exceção": é o TIPO. `ConcurrencyException` e
    // `EmailAlreadyInUseException` ficam a mesma linha do HTTP (409), então um
    // teste que afirmasse só `rejects.toThrow()` ficaria verde com o defeito.
    const antigo = User.criar({
      nome: 'Helena',
      email: 'helena@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    await repo.save(antigo, 0);
    antigo.marcarExcluido('test', new Date());
    await repo.save(antigo, antigo.version() - 1);

    const novo = User.criar({
      nome: 'Outra Helena',
      email: 'helena@example.com',
      agora: new Date('2026-09-21T11:00:00Z'),
    });

    // `await expect(...).rejects.toThrow(EmailAlreadyInUseException)` — a
    // classe, não a instância: `ConcurrencyException` NÃO satisfaz isso, que é
    // exatamente a distinção que o 412 escondia.
    await expect(repo.save(novo, 0)).rejects.toThrow(EmailAlreadyInUseException);
  });

  it('save (INSERT) com email livre de soft-delete mas duplicado no mesmo instante segue sendo conflito de email', async () => {
    // pt-BR: o mesmo caminho de código sem o soft-delete por baixo. Sem este
    // par, um "conserto" que passasse a mascarar TODO conflito como
    // ConcurrencyException (o comportamento anterior) ficaria verde.
    const primeiro = User.criar({
      nome: 'Iris',
      email: 'iris@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    await repo.save(primeiro, 0);

    const segundo = User.criar({
      nome: 'Outra Iris',
      email: 'iris@example.com',
      agora: new Date('2026-09-21T11:00:00Z'),
    });

    await expect(repo.save(segundo, 0)).rejects.toThrow(EmailAlreadyInUseException);
  });

  it('save (INSERT) com email realmente livre persiste sem tocar em ConcurrencyException', async () => {
    // pt-BR: o contrafactual. Um conserto que transformasse qualquer erro de
    // create em EmailAlreadyInUseException — inclusive uma falha de conexão —
    // passaria nos dois testes acima e quebraria a aplicação. Este é o que
    // segura essa regressão.
    const u = User.criar({
      nome: 'Joana',
      email: 'joana@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    const saved = await repo.save(u, 0);
    expect(saved.email().value).toBe('joana@example.com');
  });

  it('save (INSERT) com falha que NÃO é unicidade propaga o erro original, sem inventar "email em uso"', async () => {
    // pt-BR: o terceiro ramo do `catch`, que é o que impede o conserto de virar
    // uma mentira MAIOR. Os dois testes acima fixam que colisão de email dá
    // `EmailAlreadyInUseException`; nenhum deles diz o que fazer quando o erro
    // é outra coisa. Um `catch` que respondesse "email em uso" para QUALQUER
    // falha passaria por ambos — porque nenhum dos dois provoca uma falha que
    // não seja de unicidade. Este provoca.
    //
    // O repositório recebe o `PrismaClient` pelo construtor, então um objeto com
    // o mesmo formato e um `create` que rejeita é suficiente — não é mock de
    // framework, é a porta que o repositório realmente usa.
    const falha = new Error('conexão perdida com o banco');
    const prismaQuebrado = {
      user: {
        findUnique: ctx.prisma.user.findUnique.bind(ctx.prisma.user),
        create: async (): Promise<never> => {
          throw falha;
        },
      },
    } as unknown as typeof ctx.prisma;

    const u = User.criar({
      nome: 'Karla',
      email: 'karla@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });

    // Nem `EmailAlreadyInUseException` (409) nem `ConcurrencyException` (412):
    // o erro original. Um erro desconhecido é 500 — dizer que é conflito de
    // email seria afirmar uma causa que ninguém mediu.
    await expect(new PrismaUserRepository(prismaQuebrado).save(u, 0)).rejects.toThrow(falha);
  });

  it('save (UPDATE) com email de um soft-deleted lança EmailAlreadyInUseException, não erro cru', async () => {
    // pt-BR (2026-10-08): a MESMA classe de defeito do INSERT, na metade que o
    // conserto anterior não cobriu. `atualizarEmail` (user-use-cases.ts:175)
    // faz o pré-check com `findByEmail`, que filtra soft-deleted — então o
    // use-case libera a mutação, e o `updateMany` bate no mesmo índice
    // `@unique` que não sabe de `deletedAt`.
    //
    // A diferença de sintoma é o que torna isto fácil de deixar passar: no
    // INSERT o `catch` existed e mascarava tudo como 412; no UPDATE NÃO HÁ
    // `catch` nenhum, o P2002 escapa cru, e um erro de Prisma sem tradução é
    // **500**. Um email que o usuário lê como "já cadastrado" chega à tela como
    // erro genérico de servidor — sem campo, sem mensagem, com um traceId.
    //
    // O critério é o TIPO pelo mesmo motivo do teste do INSERT: as duas
    // exceções de domínio estão a uma linha do mesmo HTTP, então afirmar só
    // `rejects.toThrow()` deixaria o defeito passar.
    const antigo = User.criar({
      nome: 'Iara',
      email: 'iara@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    await repo.save(antigo, 0);
    antigo.marcarExcluido('test', new Date());
    await repo.save(antigo, antigo.version() - 1);

    const alvo = User.criar({
      nome: 'Bruno',
      email: 'bruno@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    const salvo = await repo.save(alvo, 0);

    salvo.alterarEmail('iara@example.com', new Date('2026-09-21T12:00:00Z'));

    await expect(repo.save(salvo, salvo.version() - 1)).rejects.toThrow(EmailAlreadyInUseException);
  });

  it('save (UPDATE) com email realmente livre continua persistindo', async () => {
    // O contrafactual do UPDATE. Sem ele, um `catch` que respondesse
    // "email em uso" para QUALQUER falha do `updateMany` — inclusive uma
    // conexão caída — ficaria verde no teste acima.
    const alvo = User.criar({
      nome: 'Carla',
      email: 'carla@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    const salvo = await repo.save(alvo, 0);

    salvo.alterarEmail('carla.nova@example.com', new Date('2026-09-21T12:00:00Z'));
    const depois = await repo.save(salvo, salvo.version() - 1);

    expect(depois.email().value).toBe('carla.nova@example.com');
  });

  it('save (UPDATE) com falha que NÃO é unicidade propaga o erro original', async () => {
    // pt-BR: o terceiro ramo, agora no UPDATE. Sem este, a correção do UPDATE
    // viria junto com a mesma mentira que o INSERT já teve: afirmar "email em
    // uso" para uma falha de conexão é inventar causa.
    const alvo = User.criar({
      nome: 'Dani',
      email: 'dani@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    const salvo = await repo.save(alvo, 0);
    salvo.alterarEmail('dani.nova@example.com', new Date('2026-09-21T12:00:00Z'));

    const falha = new Error('conexão perdida com o banco');
    const prismaQuebrado = {
      user: {
        findUnique: ctx.prisma.user.findUnique.bind(ctx.prisma.user),
        updateMany: async (): Promise<never> => {
          throw falha;
        },
      },
    } as unknown as typeof ctx.prisma;

    await expect(
      new PrismaUserRepository(prismaQuebrado).save(salvo, salvo.version() - 1),
    ).rejects.toThrow(falha);
  });

  it('save (UPDATE) com email duplicado por OUTRO usuário vivo também dá EmailAlreadyInUseException', async () => {
    // pt-BR: o par que fecha a classe. O teste de soft-delete acima prova a
    // colisão pouco óbvia; este prova a ÓBVIA, que é a que o `updateMany`
    // alcança sem soft-delete nenhum. Um conserto que tratasse P2002 como
    // "conflito de concorrência" (o comportamento anterior no INSERT) passaria
    // no primeiro e falharia aqui.
    const primeiro = User.criar({
      nome: 'Elis',
      email: 'elis@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    await repo.save(primeiro, 0);

    const segundo = User.criar({
      nome: 'Otto',
      email: 'otto@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    const salvo = await repo.save(segundo, 0);
    salvo.alterarEmail('elis@example.com', new Date('2026-09-21T12:00:00Z'));

    await expect(repo.save(salvo, salvo.version() - 1)).rejects.toThrow(EmailAlreadyInUseException);
  });

  it('restore (via save após restaurar) devolve User com deletedAt=null e version incrementada', async () => {
    const u = User.criar({
      nome: 'Fabi',
      email: 'fabi@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    await repo.save(u, 0);
    u.marcarExcluido('test', new Date('2026-09-21T11:00:00Z'));
    await repo.save(u, u.version() - 1);

    expect(u.deletedAt()).toBeInstanceOf(Date);
    expect(u.version()).toBe(2);

    u.restaurar(new Date('2026-09-21T12:00:00Z'));
    await repo.save(u, u.version() - 1);

    const found = await repo.findById(UserId.create(u.id().value));
    expect(found).not.toBeNull();
    expect(found!.deletedAt()).toBeNull();
    expect(found!.version()).toBe(3);
  });

  it('findByEmail retorna null para email inexistente ou soft-deleted', async () => {
    expect(await repo.findByEmail(Email.create('nobody@example.com'))).toBeNull();

    const u = User.criar({
      nome: 'Gabi',
      email: 'gabi@example.com',
      agora: new Date(),
    });
    await repo.save(u, 0);
    expect((await repo.findByEmail(Email.create('gabi@example.com')))?.id().value).toBe(
      u.id().value,
    );

    u.marcarExcluido(null, new Date());
    await repo.save(u, u.version() - 1);
    expect(await repo.findByEmail(Email.create('gabi@example.com'))).toBeNull();
  });

  it('list pagina por cursor opaco (id)', async () => {
    for (const nome of ['Gabriel', 'Helen', 'Ivan']) {
      const u = User.criar({
        nome,
        email: `${nome.toLowerCase()}@example.com`,
        agora: new Date(),
      });
      await repo.save(u, 0);
    }

    const page1 = await repo.list({ limit: 2 });
    expect(page1.users).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await repo.list({ limit: 2, cursor: page1.nextCursor });
    expect(page2.users).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });
});
