import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryUserRepository } from './in-memory-user.repository.js';
import { User } from '../../domain/user.aggregate.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import {
  ConcurrencyException,
  EmailAlreadyInUseException,
} from '../../domain/exceptions/user.exceptions.js';
import { HASH_REAL as HASH } from '../../../../../test/fakes/fake-password-hasher.js';
import { PasswordHash } from '../../domain/value-objects/password-hash.vo.js';

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
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      const saved = await repo.save(u, 0, null);
      expect(saved.id().value).toBe(idA);
      expect(await repo.findById(UserId.create(idA), null)).not.toBeNull();
    });

    // O `InMemoryUserRepository` clona o agregado em DOIS lugares
    // (`clone()` no read e o snapshot no `save()`), e os dois passam por
    // `User.restaurarDePersistencia` — que passou a exigir `senhaHash`.
    // Um clone que esquecesse o campo não estouraria em lugar nenhum: o VO
    // só valida quando recebe um valor, e um `undefined` aqui passaria
    // adiante até o `PasswordHash.create(undefined)` — ou, pior, até um
    // agregado sem senha nenhuma. Estes testes medem o VALOR, não a
    // presença do campo.
    it('preserva o senhaHash no INSERT e o devolve no findById', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      const saved = await repo.save(u, 0, null);
      expect(saved.senhaHash().value).toBe(HASH);

      const lido = await repo.findById(UserId.create(idA), null);
      expect(lido?.senhaHash().value).toBe(HASH);
    });

    it('preserva o senhaHash no findByEmail (mesmo caminho de clone)', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      const lido = await repo.findByEmail(Email.create('joao@example.com'), null);
      expect(lido?.senhaHash().value).toBe(HASH);
    });

    it('atualiza emailIndex ao inserir', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      expect(await repo.findByEmail(Email.create('joao@example.com'), null)).not.toBeNull();
    });

    it('rejeita INSERT com expectedVersion != 0 se já existe', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      // segunda tentativa: expectedVersion ainda 0 mas já existe
      await expect(repo.save(u, 0, null)).rejects.toThrow(ConcurrencyException);
    });

    it('rejeita INSERT com email já em uso por outro User', async () => {
      const u1 = User.criar({
        id: idA,
        nome: 'Alice',
        email: 'compartilhado@example.com',
        senhaHash: PasswordHash.create(HASH),
        agora: T0,
      });
      await repo.save(u1, 0, null);
      const u2 = User.criar({
        id: idB,
        nome: 'Bob',
        email: 'compartilhado@example.com',
        senhaHash: PasswordHash.create(HASH),
        agora: T0,
      });
      await expect(repo.save(u2, 0, null)).rejects.toThrow(EmailAlreadyInUseException);
    });
  });

  describe('save() — UPDATE path', () => {
    it('persiste mudança com expectedVersion correto', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      u.renomear('João Silva', T1);
      const saved = await repo.save(u, 1, null); // expectedVersion = 1 (versão pré-mutação)
      expect(saved.version()).toBe(2);
      expect(saved.nome().value).toBe('João Silva');
    });

    it('rejeita UPDATE com expectedVersion errado', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      u.renomear('João Silva', T1);
      await expect(repo.save(u, 0, null)).rejects.toThrow(ConcurrencyException);
    });

    it('atualiza emailIndex quando email muda', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      u.alterarEmail('novo@example.com', T1);
      await repo.save(u, 1, null);
      expect(await repo.findByEmail(Email.create('novo@example.com'), null)).not.toBeNull();
      expect(await repo.findByEmail(Email.create('joao@example.com'), null)).toBeNull();
    });

    it('rejeita UPDATE para email já usado por outro User (índice fica intacto)', async () => {
      const u1 = User.criar({
        id: idA,
        nome: 'Alice',
        email: 'alice@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      const u2 = User.criar({
        id: idB,
        nome: 'Bob',
        email: 'bob@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u1, 0, null);
      await repo.save(u2, 0, null);

      u1.alterarEmail('bob@example.com', T1); // tenta roubar email do Bob
      await expect(repo.save(u1, 1, null)).rejects.toThrow(EmailAlreadyInUseException);

      // índice deve estar intacto: Bob ainda dono do seu email, Alice ainda do antigo
      expect((await repo.findByEmail(Email.create('bob@example.com'), null))!.id().value).toBe(idB);
      expect((await repo.findByEmail(Email.create('alice@example.com'), null))!.id().value).toBe(
        idA,
      );
    });

    it('clone defensivo: mutar o User APÓS save NÃO afeta o armazenado', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      u.renomear('João Mutado', T1);
      const refetched = await repo.findById(UserId.create(idA), null);
      expect(refetched!.nome().value).toBe('João');
      expect(refetched!.version()).toBe(1);
    });
  });

  describe('findById()', () => {
    it('retorna null se não existir', async () => {
      expect(await repo.findById(UserId.create(idA), null)).toBeNull();
    });

    it('retorna User persistido', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      const found = await repo.findById(UserId.create(idA), null);
      expect(found).not.toBeNull();
      expect(found!.nome().value).toBe('João');
    });

    it('retorna clone defensivo: mutar o resultado NÃO afeta o armazenado', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      const found = await repo.findById(UserId.create(idA), null);
      found!.renomear('João Mutado', T1);
      const refetched = await repo.findById(UserId.create(idA), null);
      expect(refetched!.nome().value).toBe('João');
      expect(refetched!.version()).toBe(1);
    });
  });

  describe('findByEmail()', () => {
    it('retorna null se não existir', async () => {
      expect(await repo.findByEmail(Email.create('nobody@example.com'), null)).toBeNull();
    });

    it('retorna User pelo email', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      const found = await repo.findByEmail(Email.create('JOAO@EXAMPLE.COM'), null); // case-insensitive
      expect(found).not.toBeNull();
      expect(found!.id().value).toBe(idA);
    });
  });

  describe('list()', () => {
    beforeEach(async () => {
      const a = User.criar({
        id: idA,
        nome: 'Alice',
        email: 'alice@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      const b = User.criar({
        id: idB,
        nome: 'Bob',
        email: 'bob@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(a, 0, null);
      await repo.save(b, 0, null);
    });

    it('lista todos excluindo soft-deleted por padrão', async () => {
      const a = await repo.findById(UserId.create(idA), null);
      a!.marcarExcluido(null, T1);
      await repo.save(a!, 1, null);
      const page = await repo.list({ limit: 10 }, null);
      expect(page.users).toHaveLength(1);
      expect(page.users[0]!.id().value).toBe(idB);
    });

    it('inclui soft-deleted quando includeDeleted=true', async () => {
      const a = await repo.findById(UserId.create(idA), null);
      a!.marcarExcluido(null, T1);
      await repo.save(a!, 1, null);
      const page = await repo.list({ limit: 10, includeDeleted: true }, null);
      expect(page.users).toHaveLength(2);
    });

    it('pagina por cursor', async () => {
      const page1 = await repo.list({ limit: 1 }, null);
      expect(page1.users).toHaveLength(1);
      expect(page1.nextCursor).not.toBeNull();
      const page2 = await repo.list({ limit: 1, cursor: page1.nextCursor }, null);
      expect(page2.users).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    });
  });

  describe('helpers', () => {
    it('size retorna total armazenado', async () => {
      expect(repo.size).toBe(0);
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      expect(repo.size).toBe(1);
    });

    it('clear remove todos', async () => {
      const u = User.criar({
        id: idA,
        nome: 'João',
        email: 'joao@example.com',
        agora: T0,
        senhaHash: PasswordHash.create(HASH),
      });
      await repo.save(u, 0, null);
      repo.clear();
      expect(repo.size).toBe(0);
      expect(await repo.findById(UserId.create(idA), null)).toBeNull();
    });
  });
});
