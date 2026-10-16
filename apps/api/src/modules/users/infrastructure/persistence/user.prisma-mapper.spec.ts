import { describe, it, expect, vi } from 'vitest';
import { trace, type Span } from '@opentelemetry/api';
import { UserPrismaMapper } from './user.prisma-mapper.js';
import { User } from '../../domain/user.aggregate.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';
import { PasswordHash } from '../../domain/value-objects/password-hash.vo.js';
import { UserValidationException } from '../../domain/exceptions/user.exceptions.js';
import { UserPersistenceException } from './user-persistence.exceptions.js';
import { mapExceptionToHttp } from '../../../../shared/infrastructure/http/domain-exception-to-http.js';
import { HASH_REAL } from '../../../../../test/fakes/fake-password-hasher.js';

describe('UserPrismaMapper', () => {
  it('toDomain converte Prisma row em User aggregate (com normalização de email)', () => {
    const user = UserPrismaMapper.toDomain({
      id: '0190a8b6-1234-7abc-9def-000000000001',
      email: 'Alice@Example.com',
      name: 'Alice',
      passwordHash: HASH_REAL,
      profileId: null,
      createdAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T10:00:00Z'),
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    });

    expect(user).toBeInstanceOf(User);
    expect(user.id().value).toBe('0190a8b6-1234-7abc-9def-000000000001');
    expect(user.email().value).toBe('alice@example.com'); // VO normaliza lowercase
    expect(user.nome().value).toBe('Alice');
    expect(user.version()).toBe(1);
    expect(user.deletedAt()).toBeNull();
  });

  it('toDomain preserva deletedAt e version quando presentes', () => {
    const user = UserPrismaMapper.toDomain({
      id: '0190a8b6-1234-7abc-9def-000000000003',
      email: 'bob@example.com',
      name: 'Bob',
      passwordHash: HASH_REAL,
      profileId: null,
      createdAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T11:00:00Z'),
      createdBy: null,
      updatedBy: null,
      deletedAt: new Date('2026-09-21T12:00:00Z'),
      deletedBy: null,
      version: 4,
    });

    expect(user.deletedAt()).toBeInstanceOf(Date);
    expect(user.version()).toBe(4);
  });

  // ── senhaHash ────────────────────────────────────────────────────────────
  //
  // O mapper é o ÚNICO lugar onde o hash entra no agregado e onde ele sai
  // dele. Um mapper que não preserva o hash tem dois modos de falha, ambos
  // invisíveis: `toDomain` sem o campo deixa o agregado com um hash vazio (o
  // VO *valida formato*, e um `PasswordHash` inventado passaria) e
  // `toPersistence` sem o campo gravaria `password_hash` vazio — o login
  // falharia para sempre com "credencial inválida", sem nenhum erro, sem
  // nenhum log. Por isso o round-trip é testado pelo VALOR, não pela
  // presença do campo.
  it('toDomain hidrata o senhaHash a partir de passwordHash', () => {
    const user = UserPrismaMapper.toDomain({
      id: '0190a8b6-1234-7abc-9def-000000000004',
      email: 'dave@example.com',
      name: 'Dave',
      passwordHash: HASH_REAL,
      profileId: null,
      createdAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T10:00:00Z'),
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    });

    expect(user.senhaHash()).toBeInstanceOf(PasswordHash);
    expect(user.senhaHash().value).toBe(HASH_REAL);
  });

  it('toDomain RECUSA passwordHash que não é argon2id (senha em claro na coluna)', () => {
    // A senha em claro chegando à coluna faria o login falhar para sempre e
    // o defeito só apareceria na Fase 4. O VO é a última linha antes disso.
    expect(() =>
      UserPrismaMapper.toDomain({
        id: '0190a8b6-1234-7abc-9def-000000000005',
        email: 'eve@example.com',
        name: 'Eve',
        passwordHash: 'senha-em-claro',
        profileId: null,
        createdAt: new Date('2026-09-21T10:00:00Z'),
        updatedAt: new Date('2026-09-21T10:00:00Z'),
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      }),
    ).toThrow();
  });

  it('toPersistence escreve o hash em passwordHash', () => {
    const u = User.criar({
      id: '0190a8b6-1234-7abc-9def-000000000002',
      nome: 'Ana',
      email: 'a@b.com',
      senhaHash: PasswordHash.create(HASH_REAL),
      agora: new Date('2026-09-21T10:00:00Z'),
    });

    const row = UserPrismaMapper.toPersistence(u);
    expect(row.passwordHash).toBe(HASH_REAL);
    expect(row.id).toBe('0190a8b6-1234-7abc-9def-000000000002');
    expect(row.email).toBe('a@b.com');
    expect(row.name).toBe('Ana');
    expect(row.version).toBe(1);
    expect(row.deletedAt).toBeNull();
    expect(row.createdBy).toBeNull();
  });

  it('roundtrip: toPersistence(toDomain(row)) preserva campos essenciais', () => {
    const row: Parameters<typeof UserPrismaMapper.toDomain>[0] = {
      id: UserId.create().value,
      email: 'Carla@Example.com',
      name: 'Carla',
      passwordHash: HASH_REAL,
      profileId: null,
      createdAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T11:30:00Z'),
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 7,
    };

    const user = UserPrismaMapper.toDomain(row);
    const back = UserPrismaMapper.toPersistence(user);

    expect(back.id).toBe(row.id);
    expect(back.email).toBe('carla@example.com');
    expect(back.name).toBe('Carla');
    expect(back.version).toBe(7);
    expect(back.deletedAt).toBeNull();
  });

  it('roundtrip: o hash sobrevive toDomain → toPersistence byte a byte', () => {
    const row: Parameters<typeof UserPrismaMapper.toDomain>[0] = {
      id: UserId.create().value,
      email: 'frank@example.com',
      name: 'Frank',
      passwordHash: HASH_REAL,
      profileId: null,
      createdAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T11:30:00Z'),
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 7,
    };

    const back = UserPrismaMapper.toPersistence(UserPrismaMapper.toDomain(row));

    // Sem o hash, o login falha para sempre e NENHUMA asserção acima cai:
    // id, email, nome, version e deletedAt continuam certos. É por isso que
    // o round-trip do hash é um teste só dele.
    expect(back.passwordHash).toBe(row.passwordHash);
  });

  // O `toPersistence` é o único leitor de `.value` do PasswordHash. Se o VO
  // deixar de redigir, este teste ainda passa — a barreira está no VO. O que
  // ele mede é que o mapper não contorna o VO: o campo lido é `.value`, e o
  // valor gravado é o argon2id, não `[redacted]`.
  it('toPersistence não grava a redação do VO por engano', () => {
    const u = User.criar({
      nome: 'Grace',
      email: 'grace@example.com',
      senhaHash: PasswordHash.create(HASH_REAL),
      agora: new Date('2026-09-21T10:00:00Z'),
    });

    const row = UserPrismaMapper.toPersistence(u);
    expect(row.passwordHash).not.toBe('[redacted]');
    expect(String(u.senhaHash())).toBe('[redacted]'); // o VO continua redigindo
  });
});

