import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserUseCases } from './user-use-cases.js';
import { InMemoryUserRepository } from '../infrastructure/persistence/in-memory-user.repository.js';
import { InMemoryAuditService } from '../../../shared/audit/application/in-memory-audit-service.js';
import { AuditContext } from '../../../shared/audit/domain/audit-context.vo.js';
import {
  AuditContextStore,
  AuditContextMissingError,
} from '../../../shared/audit/shared/audit-context-store.js';
import {
  ApplicationConcurrencyException,
  ApplicationEmailAlreadyInUseException,
  ApplicationInvalidRestoreException,
  ApplicationResourceNotFoundException,
  ApplicationValidationException,
} from './exceptions/application.exceptions.js';
import {
  FakePasswordHasher,
  HASH_REAL,
  SENHA_VALIDA,
  stringifyParaBusca,
} from '../../../../test/fakes/fake-password-hasher.js';
import { tenancyQueNaoDeveSerChamado } from '../../../../test/fakes/fake-tenancy-use-cases.js';

const T0 = new Date('2026-09-21T10:00:00Z');
const T1 = new Date('2026-09-21T11:00:00Z');

/** Uma empresa qualquer; o id nunca é consultado aqui — só importado como escopo. */
const EMPRESA = '0190a8b6-1c2d-7e3f-8a4b-5c6d7e8f9a0b';

function makeCtx(actorId: string | null = 'actor-1'): AuditContext {
  return new AuditContext({
    actorId,
    correlationId: 'corr-1',
    source: 'http',
    timestamp: T0,
  });
}

