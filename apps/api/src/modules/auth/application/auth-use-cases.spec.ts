// apps/api/src/modules/auth/application/auth-use-cases.spec.ts
//
// Teste unitário do AuthUseCases — o login é a superfície de segurança
// desta fase, e os casos abaixo são os que a OWASP e o revisor de
// segurança vão perguntar:
//
//   1. login feliz devolve `{accessToken, refreshToken, user}`.
//   2. e-mail inexistente e senha errada levantam a MESMA exceção, com a
//      MESMA mensagem (enumeração de contas).
//   3. `verify()` RODA mesmo sem usuário encontrado (tempo constante) —
//      sem isso, o tempo de resposta diz quais e-mails existem.
//   4. e-mail é normalizado pelo VO (trim + toLowerCase) antes da busca,
//      senão ` Joao@Example.com ` não acha `joao@example.com`.
//   5. usuário soft-deleted não loga.
//   6. renovar valida o refresh e emite par novo.
//   7. eu() devolve o UserOutput.
//
// pt-BR: `User.criar` exige um `senhaHash` que é um `PasswordHash`
// válido. O literal abaixo tem a FORMA argon2id que o VO exige
// (`$argon2id$v=…$m=…,p=…,t=…$salt$digest`) — nenhum byte dele é um
// argon2 de verdade, e nenhum teste deste arquivo verifica contra ele:
// a verificação real é o `passwordHasher` stub, que devolve o booleano.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthUseCases } from './auth-use-cases.js';
import { InvalidCredentialsException } from '../domain/exceptions/auth.exceptions.js';
import { User } from '../../users/domain/user.aggregate.js';
import { PasswordHash } from '../../users/domain/value-objects/password-hash.vo.js';
import { Email } from '../../users/domain/value-objects/email.vo.js';
import { UserId } from '../../users/domain/value-objects/user-id.vo.js';
import type { UserRepositoryPort } from '../../users/domain/ports/user-repository.port.js';
import type { PasswordHasherPort } from '../../users/domain/ports/password-hasher.port.js';
import type { TokenIssuerPort, TokenSubject } from '../domain/ports/token-issuer.port.js';

const HASH_FALSO = '$argon2id$v=19$m=65536,p=4,t=3$c2FsdGZhbG9zb21lc2E$ZGlnZXN0ZWZhbG9zb21lc2E';
const AGORA = new Date('2026-10-09T12:00:00.000Z');

/** pt-BR: `UserId.create` exige UUID v7 — um `sub: 'u-1'` estouraria no VO. */
const UUID_JOAO = '0190a8b6-0000-7000-8000-000000000001';

function criarUser(props: { nome?: string; email?: string; id?: string } = {}): User {
  return User.criar({
    id: props.id ?? UUID_JOAO,
    nome: props.nome ?? 'João',
    email: props.email ?? 'joao@example.com',
    senhaHash: PasswordHash.create(HASH_FALSO),
    agora: AGORA,
  });
}

interface Stubs {
  userRepo: UserRepositoryPort;
  hasher: PasswordHasherPort;
  issuer: TokenIssuerPort;
}

function criarStubs(): Stubs {
  return {
    userRepo: {
      findById: vi.fn(async () => null),
      findByEmail: vi.fn(async () => null),
      save: vi.fn(),
      list: vi.fn(),
      countByProfile: vi.fn(async () => 0),
    },
    hasher: {
      hash: vi.fn(async () => HASH_FALSO),
      verify: vi.fn(async () => false),
    },
    issuer: {
      emitir: vi.fn(async () => ({ accessToken: 'access-token', refreshToken: 'refresh-token' })),
      validarAccessToken: vi.fn(),
      validarRefreshToken: vi.fn(async (): Promise<TokenSubject> => ({
        sub: UUID_JOAO,
        email: 'joao@example.com',
        typ: 'refresh',
      })),
    },
  };
}

function criarUseCases(s: Stubs): AuthUseCases {
  return new AuthUseCases(s.userRepo, s.hasher, s.issuer);
}

