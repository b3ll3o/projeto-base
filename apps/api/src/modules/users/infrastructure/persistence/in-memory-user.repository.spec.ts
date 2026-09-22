import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryUserRepository } from './in-memory-user.repository.js';
import { User } from '../../domain/user.aggregate.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import {
  ConcurrencyException,
  EmailAlreadyInUseException,
} from '../../domain/exceptions/user.exceptions.js';

const T0 = new Date('2026-09-21T10:00:00Z');
const T1 = new Date('2026-09-21T11:00:00Z');

const idA = '0190a8b6-1234-7abc-9def-000000000001';
const idB = '0190a8b6-1234-7abc-9def-000000000002';

describe('InMemoryUserRepository', () => {
  let repo: InMemoryUserRepository;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
  });

  describe('save() — INSERT path', () => {
    it('persiste User novo com expectedVersion=0', async () => {
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      const saved = await repo.save(u, 0);
      expect(saved.id().value).toBe(idA);
      expect(await repo.findById(UserId.create(idA))).not.toBeNull();
    });

    it('atualiza emailIndex ao inserir', async () => {
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      await repo.save(u, 0);
      expect(await repo.findByEmail(Email.create('joao@example.com'))).not.toBeNull();
    });

    it('rejeita INSERT com expectedVersion != 0 se já existe', async () => {
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      await repo.save(u, 0);
      // segunda tentativa: expectedVersion ainda 0 mas já existe
      await expect(repo.save(u, 0)).rejects.toThrow(ConcurrencyException);
    });

    it('rejeita INSERT com email já em uso por outro User', async () => {
      const u1 = User.criar({
        id: idA,
        nome: 'Alice',
        email: 'compartilhado@example.com',
        agora: T0,
      });
      await repo.save(u1, 0);
      const u2 = User.criar({
        id: idB,
        nome: 'Bob',
        email: 'compartilhado@example.com',
        agora: T0,
      });
      await expect(repo.save(u2, 0)).rejects.toThrow(EmailAlreadyInUseException);
    });
  });

  describe('save() — UPDATE path', () => {
    it('persiste mudança com expectedVersion correto', async () => {
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      await repo.save(u, 0);
      u.renomear('João Silva', T1);
      const saved = await repo.save(u, 1); // expectedVersion = 1 (versão pré-mutação)
      expect(saved.version()).toBe(2);
      expect(saved.nome().value).toBe('João Silva');
    });

    it('rejeita UPDATE com expectedVersion errado', async () => {
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      await repo.save(u, 0);
      u.renomear('João Silva', T1);
      await expect(repo.save(u, 0)).rejects.toThrow(ConcurrencyException);
    });

    it('atualiza emailIndex quando email muda', async () => {
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      await repo.save(u, 0);
      u.alterarEmail('novo@example.com', T1);
      await repo.save(u, 1);
      expect(await repo.findByEmail(Email.create('novo@example.com'))).not.toBeNull();
      expect(await repo.findByEmail(Email.create('joao@example.com'))).toBeNull();
    });

    it('rejeita UPDATE para email já usado por outro User (índice fica intacto)', async () => {
      const u1 = User.criar({ id: idA, nome: 'Alice', email: 'alice@example.com', agora: T0 });
      const u2 = User.criar({ id: idB, nome: 'Bob', email: 'bob@example.com', agora: T0 });
      await repo.save(u1, 0);
      await repo.save(u2, 0);

      u1.alterarEmail('bob@example.com', T1); // tenta roubar email do Bob
      await expect(repo.save(u1, 1)).rejects.toThrow(EmailAlreadyInUseException);

      // índice deve estar intacto: Bob ainda dono do seu email, Alice ainda do antigo
      expect((await repo.findByEmail(Email.create('bob@example.com')))!.id().value).toBe(idB);
      expect((await repo.findByEmail(Email.create('alice@example.com')))!.id().value).toBe(idA);
    });

    it('clone defensivo: mutar o User APÓS save NÃO afeta o armazenado', async () => {
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      await repo.save(u, 0);
      u.renomear('João Mutado', T1);
      const refetched = await repo.findById(UserId.create(idA));
      expect(refetched!.nome().value).toBe('João');
      expect(refetched!.version()).toBe(1);
    });
  });

  describe('findById()', () => {
    it('retorna null se não existir', async () => {
      expect(await repo.findById(UserId.create(idA))).toBeNull();
    });

    it('retorna User persistido', async () => {
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      await repo.save(u, 0);
      const found = await repo.findById(UserId.create(idA));
      expect(found).not.toBeNull();
      expect(found!.nome().value).toBe('João');
    });

    it('retorna clone defensivo: mutar o resultado NÃO afeta o armazenado', async () => {
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      await repo.save(u, 0);
      const found = await repo.findById(UserId.create(idA));
      found!.renomear('João Mutado', T1);
      const refetched = await repo.findById(UserId.create(idA));
      expect(refetched!.nome().value).toBe('João');
      expect(refetched!.version()).toBe(1);
    });
  });

  describe('findByEmail()', () => {
    it('retorna null se não existir', async () => {
      expect(await repo.findByEmail(Email.create('nobody@example.com'))).toBeNull();
    });

    it('retorna User pelo email', async () => {
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      await repo.save(u, 0);
      const found = await repo.findByEmail(Email.create('JOAO@EXAMPLE.COM')); // case-insensitive
      expect(found).not.toBeNull();
      expect(found!.id().value).toBe(idA);
    });
  });

  describe('list()', () => {
    beforeEach(async () => {
      const a = User.criar({ id: idA, nome: 'Alice', email: 'alice@example.com', agora: T0 });
      const b = User.criar({ id: idB, nome: 'Bob', email: 'bob@example.com', agora: T0 });
      await repo.save(a, 0);
      await repo.save(b, 0);
    });

    it('lista todos excluindo soft-deleted por padrão', async () => {
      const a = await repo.findById(UserId.create(idA));
      a!.marcarExcluido(null, T1);
      await repo.save(a!, 1);
      const page = await repo.list({ limit: 10 });
      expect(page.users).toHaveLength(1);
      expect(page.users[0]!.id().value).toBe(idB);
    });

    it('inclui soft-deleted quando includeDeleted=true', async () => {
      const a = await repo.findById(UserId.create(idA));
      a!.marcarExcluido(null, T1);
      await repo.save(a!, 1);
      const page = await repo.list({ limit: 10, includeDeleted: true });
      expect(page.users).toHaveLength(2);
    });

    it('pagina por cursor', async () => {
      const page1 = await repo.list({ limit: 1 });
      expect(page1.users).toHaveLength(1);
      expect(page1.nextCursor).not.toBeNull();
      const page2 = await repo.list({ limit: 1, cursor: page1.nextCursor });
      expect(page2.users).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    });
  });

  describe('helpers', () => {
    it('size retorna total armazenado', async () => {
      expect(repo.size).toBe(0);
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      await repo.save(u, 0);
      expect(repo.size).toBe(1);
    });

    it('clear remove todos', async () => {
      const u = User.criar({ id: idA, nome: 'João', email: 'joao@example.com', agora: T0 });
      await repo.save(u, 0);
      repo.clear();
      expect(repo.size).toBe(0);
      expect(await repo.findById(UserId.create(idA))).toBeNull();
    });
  });
});