describe('UserUseCases', () => {
  let repo: InMemoryUserRepository;
  let audit: InMemoryAuditService;
  let hasher: FakePasswordHasher;
  let useCases: UserUseCases;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    audit = new InMemoryAuditService();
    hasher = new FakePasswordHasher();
    useCases = new UserUseCases(repo, audit, hasher, tenancyQueNaoDeveSerChamado());
  });

  describe('criarUser()', () => {
    it('cria User, persiste, retorna DTO, registra INSERT no audit', async () => {
      const ctx = makeCtx();
      const out = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      expect(out.nome).toBe('João');
      expect(out.email).toBe('joao@example.com');
      expect(out.version).toBe(1);
      expect(audit.history).toHaveLength(1);
      expect(audit.history[0]).toMatchObject({
        operation: 'INSERT',
        version: 1,
        previousVersion: null,
        changedBy: 'actor-1',
      });
    });

    // ── a senha é hasheada ANTES de tocar o agregado ────────────────────────
    //
    // O teste de `criarUser` acima passaria com `User.criar` recebendo a
    // senha em claro: o VO `PasswordHash` receberia um `string` que não é
    // argon2id e LANCEARIA — o defeito apareceria como erro, não como
    // vazamento silencioso. O que estes testes medem é o caminho feliz
    // completo: a senha plana entra, e o que chega ao repositório é o hash.
    it('hasheia a senha ANTES de criar o agregado', async () => {
      const ctx = makeCtx();
      await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );

      expect(hasher.hashCalls).toBe(1);
      expect(hasher.senhasEmClaro).toEqual([SENHA_VALIDA]);

      // O que foi persistido é o hash argon2id, não a senha.
      const persistido = await repo.findByEmail(
        (await import('../domain/value-objects/email.vo.js')).Email.create('joao@example.com'),
        null,
      );
      expect(persistido?.senhaHash().value).toBe(HASH_REAL);
    });

    it('a senha em claro NÃO aparece em nenhum argumento capturado pelo mock', async () => {
      // Spy no `save` para capturar o agregado exato que atravessa o
      // boundary de persistência. Um `expect(out).not.toHaveProperty('senha')`
      // só olha o DTO de SAÍDA — e o DTO de saída é justamente a barreira
      // que já existe. O caminho que este teste cobre é o do meio: o que
      // chega ao repositório.
      const saveSpy = vi.spyOn(repo, 'save');
      const ctx = makeCtx();
      await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );

      expect(saveSpy).toHaveBeenCalledTimes(1);
      const agregado = saveSpy.mock.calls[0]?.[0];
      // `toBeDefined()` antes de usar: sem ele o `agregado.senhaHash()`
      // abaixo seria `undefined.senhaHash()` — um TypeError que o teste
      // leria como falha do hasher, não como "o save não aconteceu".
      expect(agregado).toBeDefined();
      // Narrowing explícito: o `?.` acima deixa `agregado` possivelmente
      // `undefined`, e o TypeScript não estreita a partir do `toBeDefined`.
      if (agregado === undefined) throw new Error('save() não foi chamado');
      expect(stringifyParaBusca(agregado)).not.toContain(SENHA_VALIDA);
      // …e o hash está lá, o que distingue "não vazou" de "não gravou nada".
      expect(agregado.senhaHash().value).toBe(HASH_REAL);

      // O snapshot de auditoria (`users_history.snapshot`) é o terceiro
      // destino onde a senha poderia vazar, e é montado a partir do
      // `toUserOutput`. A segunda barreira (`toUserOutput` não ler o campo)
      // é a que cobre este — e ela não pode quebrar.
      expect(JSON.stringify(audit.history)).not.toContain(SENHA_VALIDA);
      expect(JSON.stringify(audit.history)).not.toContain(HASH_REAL);

      saveSpy.mockRestore();
    });

    it('a senha em claro NÃO aparece na saída (UserOutput) — segunda barreira', async () => {
      const ctx = makeCtx();
      const out = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );

      expect(stringifyParaBusca(out)).not.toContain(SENHA_VALIDA);
      expect(stringifyParaBusca(out)).not.toContain(HASH_REAL);
      expect(out).not.toHaveProperty('senha');
      expect(out).not.toHaveProperty('senhaHash');
      expect(out).not.toHaveProperty('passwordHash');
    });

    it('rejeita email duplicado com ApplicationEmailAlreadyInUseException', async () => {
      const ctx = makeCtx();
      await AuditContextStore.run(ctx, () =>
        useCases.criarUser(
          {
            nome: 'João',
            email: 'duplicado@example.com',
            senha: SENHA_VALIDA,
          },
          null,
        ),
      );
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.criarUser(
            {
              nome: 'Maria',
              email: 'duplicado@example.com',
              senha: SENHA_VALIDA,
            },
            null,
          ),
        ),
      ).rejects.toThrow(ApplicationEmailAlreadyInUseException);
    });

    it('rejeita nome vazio com ApplicationValidationException', async () => {
      const ctx = makeCtx();
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.criarUser({ nome: '', email: 'a@b.com', senha: SENHA_VALIDA }, null),
        ),
      ).rejects.toThrow(ApplicationValidationException);
    });

    it('rejeita email vazio com ApplicationValidationException', async () => {
      const ctx = makeCtx();
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.criarUser({ nome: 'João', email: '', senha: SENHA_VALIDA }, null),
        ),
      ).rejects.toThrow(ApplicationValidationException);
    });
  });

  describe('obterPorId()', () => {
    it('retorna User existente', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      const got = await AuditContextStore.run(ctx, () =>
        useCases.obterPorId({ id: created.id }, null),
      );
      expect(got.id).toBe(created.id);
    });

    it('lança ApplicationResourceNotFoundException se não existe', async () => {
      const ctx = makeCtx();
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.obterPorId({ id: '0190a8b6-1234-7abc-9def-000000000999' }, null),
        ),
      ).rejects.toThrow(ApplicationResourceNotFoundException);
    });
  });

  describe('atualizarNome()', () => {
    it('renomeia, persiste e registra UPDATE no audit', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      const ctx1 = new AuditContext({
        actorId: 'actor-1',
        correlationId: 'corr-1',
        source: 'http',
        timestamp: T1,
      });
      const updated = await AuditContextStore.run(ctx1, () =>
        useCases.atualizarNome(
          {
            id: created.id,
            novoNome: 'João Silva',
            expectedVersion: 1,
          },
          null,
        ),
      );
      expect(updated.nome).toBe('João Silva');
      expect(updated.version).toBe(2);
      const updates = audit.history.filter((h) => h.operation === 'UPDATE');
      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({ previousVersion: 1, version: 2 });
    });

    it('rejeita se User foi soft-deleted', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.softDelete({ id: created.id, reason: null, expectedVersion: 1 }, null),
      );
      // Após o fix do findById (que agora filtra soft-deleted por padrão em ambos
      // Prisma e InMemory — semântica de produção), tentar atualizar um agregado
      // soft-deleted via orquestrador retorna 404 (não encontrado), não 410.
      // Espelha o comportamento do integration spec.
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.atualizarNome(
            {
              id: created.id,
              novoNome: 'Novo',
              expectedVersion: 2,
            },
            null,
          ),
        ),
      ).rejects.toThrow(ApplicationResourceNotFoundException);
    });

    it('lança ApplicationConcurrencyException quando expectedVersion diverge (sem mutar)', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      // created.version === 1; cliente envia expectedVersion=999
      const historyBefore = audit.history.length;
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.atualizarNome(
            {
              id: created.id,
              novoNome: 'Não aplicado',
              expectedVersion: 999,
            },
            null,
          ),
        ),
      ).rejects.toThrow(ApplicationConcurrencyException);

      // Verifica que NENHUMA mutação persistiu: histórico inalterado,
      // nome permanece o original, versão ainda é 1.
      expect(audit.history.length).toBe(historyBefore);
      const refetched = await AuditContextStore.run(ctx, () =>
        useCases.obterPorId({ id: created.id }, null),
      );
      expect(refetched.nome).toBe('João');
      expect(refetched.version).toBe(1);
    });
  });

  describe('atualizarEmail()', () => {
    it('troca email e registra UPDATE no audit', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      const updated = await AuditContextStore.run(ctx, () =>
        useCases.atualizarEmail(
          {
            id: created.id,
            novoEmail: 'novo@example.com',
            expectedVersion: 1,
          },
          null,
        ),
      );
      expect(updated.email).toBe('novo@example.com');
      const updates = audit.history.filter((h) => h.operation === 'UPDATE');
      expect(updates).toHaveLength(1);
    });

    it('rejeita se novo email já em uso', async () => {
      const ctx = makeCtx();
      const u1 = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'Ana', email: 'a@example.com', senha: SENHA_VALIDA }, null),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'Bob', email: 'b@example.com', senha: SENHA_VALIDA }, null),
      );
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.atualizarEmail(
            {
              id: u1.id,
              novoEmail: 'b@example.com',
              expectedVersion: 1,
            },
            null,
          ),
        ),
      ).rejects.toThrow(ApplicationEmailAlreadyInUseException);
    });

    it('lança ApplicationConcurrencyException quando expectedVersion diverge', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.atualizarEmail(
            {
              id: created.id,
              novoEmail: 'novo@example.com',
              expectedVersion: 42,
            },
            null,
          ),
        ),
      ).rejects.toThrow(ApplicationConcurrencyException);
    });
  });

  describe('softDelete()', () => {
    it('marca como deleted, registra DELETE no audit + archive', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      const deleted = await AuditContextStore.run(ctx, () =>
        useCases.softDelete({ id: created.id, reason: 'LGPD', expectedVersion: 1 }, null),
      );
      expect(deleted.isDeleted).toBe(true);
      const deletes = audit.history.filter((h) => h.operation === 'DELETE');
      expect(deletes).toHaveLength(1);
      expect(audit.archives).toHaveLength(1);
      expect(audit.archives[0]).toMatchObject({ entityId: created.id, reason: 'LGPD' });
    });

    it('rejeita soft-delete duplicado', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.softDelete({ id: created.id, reason: null, expectedVersion: 1 }, null),
      );
      // Após o fix do findById, soft-delete de agregado já soft-deleted é 404
      // (findById filtra) — não 410. Espelha o integration spec.
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.softDelete({ id: created.id, reason: null, expectedVersion: 2 }, null),
        ),
      ).rejects.toThrow(ApplicationResourceNotFoundException);
    });

    it('lança ApplicationConcurrencyException quando expectedVersion diverge', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.softDelete({ id: created.id, reason: 'x', expectedVersion: 7 }, null),
        ),
      ).rejects.toThrow(ApplicationConcurrencyException);
    });
  });

  describe('restaurar()', () => {
    it('limpa deletedAt e registra RESTORE', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.softDelete({ id: created.id, reason: null, expectedVersion: 1 }, null),
      );
      const restored = await AuditContextStore.run(ctx, () =>
        useCases.restaurar({ id: created.id, expectedVersion: 2 }, null),
      );
      expect(restored.isDeleted).toBe(false);
      const restores = audit.history.filter((h) => h.operation === 'RESTORE');
      expect(restores).toHaveLength(1);
    });

    it('rejeita restaurar User não-deletado', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.restaurar({ id: created.id, expectedVersion: 1 }, null),
        ),
      ).rejects.toThrow(ApplicationInvalidRestoreException);
    });

    it('lança ApplicationConcurrencyException quando expectedVersion diverge', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.softDelete({ id: created.id, reason: null, expectedVersion: 1 }, null),
      );
      // Após softDelete, versão persistida = 2; cliente envia expectedVersion=99
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.restaurar({ id: created.id, expectedVersion: 99 }, null),
        ),
      ).rejects.toThrow(ApplicationConcurrencyException);
    });
  });

  describe('listar()', () => {
    it('lista Users excluindo soft-deleted por padrão', async () => {
      const ctx = makeCtx();
      await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'Ana', email: 'a@example.com', senha: SENHA_VALIDA }, null),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'Bob', email: 'b@example.com', senha: SENHA_VALIDA }, null),
      );
      const page = await AuditContextStore.run(ctx, () => useCases.listar({ limit: 10 }, null));
      expect(page.users).toHaveLength(2);
    });

    // pt-BR (Fase 10): o `InMemoryUserRepository` ignora o escopo — ele não
    // simula RLS. O que estes medem é a OUTRA ponta da fiação: que o
    // `tenantId` recebido chega ao port. Sem eles, trocar o escopo por `null`
    // aqui passaria a listar a conta inteira, e nenhum teste do use case
    // cairia (todos afirmam sobre conteúdo, não sobre escopo). A policy em
    // `prisma-rls.integration.spec.ts` mede o outro lado do mesmo fio.
    it('repassa o escopo recebido ao port', async () => {
      const ctx = makeCtx();
      const spy = vi.spyOn(repo, 'list');
      await AuditContextStore.run(ctx, () => useCases.listar({ limit: 10 }, EMPRESA));
      expect(spy).toHaveBeenCalledWith(
        { cursor: null, limit: 10, includeDeleted: false, somenteUsuarioId: null },
        EMPRESA,
        { comPerfilEfetivo: false },
      );
      spy.mockRestore();
    });

    it('o bucket de SISTEMA é o `null` explícito, não um default esquecido', async () => {
      const ctx = makeCtx();
      const spy = vi.spyOn(repo, 'list');
      await AuditContextStore.run(ctx, () => useCases.listar({ limit: 10 }, null));
      expect(spy).toHaveBeenCalledWith(
        { cursor: null, limit: 10, includeDeleted: false, somenteUsuarioId: null },
        null,
        { comPerfilEfetivo: false },
      );
      spy.mockRestore();
    });

    // ── pt-BR (#106): o perfil EFETIVO no escopo, e não o global ──────────────
    //
    // O caso que estes testes existem para impedir: `UserOutput.profileId` é a
    // coluna GLOBAL (`users.profile_id`), e ela é `null` para toda conta criada
    // pelo produto. A autorização lê `tenant_memberships.profile_id`. Usar a
    // global na tela fazia `/admin/users` dizer "sem perfil" para quem tem.
    describe('perfil efetivo no escopo (#106)', () => {
      it('projeta o perfil da membership, não o global do agregado', async () => {
        const ctx = makeCtx();
        const [ana, carla] = await AuditContextStore.run(ctx, () =>
          Promise.all([
            useCases.criarUser({ nome: 'Ana', email: 'ana@x.com', senha: SENHA_VALIDA }, null),
            useCases.criarUser({ nome: 'Carla', email: 'carla@x.com', senha: SENHA_VALIDA }, null),
          ]),
        );
        const PERFIL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

        // Os agregados vêm do próprio `list` do in-memory (sem mock), e o que
        // muda é só o `perfilEfetivo` — que o in-memory não produz. Assim o
        // teste mede a PROJEÇÃO do use case, não um dublê de repositório.
        const reais = await AuditContextStore.run(ctx, () =>
          repo.list(
            { limit: 10, cursor: null, includeDeleted: false, somenteUsuarioId: null },
            null,
          ),
        );
        vi.spyOn(repo, 'list').mockResolvedValueOnce({
          users: reais.users,
          nextCursor: null,
          perfilEfetivo: new Map([
            [ana.id, PERFIL], // membership com perfil
            [carla.id, null], // membership SEM perfil
          ]),
        });

        const page = await AuditContextStore.run(ctx, () =>
          useCases.listar({ limit: 10 }, EMPRESA),
        );
        const anaOut = page.users.find((u) => u.id === ana.id);

        // O que a tela exibe é o da membership…
        expect(anaOut?.perfilEfetivoNoEscopo).toBe(PERFIL);
        // …e o global continua intacto e separado. Sobrescrever `profileId`
        // com o valor do escopo apagaria a distinção que o campo existe pra fazer.
        expect(anaOut?.profileId).toBeNull();
      });

      it('ausente do map = sem vínculo no escopo, que é diferente de sem perfil', async () => {
        const ctx = makeCtx();
        const ana = await AuditContextStore.run(ctx, () =>
          useCases.criarUser({ nome: 'Ana', email: 'ana@x.com', senha: SENHA_VALIDA }, null),
        );

        // Ana não aparece no map: não pertence a esta empresa.
        const reais = await AuditContextStore.run(ctx, () =>
          repo.list(
            { limit: 10, cursor: null, includeDeleted: false, somenteUsuarioId: null },
            null,
          ),
        );
        vi.spyOn(repo, 'list').mockResolvedValueOnce({
          users: reais.users,
          nextCursor: null,
          perfilEfetivo: new Map(),
        });

        const page = await AuditContextStore.run(ctx, () =>
          useCases.listar({ limit: 10 }, EMPRESA),
        );
        const out = page.users.find((u) => u.id === ana.id);

        // `undefined`, não `null`: a tela distingue "fora desta empresa" de
        // "sem perfil", e colapsar os dois é o defeito que ela já tinha.
        expect(out?.perfilEfetivoNoEscopo).toBeUndefined();
        expect('perfilEfetivoNoEscopo' in (out ?? {})).toBe(false);
      });

      it('repositório sem o campo não quebra: o DTO sai sem perfil efetivo', async () => {
        // Um repositório que não implementa o `perfilEfetivo` (o in-memory, e
        // qualquer adapter futuro) não pode fazer a listagem explodir — o
        // campo é opcional por desenho, não por esquecimento.
        const ctx = makeCtx();
        await AuditContextStore.run(ctx, () =>
          useCases.criarUser({ nome: 'Ana', email: 'ana@x.com', senha: SENHA_VALIDA }, null),
        );
        const page = await AuditContextStore.run(ctx, () => useCases.listar({ limit: 10 }, null));
        expect(page.users).toHaveLength(1);
        // O in-memory não produz `perfilEfetivo`, e a listagem segue funcionando.
        expect(page.users[0]?.perfilEfetivoNoEscopo).toBeUndefined();
      });
    });

    // ⚠️ Este teste é o que teria pegado o defeito real. O record-literal que
    // traduz o DTO para o port ESQUECEU `somenteUsuarioId` na primeira versão,
    // e o `list()` do repositório — que o lia — virava código morto. Nenhum
    // teste caiu: os dois acima medem escopo e os de conteúdo mediam páginas
    // inteiras, que é o que o recorte justamente impede. MEDIDO: sem esta
    // linha, `08-ownership` lia 3 linhas onde devia ler 1.
    it("repassa o recorte de UM usuário ao port — o campo que o bucket `'*'` não garante", async () => {
      const ctx = makeCtx();
      const spy = vi.spyOn(repo, 'list');
      await AuditContextStore.run(ctx, () =>
        useCases.listar({ limit: 10, somenteUsuarioId: 'u-1' }, null),
      );
      expect(spy).toHaveBeenCalledWith(
        { cursor: null, limit: 10, includeDeleted: false, somenteUsuarioId: 'u-1' },
        null,
        { comPerfilEfetivo: false },
      );
      spy.mockRestore();
    });
  });

  it('lança AuditContextMissingError se AuditContext não está no scope', async () => {
    await expect(
      useCases.criarUser({ nome: 'João', email: 'joao@example.com', senha: SENHA_VALIDA }, null),
    ).rejects.toThrow(AuditContextMissingError);
  });
});