describe('AuthUseCases.login', () => {
  let s: Stubs;
  let useCases: AuthUseCases;

  beforeEach(() => {
    s = criarStubs();
    useCases = criarUseCases(s);
  });

  it('sucesso: devolve o par de tokens e o user (sem o hash)', async () => {
    const user = criarUser();
    vi.mocked(s.userRepo.findByEmail).mockResolvedValue(user);
    vi.mocked(s.hasher.verify).mockResolvedValue(true);

    const out = await useCases.login({ email: 'joao@example.com', senha: 'senha-correta' });

    expect(out.accessToken).toBe('access-token');
    expect(out.refreshToken).toBe('refresh-token');
    expect(out.user.id).toBe(user.id().value);
    expect(out.user.email).toBe('joao@example.com');
    expect(out).not.toHaveProperty('senhaHash');
    expect(JSON.stringify(out)).not.toContain('$argon2id$');
  });

  it('emite o token com o `sub` do usuário, não com o e-mail digitado', async () => {
    vi.mocked(s.userRepo.findByEmail).mockResolvedValue(criarUser());
    vi.mocked(s.hasher.verify).mockResolvedValue(true);

    await useCases.login({ email: '  Joao@Example.COM  ', senha: 'senha-correta' });

    expect(s.issuer.emitir).toHaveBeenCalledWith({
      sub: UUID_JOAO,
      email: 'joao@example.com',
    });
  });

  it('normaliza o e-mail pelo VO antes de buscar (trim + toLowerCase)', async () => {
    await useCases.login({ email: '  Joao@Example.COM  ', senha: 'x' }).catch(() => undefined);

    const consultado = vi.mocked(s.userRepo.findByEmail).mock.calls[0]![0] as Email;
    expect(consultado.value).toBe('joao@example.com');
  });

  it('e-mail inexistente → InvalidCredentialsException', async () => {
    vi.mocked(s.userRepo.findByEmail).mockResolvedValue(null);

    await expect(
      useCases.login({ email: 'ninguem@example.com', senha: 'x' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('senha errada → InvalidCredentialsException', async () => {
    vi.mocked(s.userRepo.findByEmail).mockResolvedValue(criarUser());
    vi.mocked(s.hasher.verify).mockResolvedValue(false);

    await expect(
      useCases.login({ email: 'joao@example.com', senha: 'errada' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('os DOIS casos de falha produzem a MESMA exceção, com a MESMA mensagem', async () => {
    vi.mocked(s.userRepo.findByEmail).mockResolvedValue(null);
    const semEmail = await useCases
      .login({ email: 'ninguem@example.com', senha: 'x' })
      .catch((e) => e);

    vi.mocked(s.userRepo.findByEmail).mockResolvedValue(criarUser());
    vi.mocked(s.hasher.verify).mockResolvedValue(false);
    const comSenhaErrada = await useCases
      .login({ email: 'joao@example.com', senha: 'errada' })
      .catch((e) => e);

    expect(semEmail).toBeInstanceOf(InvalidCredentialsException);
    expect(comSenhaErrada).toBeInstanceOf(InvalidCredentialsException);
    expect((semEmail as Error).message).toBe((comSenhaErrada as Error).message);
    expect((semEmail as Error).message).toBe('Credenciais inválidas.');
  });

  it('o `verify` RODA mesmo sem usuário encontrado (tempo constante)', async () => {
    // pt-BR: é esta a asserção que protege da enumeração de contas. Se o
    // código fizer `if (user === null) throw` ANTES de verificar, ela
    // continua verde — e o endpoint passa a responder em ~1 ms para um
    // e-mail inexistente e em ~48 ms para um existente.
    vi.mocked(s.userRepo.findByEmail).mockResolvedValue(null);

    await useCases.login({ email: 'ninguem@example.com', senha: 'x' }).catch(() => undefined);

    expect(s.hasher.verify).toHaveBeenCalledTimes(1);
  });

  it('o `verify` compara contra um hash real, não contra string vazia', async () => {
    // pt-BR: com `''` o argon2.verify lança/curto-circuita e o caminho
    // "e-mail inexistente" fica ordens de grandeza mais rápido que o
    // "existe" — que é a mesma vazão que a asserção acima combatia.
    vi.mocked(s.userRepo.findByEmail).mockResolvedValue(null);

    await useCases.login({ email: 'ninguem@example.com', senha: 'x' }).catch(() => undefined);

    const [, hashUsado] = vi.mocked(s.hasher.verify).mock.calls[0]!;
    expect(hashUsado).toBeTruthy();
    expect(hashUsado).toMatch(/^\$argon2id\$/);
  });

  it('o `verify` recebe a senha em clara e o hash do usuário encontrado', async () => {
    vi.mocked(s.userRepo.findByEmail).mockResolvedValue(criarUser());
    vi.mocked(s.hasher.verify).mockResolvedValue(true);

    await useCases.login({ email: 'joao@example.com', senha: 'senha-correta' });

    expect(s.hasher.verify).toHaveBeenCalledWith('senha-correta', HASH_FALSO);
  });

  it('usuário soft-deleted não loga', async () => {
    const deletado = criarUser();
    deletado.marcarExcluido('pediu para sair', AGORA);
    vi.mocked(s.userRepo.findByEmail).mockResolvedValue(deletado);
    // pt-BR: o repositório em memória devolve o soft-deleted em
    // `findByEmail`; o `isDeleted()` é o que fecha a porta, não o repo.
    vi.mocked(s.hasher.verify).mockResolvedValue(true);

    await expect(
      useCases.login({ email: 'joao@example.com', senha: 'senha-correta' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
    expect(s.issuer.emitir).not.toHaveBeenCalled();
  });

  it('não emite token quando a verificação falha', async () => {
    vi.mocked(s.userRepo.findByEmail).mockResolvedValue(criarUser());
    vi.mocked(s.hasher.verify).mockResolvedValue(false);

    await useCases.login({ email: 'joao@example.com', senha: 'errada' }).catch(() => undefined);

    expect(s.issuer.emitir).not.toHaveBeenCalled();
  });
});

describe('AuthUseCases.renovar', () => {
  let s: Stubs;
  let useCases: AuthUseCases;

  beforeEach(() => {
    s = criarStubs();
    useCases = criarUseCases(s);
    vi.mocked(s.userRepo.findById).mockResolvedValue(criarUser());
  });

  it('valida como refresh e emite um par novo', async () => {
    const out = await useCases.renovar({ refreshToken: 'refresh-antigo' });

    expect(s.issuer.validarRefreshToken).toHaveBeenCalledWith('refresh-antigo');
    expect(out.accessToken).toBe('access-token');
    expect(out.refreshToken).toBe('refresh-token');
  });

  it('NÃO aceita o access token no lugar do refresh', async () => {
    // pt-BR: a separação `typ` é o que impede escalonamento de privilégio
    // por reuso. `validarRefreshToken` rejeita um token `typ: 'access'`
    // — a guarantee é do `JwtTokenService`, testada no spec dele; aqui
    // basta não contornar o port chamando o validador errado.
    vi.mocked(s.issuer.validarAccessToken).mockRejectedValue(new Error('não deve ser chamado'));

    await useCases.renovar({ refreshToken: 'refresh-antigo' });

    expect(s.issuer.validarAccessToken).not.toHaveBeenCalled();
  });

  it('token válido cujo usuário não existe mais → InvalidCredentialsException', async () => {
    vi.mocked(s.userRepo.findById).mockResolvedValue(null);

    await expect(useCases.renovar({ refreshToken: 'refresh-antigo' })).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(s.issuer.emitir).not.toHaveBeenCalled();
  });

  it('token válido de usuário soft-deleted → InvalidCredentialsException', async () => {
    const deletado = criarUser();
    deletado.marcarExcluido('pediu para sair', AGORA);
    vi.mocked(s.userRepo.findById).mockResolvedValue(deletado);

    await expect(useCases.renovar({ refreshToken: 'refresh-antigo' })).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(s.issuer.emitir).not.toHaveBeenCalled();
  });

  it('token rejeitado pelo issuer propaga a exceção, sem emitir par', async () => {
    vi.mocked(s.issuer.validarRefreshToken).mockRejectedValue(new InvalidCredentialsException());

    await expect(useCases.renovar({ refreshToken: 'lixo' })).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(s.issuer.emitir).not.toHaveBeenCalled();
  });
});

describe('AuthUseCases.eu', () => {
  let s: Stubs;
  let useCases: AuthUseCases;

  beforeEach(() => {
    s = criarStubs();
    useCases = criarUseCases(s);
  });

  it('devolve o UserOutput do usuário do token', async () => {
    vi.mocked(s.userRepo.findById).mockResolvedValue(criarUser());

    const out = await useCases.eu(UUID_JOAO);

    expect(out.id).toBe(UUID_JOAO);
    expect(out.email).toBe('joao@example.com');
    expect(out.isDeleted).toBe(false);
  });

  it('o id do token vira um UserId validado antes da busca', async () => {
    vi.mocked(s.userRepo.findById).mockResolvedValue(criarUser());

    await useCases.eu(UUID_JOAO);

    const [id] = vi.mocked(s.userRepo.findById).mock.calls[0]!;
    expect(id).toBeInstanceOf(UserId);
    expect((id as UserId).value).toBe(UUID_JOAO);
  });

  it('usuário ausente → InvalidCredentialsException (401, não 404)', async () => {
    vi.mocked(s.userRepo.findById).mockResolvedValue(null);

    // pt-BR: `me` responde 404 para um token que passou pela assinatura
    // mas cujo usuário sumiu — e o 404 diz ao atacante que o token é
    // autêntico. 401 é a resposta honesta.
    await expect(useCases.eu('0190a8b6-0000-7000-8000-000000000009')).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('o `senhaHash` não aparece no UserOutput', async () => {
    vi.mocked(s.userRepo.findById).mockResolvedValue(criarUser());

    const out = await useCases.eu(UUID_JOAO);

    expect(Object.keys(out).sort()).toEqual([
      'createdAt',
      'deletedAt',
      'email',
      'id',
      'isDeleted',
      'nome',
      'profileId',
      'updatedAt',
      'version',
    ]);
    expect(JSON.stringify(out)).not.toContain('$argon2id$');
  });
});
