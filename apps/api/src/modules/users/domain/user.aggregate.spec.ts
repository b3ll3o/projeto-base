import { describe, it, expect } from 'vitest';
import { User } from './user.aggregate.js';
import { PasswordHash } from './value-objects/password-hash.vo.js';
import { UserCreatedEvent } from './events/user-created.event.js';
import { UserUpdatedEvent } from './events/user-updated.event.js';
import { UserDeletedEvent } from './events/user-deleted.event.js';
import { UserRestoredEvent } from './events/user-restored.event.js';
import {
  UserDeletedException,
  InvalidRestoreException,
  UserValidationException,
} from './exceptions/user.exceptions.js';

const T0 = new Date('2026-09-21T10:00:00Z');
const T1 = new Date('2026-09-21T11:00:00Z');
const T2 = new Date('2026-09-21T12:00:00Z');

/**
 * Hash argon2id real — o agregado só NUNCA vê a senha em claro.
 *
 * Fixture PRÓPRIO, gerado por `argon2.hash('senha-de-teste-do-agregado')`.
 * Deliberadamente NÃO é o hash do backfill de
 * `prisma/migrations/20261009000000_user_password_hash/`: um spec que carrega
 * o segredo de produção quebra no dia em que alguém rotacionar aquele
 * backfill — e quebra por um motivo sem relação com o comportamento testado.
 * Foi o que a review A-08 mediu.
 */
const HASH_REAL =
  '$argon2id$v=19$m=65536,p=4,t=3$doW633BatGoj6u7dCBcs5A$uIxdXEdHstuEZZjK5VNYhZ3L2au/i/50od75iJhIBpQ';
/**
 * Salt do fixture acima, EXTRAÍDO e nunca escrito à mão.
 *
 * A asserção de redigitação precisa citar o salt do hash que este arquivo
 * realmente carrega. Um literal fixo ao lado do fixture é exatamente o que
 * transforma um teste com dentes em um teste vacuamente verde: se o fixture
 * muda e o literal não, `not.toContain` continua passando sem nada ter sido
 * verificado.
 */
const SALT_DO_FIXTURE = HASH_REAL.split('$')[4]!;
const SENHA_HASH = PasswordHash.create(HASH_REAL);

/**
 * Executa `fn` e devolve a exceção lançada; se ela NÃO lançar, falha o teste.
 *
 * Precisamos do objeto da exceção (não só de `toThrow()`) porque a garantia
 * que importa aqui é sobre o CONTEÚDO da mensagem — que ela não carregue a
 * senha recebida. `toThrow()` não olha para isso.
 */
function erroDe(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error('a função deveria ter lançado, e não lançou');
}

/**
 * `User.criar` com a senha já hasheada.
 *
 * Existe para os ~40 testes deste arquivo que não são sobre senha: sem
 * helper, cada um ganharia a mesma linha `senhaHash:` repetida, e a
 * próxima fase do feature (login) teria de editar dozens de call sites
 * para cada campo novo do agregado. O que o helper NÃO pode fazer é
 * inventar um default no AGREGADO — `User.criar` continua exigindo
 * `senhaHash`, e o teste que cobre essa exigência está em
 * `senhaHash` no fim deste arquivo.
 */
function criar(props: { id?: string; nome: string; email: string; agora: Date }): User {
  return User.criar({ ...props, senhaHash: SENHA_HASH });
}