// ───────────────────────────────────────────────────────────────────────────
// A-07 — `passwordHash` corrompido é FALHA DE INFRAESTRUTURA, não validação.
//
// O VO `PasswordHash.create()` lança `UserValidationException`, e o filtro
// `domain-exception-to-http` mapeia essa exceção para **400**. Uma coluna
// `password_hash` corrompida (migration mal aplicada, restore de backup,
// escrita manual) faria então o `findByEmail()` — chamado no login — responder
// 400 numa falha de infraestrutura: o cliente concluiria que a requisição é
// inválida e reenviaria, e o defeito (a linha corrompida) continuaria lá.
//
// Além do status errado, a mensagem do VO viaja no `detail` da resposta
// (GlobalExceptionFilter: `detail = exception.message` para erro não-Http), e
// a serialização estrutural da exceção (`JSON.stringify`) carrega
// `public readonly campo/motivo`. Qualquer valor bruto que apareça em uma
// mensagem chega ao cliente. Por isso o `catch` troca a exceção em vez de
// repassar a original.
// ───────────────────────────────────────────────────────────────────────────
describe('UserPrismaMapper — passwordHash corrompido é falha de infraestrutura', () => {
  /**
   * Valor que representa o que está na coluna quando ela está CORROMPIDA.
   * Não é um hash argon2id, então `PasswordHash.create` recusa.
   */
  const HASH_CORROMPIDO = 'senha-em-claro-vazada-na-coluna';

  function rowComHashCorrompido(
    passwordHash: string,
    profileId: string | null,
  ): Parameters<typeof UserPrismaMapper.toDomain>[0] {
    return {
      id: '0190a8b6-1234-7abc-9def-0000000000c7',
      email: 'corrompido@example.com',
      name: 'Corrompido',
      passwordHash,
      profileId: profileId ?? null,
      createdAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T10:00:00Z'),
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    };
  }

  /**
   * Executa o mapper e devolve o erro lançado.
   *
   * ⚠️ O `throw` do fim é o que dá DENTE ao bloco: um `expect(...).toThrow()`
   * semcatch passaria tanto para "lançou o erro certo" quanto para "o caminho
   * nem chegou lá". Aqui o "não lançou" é um teste vermelho, não um verde
   * vago.
   */
  function erroLancado(row: Parameters<typeof UserPrismaMapper.toDomain>[0]): unknown {
    try {
      UserPrismaMapper.toDomain(row);
    } catch (erro) {
      return erro;
    }
    throw new Error('UserPrismaMapper.toDomain NÃO lançou — nada foi medido');
  }

  it('responde 500 na fronteira, e NÃO 400 VALIDATION_ERROR', () => {
    const mapeado = mapExceptionToHttp(erroLancado(rowComHashCorrompido(HASH_CORROMPIDO, null)));

    // Este é o teste que mede o A-07 propriamente dito. Sem a tradução, o
    // erro do VO cai no ramo `UserValidationException → 400` do mapper e o
    // login responde "requisição inválida" a uma linha corrompida no banco.
    expect(mapeado.status).toBe(500);
    expect(mapeado.code).toBe('INTERNAL');
  });

  it('lança UserPersistenceException, e NÃO a UserValidationException que o filtro lê como 400', () => {
    const erro = erroLancado(rowComHashCorrompido(HASH_CORROMPIDO, null));

    expect(erro).toBeInstanceOf(UserPersistenceException);
    // Negativa explícita: o `instanceof` de positivo já cairia se
    // `UserPersistenceException` herdasse de `UserValidationException` —
    // o `mapExceptionToHttp` checa `UserValidationException` ANTES do
    // fall-through de 500, e essa herança reabriria o 400 silenciosamente.
    expect(erro).not.toBeInstanceOf(UserValidationException);
  });

  it('NÃO repassa a mensagem original do VO quando ela carrega o valor bruto', () => {
    // O VO hoje não embute o valor nas mensagens (o comentário lá em cima
    // registra essa decisão), então testar só com HASH_CORROMPIDOprovaria
    // nada sobre o mapper: ele não teria como vazar o que não recebe. Para o
    // teste ter DENTE, o VO é neutralizado para lançar uma mensagem que
    // CONTÉM o valor bruto — que é exatamente o cenário que a regra proíbe.
    const spy = vi.spyOn(PasswordHash, 'create').mockImplementation(() => {
      throw new UserValidationException('senhaHash', `valor recebido: ${HASH_CORROMPIDO}`);
    });
    try {
      const erro = erroLancado(rowComHashCorrompido(HASH_CORROMPIDO, null));

      // `message` é o que vira `detail` na resposta (GlobalExceptionFilter).
      expect((erro as Error).message).not.toContain(HASH_CORROMPIDO);
      // E a serialização estrutural — `UserValidationException` tem
      // `public readonly campo/motivo`, que `JSON.stringify` lê como
      // own properties enumeráveis, sem passar por `toString()`.
      expect(JSON.stringify(erro)).not.toContain(HASH_CORROMPIDO);
    } finally {
      spy.mockRestore();
    }
  });

  it('carrega um correlationId não vazio, para o operador casar log e resposta', () => {
    const erro = erroLancado(
      rowComHashCorrompido(HASH_CORROMPIDO, null),
    ) as UserPersistenceException;

    expect(erro.correlationId).toBeTypeOf('string');
    expect(erro.correlationId.trim()).not.toBe('');
  });

  it('dentro de um span ativo, o correlationId é o traceId W3C daquele span', () => {
    // Mesmo par (exercício + asserção) de `users.controller.spec.ts:474-508`,
    // que é onde o repo já mede `AuditContext.correlationId`: um `fakeSpan`
    // com traceId de 32 hex, injetado por `vi.spyOn(trace, 'getSpan')`.
    //
    // Por que o spy e não `context.with(trace.setSpan(...))`: sem um ContextManager
    // registrado (é o caso numa spec unitária — o SDK só sobe em runtime, via
    // `init.ts`), o OTel usa o `NoopContextManager`, e o `with` não propaga o
    // contexto. O teste passaria a medir o fallback `randomUUID()` e não
    // distinguiria "usa o span" de "sempre gera id novo".
    const traceIdDoSpan = 'a'.repeat(32);
    const fakeSpan = {
      spanContext: () => ({ traceId: traceIdDoSpan, spanId: 'b'.repeat(16), traceFlags: 0x01 }),
    } as unknown as Span;
    const getSpanSpy = vi.spyOn(trace, 'getSpan').mockReturnValue(fakeSpan);
    try {
      const erro = erroLancado(
        rowComHashCorrompido(HASH_CORROMPIDO, null),
      ) as UserPersistenceException;

      expect(erro.correlationId).toBe(traceIdDoSpan);
      expect(erro.correlationId).toMatch(/^[0-9a-f]{32}$/);
      expect(erro.message).toContain(traceIdDoSpan); // o operador tem onde casar
    } finally {
      getSpanSpy.mockRestore();
    }
  });

  it('sem span ativo, o correlationId cai no UUID do node:crypto', () => {
    const erro = erroLancado(
      rowComHashCorrompido(HASH_CORROMPIDO, null),
    ) as UserPersistenceException;

    expect(erro.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('cobre também coluna NULL / não-string: o `catch` é genérico de propósito', () => {
    // `UserRow.passwordHash` é `string` no tipo, mas a coluna do Postgres pode
    // vir `null` (migration sem `NOT NULL`, restore parcial). `PasswordHash.create`
    // recusa com "o valor deve ser um texto" — que também é falha de dado, não
    // de requisição. Um `catch` amarrado em `UserValidationException` no lugar
    // passaria no caso do hash malformado e deixaria este vazar como 400.
    const erro = erroLancado({
      ...rowComHashCorrompido(HASH_CORROMPIDO, null),
      passwordHash: null as unknown as string,
      profileId: null,
    });

    expect(mapExceptionToHttp(erro).status).toBe(500);
    expect(erro).toBeInstanceOf(UserPersistenceException);
  });

  it('NÃO inclui identificadores da linha (id/email) na mensagem', () => {
    // O `detail` de um 500 é a mensagem, e o chamador do login é
    // NÃO-autenticado. Um `id` ou `email` na mensagem daria a quem chamou o
    // login a confirmação de que aquele e-mail existe — o mesmo oráculo de
    // enumeração que o `detail` fixo do `InvalidCredentialsException` existe
    // para fechar. A investigação é pelo `correlationId`, não pela resposta.
    const row = rowComHashCorrompido(HASH_CORROMPIDO, null);
    const erro = erroLancado(row) as Error;
    const serializado = JSON.stringify(erro);

    expect(erro.message).not.toContain(row.id);
    expect(erro.message).not.toContain(row.email);
    expect(serializado).not.toContain(row.id);
    expect(serializado).not.toContain(row.email);
  });

  it('um hash argon2id válido continua passando: o `catch` não transforma o caminho feliz em erro', () => {
    // Sem isto, um `catch` com corpo de `return PasswordHash.create(...)`
    // invertido — ou um `catch` que engole a exceção e devolve `null` —
    // passaria em todos os testes acima e quebraria o login inteiro.
    const user = UserPrismaMapper.toDomain(rowComHashCorrompido(HASH_REAL, null));

    expect(user.senhaHash().value).toBe(HASH_REAL);
  });
});

// O guard de fail-fast da exceção mora no arquivo dela, e é a única razão de a
// asserção ser aqui: o mapper nunca chama o construtor com id vazio, então um
// teste do mapper não o alcançaria. `AuditContext` recusa `correlationId`
// vazio pelo mesmo motivo (`audit-context.vo.ts:34-37`).
describe('UserPersistenceException — contrato próprio', () => {
  it('recusa correlationId vazio ou só com espaços, em vez de lançar uma falha sem identificador', () => {
    expect(() => new UserPersistenceException('')).toThrow(TypeError);
    expect(() => new UserPersistenceException('   ')).toThrow(TypeError);
    expect(() => new UserPersistenceException(undefined as unknown as string)).toThrow(TypeError);
  });

  it('normaliza o id com trim e o expõe em `correlationId`', () => {
    const traceId = 'a'.repeat(32);
    const erro = new UserPersistenceException(`  ${traceId}  `);

    expect(erro.correlationId).toBe(traceId);
    // A mensagem é o `detail` da resposta e a chave de casamento do operador;
    // o id tem de estar nela, senão o log não liga com o trace.
    expect(erro.message).toContain(traceId);
  });

  it('sobrevive ao `instanceof` vindo de outro arquivo (Object.setPrototypeOf)', () => {
    // Sem o `setPrototypeOf`, um bundle que transpila `extends Error` para
    // CommonJS faz o `instanceof` responder `false` e o `catch` do mapper
    // vira decorativo. Mesmo defensivo de `user.exceptions.ts:63`.
    expect(new UserPersistenceException('x')).toBeInstanceOf(UserPersistenceException);
    expect(new UserPersistenceException('x').name).toBe('UserPersistenceException');
  });
});