describe('User aggregate', () => {
  describe('criar()', () => {
    it('cria User com id gerado e versão 1', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      expect(u.id().value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(u.version()).toBe(1);
      expect(u.isDeleted()).toBe(false);
    });

    it('aceita id explícito (UUID v7)', () => {
      const id = '0190a8b6-1234-7abc-9def-000000000001';
      const u = criar({ id, nome: 'Maria', email: 'maria@example.com', agora: T0 });
      expect(u.id().value).toBe(id);
    });

    it('rejeita email inválido', () => {
      expect(() => criar({ nome: 'X', email: 'não-é-email', agora: T0 })).toThrow();
    });

    it('rejeita nome < 2 chars', () => {
      expect(() => criar({ nome: 'A', email: 'a@b.com', agora: T0 })).toThrow();
    });

    it('emite UserCreatedEvent em pullEvents()', () => {
      const u = criar({ nome: 'Carlos', email: 'carlos@example.com', agora: T0 });
      const events = u.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(UserCreatedEvent);
      expect(events[0]!.eventName).toBe('users.user.created.v1');
      expect((events[0] as UserCreatedEvent).version).toBe(1);
      // pullEvents esvazia
      expect(u.pullEvents()).toHaveLength(0);
    });
  });

  describe('renomear()', () => {
    it('atualiza nome e incrementa versão', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents(); // drena created
      u.renomear('João Silva', T1);
      expect(u.nome().value).toBe('João Silva');
      expect(u.version()).toBe(2);
      expect(u.updatedAt()).toBe(T1);
    });

    it('emite UserUpdatedEvent com previousVersion e version', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.renomear('João Silva', T1);
      const events = u.pullEvents();
      expect(events[0]).toBeInstanceOf(UserUpdatedEvent);
      const e = events[0] as UserUpdatedEvent;
      expect(e.previousVersion).toBe(1);
      expect(e.version).toBe(2);
    });

    it('rejeita nome inválido', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      expect(() => u.renomear('A', T1)).toThrow();
    });

    it('lança UserDeletedException se User foi soft-deleted', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      u.pullEvents();
      expect(() => u.renomear('João Silva', T2)).toThrow(UserDeletedException);
    });
  });

  describe('alterarEmail()', () => {
    it('atualiza email normalizado', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.alterarEmail('NOVO@EXAMPLE.COM', T1);
      expect(u.email().value).toBe('novo@example.com');
      expect(u.version()).toBe(2);
    });

    it('emite UserUpdatedEvent', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.alterarEmail('novo@example.com', T1);
      expect(u.pullEvents()[0]).toBeInstanceOf(UserUpdatedEvent);
    });

    it('lança UserDeletedException se User foi soft-deleted', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      u.pullEvents();
      expect(() => u.alterarEmail('novo@example.com', T2)).toThrow(UserDeletedException);
    });
  });

  describe('marcarExcluido()', () => {
    it('marca deletedAt e isDeleted retorna true', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      expect(u.isDeleted()).toBe(true);
      expect(u.deletedAt()).toBe(T1);
      expect(u.version()).toBe(2);
    });

    it('emite UserDeletedEvent', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido('motivo X', T1);
      const events = u.pullEvents();
      expect(events[0]).toBeInstanceOf(UserDeletedEvent);
      expect((events[0] as UserDeletedEvent).reason).toBe('motivo X');
    });

    it('lança UserDeletedException se já excluído', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      expect(() => u.marcarExcluido(null, T2)).toThrow(UserDeletedException);
    });
  });

  describe('restaurar()', () => {
    it('limpa deletedAt após soft delete', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      u.pullEvents();
      u.restaurar(T2);
      expect(u.isDeleted()).toBe(false);
      expect(u.deletedAt()).toBeNull();
      expect(u.version()).toBe(3);
    });

    it('emite UserRestoredEvent', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      u.pullEvents();
      u.restaurar(T2);
      const events = u.pullEvents();
      expect(events[0]).toBeInstanceOf(UserRestoredEvent);
      const e = events[0] as UserRestoredEvent;
      expect(e.restoredFromVersion).toBe(2);
      expect(e.version).toBe(3);
    });

    it('lança InvalidRestoreException se não está excluído', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      expect(() => u.restaurar(T1)).toThrow(InvalidRestoreException);
    });

    it('lança InvalidRestoreException se agora é anterior ao deletedAt', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T2); // soft delete em T2
      u.pullEvents();
      expect(() => u.restaurar(T1)).toThrow(InvalidRestoreException); // T1 < T2
    });
  });

  describe('restaurarDePersistencia()', () => {
    it('hidrata sem emitir eventos', () => {
      const id = '0190a8b6-1234-7abc-9def-000000000001';
      const u = User.restaurarDePersistencia({
        id,
        nome: 'João',
        email: 'joao@example.com',
        senhaHash: SENHA_HASH,
        profileId: null,
        createdAt: T0,
        updatedAt: T1,
        version: 5,
        deletedAt: null,
      });
      expect(u.id().value).toBe(id);
      expect(u.version()).toBe(5);
      expect(u.createdAt()).toBe(T0);
      expect(u.updatedAt()).toBe(T1);
      expect(u.pullEvents()).toEqual([]); // sem eventos
    });
  });

  // ── senhaHash ─────────────────────────────────────────────────────────
  //
  // Regras que o agregado impõe sobre a senha:
  //   1. `criar` e `restaurarDePersistencia` exigem um `PasswordHash` — não
  //      há caminho para um User sem senha.
  //   2. `trocarSenha` é o ÚNICO mutator de senha, e ele é guardado como
  //      `renomear`/`alterarEmail`: some para user soft-deleted e faz
  //      `version++` + `UserUpdatedEvent` (para que a troca entre no
  //      histórico de auditoria e bumped no optimistic locking).
  describe('senhaHash', () => {
    it('criar guarda a senha hasheada', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      expect(u.senhaHash()).toBeInstanceOf(PasswordHash);
      expect(u.senhaHash().value).toBe(HASH_REAL);
    });

    it('restaurarDePersistencia guarda a senha hasheada', () => {
      const u = User.restaurarDePersistencia({
        id: '0190a8b6-1234-7abc-9def-0000000000a1',
        nome: 'João',
        email: 'joao@example.com',
        senhaHash: SENHA_HASH,
        profileId: null,
        createdAt: T0,
        updatedAt: T1,
        version: 3,
        deletedAt: null,
      });
      expect(u.senhaHash().value).toBe(HASH_REAL);
    });

    it('restaurarDePersistencia NÃO emite evento ao hidratar a senha', () => {
      // Se hidratar emitisse `UserUpdatedEvent`, todo `findById` geraria
      // uma entrada de auditoria — e o histórico encheria de eventos falsos
      // a cada leitura.
      const u = User.restaurarDePersistencia({
        id: '0190a8b6-1234-7abc-9def-0000000000a2',
        nome: 'João',
        email: 'joao@example.com',
        senhaHash: SENHA_HASH,
        profileId: null,
        createdAt: T0,
        updatedAt: T1,
        version: 3,
        deletedAt: null,
      });
      expect(u.pullEvents()).toEqual([]);
    });

    it('o agregado NÃO guarda a senha em claro em nenhum campo serializável', () => {
      const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      // `senhaHash` é a única porta do agregado; o que ela devolve é
      // redigido por `toString`. Isto trava a SEGUNDA barreira — a
      // primeira é `toString` (password-hash.vo.spec.ts).
      expect(`${u.senhaHash()}`).toBe('[redacted]');
      expect(`${u.senhaHash()}`).not.toContain(SALT_DO_FIXTURE);
    });

    /**
     * Guarda de RUNTIME (o tipo já não cobre este caminho).
     *
     * `senhaHash: 'texto'` é erro de compilação, e é isso que o
     * `@ts-expect-error` do teste de `trocarSenha` prova. Mas tipos são
     * apagados em runtime: um `as any`, um consumidor em JS puro ou um
     * caminho de desserialização entrega a string assim mesmo, e o
     * agregado a aceitaria calado. A consequência é silenciosa e cara —
     * `senhaHash()` devolveria algo que não é `PasswordHash`, o mapper
     * leria `.value` (que não existe) e gravaria `undefined` na coluna: a
     * senha desapareceria do banco sem erro em lugar nenhum.
     *
     * O `as unknown as PasswordHash` abaixo NÃO é um atalho para o teste
     * passar: é a reprodução exata do que a erasure de tipos faz. O tipo
     * está no lugar, o valor não.
     */
    describe('exige um PasswordHash de verdade, não só em tipo', () => {
      const SENHA_EM_CLARO = 'senha-super-secreta-nao-pode-vazar';

      it('criar() recusa a senha em claro em vez de aceitar calado', () => {
        const erro = erroDe(() =>
          User.criar({
            nome: 'João',
            email: 'joao@example.com',
            senhaHash: SENHA_EM_CLARO as unknown as PasswordHash,
            agora: T0,
          }),
        );
        expect(erro).toBeInstanceOf(UserValidationException);
      });

      it('restaurarDePersistencia() recusa a senha em claro', () => {
        const erro = erroDe(() =>
          User.restaurarDePersistencia({
            id: '0190a8b6-1234-7abc-9def-0000000000b1',
            nome: 'João',
            email: 'joao@example.com',
            senhaHash: SENHA_EM_CLARO as unknown as PasswordHash,
            profileId: null,
            createdAt: T0,
            updatedAt: T0,
            version: 1,
            deletedAt: null,
          }),
        );
        expect(erro).toBeInstanceOf(UserValidationException);
      });

      it('NÃO coloca a senha recebida na mensagem da exceção', () => {
        // A exceção é convertida em payload HTTP pela
        // `domain-exception-to-http`. Um template com `${candidato}` aqui
        // seria um canal de vazamento direto — e o teste de "lança" acima,
        // sozinho, não enxergaria isso.
        const erro = erroDe(() =>
          User.criar({
            nome: 'João',
            email: 'joao@example.com',
            senhaHash: SENHA_EM_CLARO as unknown as PasswordHash,
            agora: T0,
          }),
        );
        expect(erro.message).not.toContain(SENHA_EM_CLARO);
      });

      it('trocarSenha() recusa a senha em claro e não a ecoa', () => {
        const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
        const erro = erroDe(() => u.trocarSenha(SENHA_EM_CLARO as unknown as PasswordHash, T1));
        expect(erro).toBeInstanceOf(UserValidationException);
        expect(erro.message).not.toContain(SENHA_EM_CLARO);
        // A recusa não pode deixar o agregado meio-mutado.
        expect(u.senhaHash().value).toBe(HASH_REAL);
        expect(u.version()).toBe(1);
      });
    });

    describe('trocarSenha()', () => {
      const NOVO_HASH = PasswordHash.create(
        '$argon2id$v=19$m=65536,p=4,t=3$outroSaltQualquer$outroDigestQualquer',
      );

      it('substitui o hash, incrementa a versão e atualiza updatedAt', () => {
        const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
        u.pullEvents(); // descarta o UserCreatedEvent
        expect(u.version()).toBe(1);

        u.trocarSenha(NOVO_HASH, T1);

        expect(u.senhaHash().value).toBe(NOVO_HASH.value);
        expect(u.senhaHash().value).not.toBe(HASH_REAL);
        expect(u.version()).toBe(2);
        expect(u.updatedAt()).toBe(T1);
      });

      it('emite UserUpdatedEvent com a versão anterior (entra no histórico)', () => {
        const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
        u.pullEvents();

        u.trocarSenha(NOVO_HASH, T1);
        const eventos = u.pullEvents();

        expect(eventos).toHaveLength(1);
        expect(eventos[0]).toBeInstanceOf(UserUpdatedEvent);
        expect(eventos[0]).toMatchObject({
          eventName: 'users.user.updated.v1',
          aggregateId: u.id().value,
          previousVersion: 1,
          version: 2,
          occurredAt: T1,
        });
      });

      it('lança UserDeletedException em user soft-deleted', () => {
        const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
        u.marcarExcluido('pedido do titular', T1);
        const versaoAntes = u.version();

        expect(() => u.trocarSenha(NOVO_HASH, T2)).toThrow(UserDeletedException);

        // A recusa não pode deixar o agregado meio-mutado: nem hash novo,
        // nem versão++, nem evento.
        expect(u.senhaHash().value).toBe(HASH_REAL);
        expect(u.version()).toBe(versaoAntes);
        u.pullEvents();
        expect(u.pullEvents()).toEqual([]);
      });

      it('NÃO aceita senha em claro — só PasswordHash (tipo, não valor)', () => {
        // `trocarSenha` recebe o VO. Um `string` aqui é erro de compilação,
        // e é por isso que a assinatura importa: `trocarSenha(senhaPlana)`
        // não compila, então não existe o caminho que grava a senha em
        // claro por descuido.
        const u = criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
        // @ts-expect-error senha em claro é recusada pela assinatura
        expect(() => u.trocarSenha('senha-super-secreta', T1)).toThrow();
      });
    });
  });
});
