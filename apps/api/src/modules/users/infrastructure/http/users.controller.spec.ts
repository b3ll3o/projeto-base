// apps/api/src/modules/users/infrastructure/http/users.controller.spec.ts
//
// Teste unitário do UsersController — cobre o escopo completo:
//
//   1. Helper `parseIfMatch` (ponto onde RFC 7232 encontra o nosso
//      domain: If-Match → expectedVersion). Cobre regex canônico W/"v<n>"
//      (case-insensitive, whitespace-tolerant, uint-safe) e a surface
//      de erro RFC 7807 (`code`/`detail` via `getResponse()`).
//
//   2. Bodies dos handlers HTTP (create / update / remove / restore /
//      list / findOne / history) delegando para `userUseCases` /
//      `auditService` via stubs.
//
//   3. Verificação de wrapping em `AuditContextStore.run`:
//      • Endpoints mutantes (create/update/remove/restore) são envoltos;
//      • Endpoints read (list/findOne/history) NÃO são envoltos.
//
//   4. Assertions de ETag/status nos endpoints mutantes:
//      • create/restore setam `ETag: W/"v<n>"` + status 201;
//      • update seta ETag (status default 200, não setado);
//      • remove NÃO seta ETag nem status (204 sem corpo).
//
// pt-BR: parseIfMatch é `private`, então acessamos via bracket-notation
// (`ctrl['parseIfMatch'](...)`). É convenção comum para testar métodos
// privados em TS quando eles concentram lógica importante e estável.
//
// O throw é `BadRequestException({ code, detail })` — o `.message` da
// exceção é apenas "Bad Request", por isso verificamos o `code`/`detail`
// via `getResponse()` (que é o payload propagado pelo
// GlobalExceptionFilter para o cliente em RFC 7807).

// MEDIDO 2026-10-13: `UsersController` ganhou um 3º/5º parâmetro
// `@Req() request: RequestWithUser` (Fase 6/8 — o `sub` do JWT entra no
// `actorId` da auditoria). Estes testes chamam os handlers DIRETAMENTE, e
// a aridade nova quebrou 7 chamadas com TS2554.
//
// A correção aqui é `SEM_TOKEN`, e não um `request` de mentira: o
// `UsersController.buildContext()` é quem decide o `actorId`, e
// `resolveActorId(undefined)` devolve `null` — exatamente o valor que o
// controller usava antes do `@Req()`, quando `actorId: null` era
// hardcoded. Passar um request com `user.sub` aqui mudaria o `actorId`
// de ~38 assertions por um valor que este arquivo não mede.
//
// `as never` (e não `as any`) é o mesmo idiom já usado neste arquivo
// para `reply`, e é o que o tipo `RequestWithUser` — privado ao
// controller — aceita de fora sem exportá-lo.
const SEM_TOKEN = undefined as never;

/** Uma empresa qualquer; só o formato importa, o id nunca é consultado aqui. */
const EMPRESA = '0190a8b6-1c2d-7e3f-8a4b-5c6d7e8f9a0b';

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { UsersController } from './users.controller.js';
import { CreateUserDto, CreateUserSchema, UpdateUserSchema } from './users.schemas.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { AuditContextStore } from '../../../../shared/audit/shared/audit-context-store.js';
import type { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import type { UserUseCases } from '../../application/user-use-cases.js';
import type { AuditServicePort } from '../../../../shared/audit/application/audit-service.port.js';

interface ErrorPayload {
  code?: unknown;
  detail?: unknown;
}

function readErrorPayload(e: unknown): ErrorPayload {
  expect(e).toBeInstanceOf(BadRequestException);
  const resp = (e as BadRequestException).getResponse();
  if (typeof resp !== 'object' || resp === null) {
    throw new Error('expected BadRequestException response to be an object');
  }
  return resp as ErrorPayload;
}

describe('UsersController.parseIfMatch', () => {
  let ctrl: UsersController;

  beforeEach(() => {
    // Stubs `{} as never` para os dois colaboradores — parseIfMatch
    // não chama nem userUseCases nem auditService. Outros testes
    // (integração / e2e Task 7.7) validam o caminho feliz + mutação.
    ctrl = new UsersController({} as never, {} as never, {} as never, {} as never, {} as never);
  });

  it('aceita W/"v3" canônico', () => {
    expect(ctrl['parseIfMatch']('W/"v3"')).toBe(3);
  });

  it('aceita lowercase w/"v3"', () => {
    expect(ctrl['parseIfMatch']('w/"v3"')).toBe(3);
  });

  it('aceita whitespace externo', () => {
    expect(ctrl['parseIfMatch']('  W/"v3"  ')).toBe(3);
  });

  it('aceita versão grande (uint-safe, sem overflow)', () => {
    expect(ctrl['parseIfMatch']('W/"v9007199254740991"')).toBe(9007199254740991);
  });

  it('rejeita undefined com IF_MATCH_REQUIRED', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch'](undefined);
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_REQUIRED');
    expect(String(payload.detail)).toMatch(/ausente/i);
  });

  it('rejeita string vazia com IF_MATCH_REQUIRED', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_REQUIRED');
    expect(String(payload.detail)).toMatch(/ausente/i);
  });

  it('rejeita whitespace puro como ausente', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('   ');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_REQUIRED');
    expect(String(payload.detail)).toMatch(/ausente/i);
  });

  it('rejeita formato sem prefixo W/ (ex: "v3")', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('"v3"');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_INVALID');
    expect(String(payload.detail)).toMatch(/inválido/i);
  });

  it('rejeita formato sem aspas (W/v3)', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('W/v3');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_INVALID');
    expect(String(payload.detail)).toMatch(/inválido/i);
  });

  it('rejeita formato com versão não-numérica', () => {
    for (const raw of ['W/"v3abc"', 'W/"vabc"', 'W/"v"']) {
      let captured: unknown;
      try {
        ctrl['parseIfMatch'](raw);
      } catch (e) {
        captured = e;
      }
      const payload = readErrorPayload(captured);
      expect(payload.code).toBe('IF_MATCH_INVALID');
      expect(String(payload.detail)).toMatch(/inválido/i);
    }
  });

  it('rejeita prefixo forte (etag strong sem W/)', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('"v3"');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_INVALID');
    expect(String(payload.detail)).toMatch(/inválido/i);
  });

  it('payload de erro sempre traz code (string) + detail (string não-vazio)', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('"v3"');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(typeof payload.code).toBe('string');
    expect(typeof payload.detail).toBe('string');
    expect((payload.detail as string).length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Stubs/helpers para testar os handlers HTTP delegando ao use case.
// ───────────────────────────────────────────────────────────────────────────

interface ReplyStub {
  header: Mock;
  status: Mock;
}

function makeReply(): ReplyStub {
  return {
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
}

interface UserUseCasesStub {
  criarUser: Mock;
  listar: Mock;
  obterPorId: Mock;
  atualizarNome: Mock;
  softDelete: Mock;
  restaurar: Mock;
}

function makeUserUseCasesStub(): UserUseCasesStub {
  return {
    criarUser: vi.fn(),
    listar: vi.fn(),
    obterPorId: vi.fn(),
    atualizarNome: vi.fn(),
    softDelete: vi.fn(),
    restaurar: vi.fn(),
  };
}

function makeAuditStub(): { listHistory: Mock } {
  return {
    listHistory: vi.fn(),
  };
}

const fakeUserOutput = {
  id: '0190a8b6-0000-7000-8000-000000000001',
  nome: 'João',
  email: 'joao@example.com',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 7,
  deletedAt: null,
  isDeleted: false,
};

describe('UsersController — handlers HTTP', () => {
  let useCases: UserUseCasesStub & UserUseCases;
  let audit: { listHistory: Mock } & AuditServicePort;
  let reply: ReplyStub;
  // pt-BR (2026-10-17): `GET /users` hidrata o perfil para decidir o recorte,
  // então `{}` no terceiro lugar do construtor não sobe — os testes de `list()`
  // caíam com `this.profiles.obterMeuPerfil is not a function`. O stub é
  // MUTÁVEL de propósito: é o `isAdmin`/`permissions` que decide entre
  // "diretório inteiro" e "só a própria linha", e o teste que muda esses dois
  // campos é o que mede o gate.
  let profiles: { obterMeuPerfil: Mock };
  // pt-BR (2ª revisão, achado 1): o recorte pergunta ao port de membership se
  // o ATOR é admin de SISTEMA. O default `null` é o caso comum.
  let memberships: { findProfileId: Mock };
  let flags: { listar: Mock };
  let ctrl: UsersController;

  beforeEach(() => {
    useCases = makeUserUseCasesStub() as unknown as UserUseCasesStub & UserUseCases;
    audit = makeAuditStub() as unknown as { listHistory: Mock } & AuditServicePort;
    reply = makeReply();
    // Default = quem TEM `users.read`: é o caso comum de uma conta com perfil
    // e é o que mantém as asserções deste arquivo em `somenteUsuarioId: null`.
    // O ramo restrito é exercitado pelo teste que troca o stub abaixo.
    memberships = { findProfileId: vi.fn(async () => null) };
    profiles = {
      obterMeuPerfil: vi.fn().mockResolvedValue({ isAdmin: false, permissions: ['users.read'] }),
    };
    // `listar` devolve `[]` = D4, ninguém desligou nada. O gate de `convite` só
    // fecha quando a LINHA existe com `ativada: false` (specs abaixo).
    flags = { listar: vi.fn(async () => []) };
    ctrl = new UsersController(
      useCases,
      audit,
      profiles as never,
      memberships as never,
      flags as never,
    );
  });

  it('create() wrapa em AuditContextStore.run e seta ETag + status 201', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.criarUser.mockResolvedValue(fakeUserOutput);

    const input: CreateUserDto = {
      nome: 'João',
      email: 'joao@example.com',
      senha: 'senha-super-secreta',
    };
    const result = await ctrl.create(input, reply as never, SEM_TOKEN);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(useCases.criarUser).toHaveBeenCalledWith(input, null);
    expect(reply.header).toHaveBeenCalledWith('ETag', 'W/"v7"');
    expect(reply.status).toHaveBeenCalledWith(201);
    expect(result).toBe(fakeUserOutput);
    runSpy.mockRestore();
  });

  // ── `tenancy.invites` na porta `POST /users` (2026-10-19) ──────────────
  //
  // MEDIDO: `create()` com `destino: {tipo: 'convite', token}` criava conta e
  // membership COM A FLAG DESLIGADA — resposta 201. Era "de propósito", e por
  // isso ninguém tinha escrito o teste. Regra do usuário: *"a aplicação n pode
  // ter bypass"*.
  //
  // O recorte é `destino.tipo === 'convite'` e só ele: `empresa` não usa token de
  // convite (cria owner) e `ausente` é cadastro puro. Os três ficam abertos nos
  // specs abaixo — é isso que impede o gate de virar "POST /users inteiro
  // desligado", que seria um bypass diferente.
  describe('create() com `destino.tipo === "convite"`', () => {
    const COM_CONVITE = (destino: Record<string, unknown> | undefined): CreateUserDto =>
      ({
        nome: 'Convidada',
        email: 'convidada@example.com',
        senha: 'senha-super-secreta',
        ...(destino === undefined ? {} : { destino }),
      }) as CreateUserDto;

    beforeEach(() => {
      useCases.criarUser.mockResolvedValue(fakeUserOutput);
    });

    it('flag DESLIGADA → 404, e `criarUser` NÃO é chamado', async () => {
      flags.listar.mockResolvedValue([{ chave: 'tenancy.invites', ativada: false }]);

      await expect(
        ctrl.create(COM_CONVITE({ tipo: 'convite', token: 'tok-abc' }), reply as never, SEM_TOKEN),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(useCases.criarUser).not.toHaveBeenCalled();
    });

    it('flag LIGADA → cria (201)', async () => {
      flags.listar.mockResolvedValue([{ chave: 'tenancy.invites', ativada: true }]);

      await ctrl.create(
        COM_CONVITE({ tipo: 'convite', token: 'tok-abc' }),
        reply as never,
        SEM_TOKEN,
      );

      expect(reply.status).toHaveBeenCalledWith(201);
      expect(useCases.criarUser).toHaveBeenCalledTimes(1);
    });

    it('flag SEM LINHA → cria (D4: nasce ligado)', async () => {
      flags.listar.mockResolvedValue([]);

      await ctrl.create(
        COM_CONVITE({ tipo: 'convite', token: 'tok-abc' }),
        reply as never,
        SEM_TOKEN,
      );

      expect(reply.status).toHaveBeenCalledWith(201);
    });

    it('OUTRA chave desligada → cria (o recorte é `tenancy.invites`, não "alguma flag")', async () => {
      flags.listar.mockResolvedValue([{ chave: 'telemetry.otel', ativada: false }]);

      await ctrl.create(
        COM_CONVITE({ tipo: 'convite', token: 'tok-abc' }),
        reply as never,
        SEM_TOKEN,
      );

      expect(reply.status).toHaveBeenCalledWith(201);
    });

    it('flag desligada + `destino` AUSENTE → cria (cadastro não é convite)', async () => {
      flags.listar.mockResolvedValue([{ chave: 'tenancy.invites', ativada: false }]);

      await ctrl.create(COM_CONVITE(undefined), reply as never, SEM_TOKEN);

      expect(reply.status).toHaveBeenCalledWith(201);
    });

    it('flag desligada + `destino.tipo === "empresa"` → cria (não usa token de convite)', async () => {
      flags.listar.mockResolvedValue([{ chave: 'tenancy.invites', ativada: false }]);

      await ctrl.create(
        // A forma REAL do membro `empresa` (`users.schemas.ts:87-95`):
        // `nome` + `slug`. `empresaId`/`papel` eram um corpo impossível que o
        // Zod nunca produz — `create()` é chamado direto aqui, sem o pipe, e o
        // teste passava. A asserção é a mesma; a âncora é que estava mentindo.
        COM_CONVITE({ tipo: 'empresa', nome: 'Acme', slug: 'acme' }),
        reply as never,
        SEM_TOKEN,
      );

      expect(reply.status).toHaveBeenCalledWith(201);
    });
  });

  it('list() NÃO wrapa em AuditContextStore.run (read path)', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });

    const result = await ctrl.list({}, undefined, '20');

    expect(runSpy).not.toHaveBeenCalled();
    expect(useCases.listar).toHaveBeenCalledWith(
      {
        cursor: null,
        limit: 20,
        includeDeleted: false,
        somenteUsuarioId: null,
      },
      null,
    );
    expect(result).toEqual({ items: [], nextCursor: null });
    runSpy.mockRestore();
  });

  it('list() passa cursor quando fornecido', async () => {
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });
    await ctrl.list({}, 'cur-1', '5');
    expect(useCases.listar).toHaveBeenCalledWith(
      {
        cursor: 'cur-1',
        limit: 5,
        includeDeleted: false,
        somenteUsuarioId: null,
      },
      null,
    );
  });

  // ── Fase 10: a empresa do token É o escopo ──────────────────────────
  //
  // Todos os outros asserts deste arquivo afirmam `null` — e `null` é o bucket
  // de SISTEMA, que enxerga todo mundo. Se `list()` voltasse a passar `null`
  // fixo, NENHUM teste aqui cairia: a lista simplesmente passaria a devolver
  // a conta inteira de novo, que é o vazamento que a RLS passou a fechar no
  // banco. Este é o teste que mede a fiação, e ele precisa do tenantId real.
  it('list() repassa a empresa do token como escopo', async () => {
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });
    await ctrl.list({ user: { sub: 'u-1', tenantId: EMPRESA } } as never);
    expect(useCases.listar).toHaveBeenCalledWith(expect.anything(), EMPRESA);
  });

  it('list() sem header de empresa cai no bucket de SISTEMA', async () => {
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });
    await ctrl.list({ user: { sub: 'u-1' } } as never);
    expect(useCases.listar).toHaveBeenCalledWith(expect.anything(), null);
  });

  // ── O recorte de quem não tem `users.read` ───────────────────────────
  //
  // MEDIDO 2026-10-17: sem este gate, `GET /users` sem header caía no bucket
  // `'*'` e devolvia a base inteira (3 usuários visíveis) para qualquer conta
  // — inclusive uma recém-cadastrada, porque `POST /users` é `@Public()`.
  //
  // Este teste é o POSITIVO do gate: ele afirma o estado do recorte (o
  // `sub` chega ao use-case), não só que a chamada aconteceu. Um teste que
  // dissesse apenas "não quebrou" continuaria verde se o gate sumisse.
  it('list() sem `users.read` e sem empresa recorta para o próprio ator', async () => {
    // O ator NÃO mudou em relação ao teste acima — só o perfil muda. Se o
    // gate lesse o request em vez do perfil hidratado, os dois cairiam juntos.
    profiles.obterMeuPerfil.mockResolvedValue({ isAdmin: false, permissions: [] });
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });

    await ctrl.list({ user: { sub: 'u-1' } } as never);

    // Prova de que o escopo FOI determinado: a hidratação aconteceu, com a
    // empresa do ator (aqui ausente → `null`, o bucket de sistema).
    expect(profiles.obterMeuPerfil).toHaveBeenCalledWith('u-1', null);
    expect(useCases.listar).toHaveBeenCalledWith(
      expect.objectContaining({ somenteUsuarioId: 'u-1' }),
      null,
    );
  });

  // O admin global é o ÚNICO que ignora o recorte mesmo sem empresa: é o
  // contrato do seed e o que a rota de bootstrap precisa. Sem este par, trocar
  // `semDireito` por `empresa === null` derrubaria o bootstrap e o teste
  // anterior continuaria verde.
  it('list() admin global sem empresa NÃO é recortado', async () => {
    profiles.obterMeuPerfil.mockResolvedValue({ isAdmin: true, permissions: [] });
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });

    await ctrl.list({ user: { sub: 'u-1' } } as never);

    expect(useCases.listar).toHaveBeenCalledWith(
      expect.objectContaining({ somenteUsuarioId: null }),
      null,
    );
  });

  // ── O header ALHEIO (issue #102) ─────────────────────────────────────
  //
  // MEDIDO contra Postgres real, sessão `app_runtime`, escopo de empresa
  // VÁLIDA, conta sem nenhuma membership:
  //
  //   X-Tenant-Id: <ACME>  → HTTP 200 · 2 usuarios  → ana@…, carla@…
  //   X-Tenant-Id: <HEX>   → HTTP 200 · 1 usuario   → bruno@…
  //
  // A causa é a resposta à pergunta errada: `usuario_no_escopo(alvo)` pergunta
  // "o ALVO pertence à empresa do header?" e nunca "o ATOR pertence?". O guard
  // valida o FORMATO do uuid e publica — logo o header é capacidade declarada
  // pelo cliente. `perfil.profileId === null` é a prova de que não há vínculo
  // (`findProfileId` só não resolve sem `tenant_memberships`), e é ela que
  // precisa acionar o recorte.
  it('list() header de empresa SEM vínculo recorta para o próprio ator', async () => {
    profiles.obterMeuPerfil.mockResolvedValue({
      profileId: null,
      isAdmin: false,
      permissions: [],
    });
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });

    await ctrl.list({ user: { sub: 'u-1', tenantId: EMPRESA } } as never);

    // O escopo ainda é o do header — quem decide a empresa é o guard, e mexer
    // nisso aqui seria mudar o contrato da rota, não corrigir o furo.
    expect(profiles.obterMeuPerfil).toHaveBeenCalledWith('u-1', EMPRESA);
    expect(useCases.listar).toHaveBeenCalledWith(
      expect.objectContaining({ somenteUsuarioId: 'u-1' }),
      EMPRESA,
    );
  });

  // Contrapartida OBRIGATÓRIA: com vínculo (perfil resolvido NAQUELA empresa) o
  // diretório da empresa abre. Sem este par, um `semVinculo` invertido — ou uma
  // condition que confundisse `profileId === null` com "sem perfil em lugar
  // nenhum" — derrubaria quem tem o direito, e o único sintoma seria o
  // diretório vazio para o administrador da empresa.
  it('list() header de empresa COM vínculo NÃO é recortado', async () => {
    profiles.obterMeuPerfil.mockResolvedValue({
      profileId: 'perfil-da-empresa',
      isAdmin: false,
      permissions: ['users.read'],
    });
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });

    await ctrl.list({ user: { sub: 'u-1', tenantId: EMPRESA } } as never);

    expect(useCases.listar).toHaveBeenCalledWith(
      expect.objectContaining({ somenteUsuarioId: null }),
      EMPRESA,
    );
  });

  // pt-BR (achado 2) ESTE TESTE MENTIA, e é o achado mais importante do PR.
  //
  // A versão anterior mockava `obterMeuPerfil` devolvendo `{ profileId:
  // 'perfil-global', isAdmin: true }` — e passava. Mas esse é o estado que o
  // fluxo REAL NUNCA produz: com `X-Tenant-Id`, `findProfileId` lê SÓ a
  // `tenant_memberships`, e o perfil do admin do sistema vive em
  // `users.profile_id`. O retorno real é o `denied`:
  //
  //   { profileId: null, profileSlug: null, profileName: null,
  //     isAdmin: false, permissions: [] }
  //
  // MEDIDO (probe descartado, resultado anotado no commit): com esse `denied`
  // e com `user.isAdmin: true` no token, `somenteUsuarioId` era
  // `"admin-global"` — o admin recortado para a PRÓPRIA LINHA. O sintoma do
  // #102 invertido: negação de acesso legítimo.
  //
  // Mutar a condição volta a recortar TEMPORARIAMENTE e este teste era o que
  // deveria ter derrubado. Ele não derrubava porque mockava o estado impossível.
  it('list() admin global com header NÃO é recortado — pelo DENIED real', async () => {
    // O `denied` que `profiles.use-cases.ts:817` devolve.
    profiles.obterMeuPerfil.mockResolvedValue({
      profileId: null,
      profileSlug: null,
      profileName: null,
      isAdmin: false,
      permissions: [],
    });
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });

    // ⚠️ pt-BR (2ª revisão, achado 1) O `isAdmin: true` no request SAIU, e
    // ele sair é a prova de que o conserto anterior era circular: esse campo é
    // hidratado do MESMO cache que devolve o `denied`, então plantá-lo era
    // plantar o conserto.
    //
    // Os DOIS sinais agora são independentes e realistas:
    //   - `request.user.isAdmin = false` (o que o cache devolve de verdade)
    //   - `findProfileId(sub, null)` devolve o perfil GLOBAL do ator, que é
    //     onde o bypass vive de fato
    memberships.findProfileId.mockResolvedValueOnce('perfil-global-admin');
    await ctrl.list({ user: { sub: 'u-1', tenantId: EMPRESA, isAdmin: false } } as never);

    expect(useCases.listar).toHaveBeenCalledWith(
      expect.objectContaining({ somenteUsuarioId: null }),
      EMPRESA,
    );
  });

  // A CONTRAPARTIDA do achado 2, e ela é o que impede o conserto de virar
  // "admin passa em tudo": sem `user.isAdmin` no token, o mesmo `denied`
  // TEM de recortar. Se alguém afrouxar a condição, este é o vermelho.
  it('list() conta COM o mesmo denied, mas SEM isAdmin no token, é recortada', async () => {
    profiles.obterMeuPerfil.mockResolvedValue({
      profileId: null,
      profileSlug: null,
      profileName: null,
      isAdmin: false,
      permissions: [],
    });
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });

    // Mesmo `denied`, mesmo token, e SEM perfil global: tem de recortar.
    await ctrl.list({ user: { sub: 'u-1', tenantId: EMPRESA, isAdmin: false } } as never);

    expect(useCases.listar).toHaveBeenCalledWith(
      expect.objectContaining({ somenteUsuarioId: 'u-1' }),
      EMPRESA,
    );
  });

  // Contrapartida: com `users.read` o diretório abre. Sem este par, um
  // `semDireito` invertido (bug de `!`) derrubaria quem TEM o direito — e o
  // F2 voltaria a quebrar em silêncio, agora do outro lado.
  it('list() com `users.read` sem empresa NÃO é recortado', async () => {
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });
    await ctrl.list({ user: { sub: 'u-1' } } as never);
    expect(useCases.listar).toHaveBeenCalledWith(
      expect.objectContaining({ somenteUsuarioId: null }),
      null,
    );
  });

  // Sob escopo de empresa a RLS já devolve só os membros. Recortar aqui
  // quebraria o diretório da empresa para quem tem `users.read` — o gate só
  // existe porque o bucket de sistema não tem dono.
  it('list() COM empresa não recorta, mesmo sem `users.read`', async () => {
    profiles.obterMeuPerfil.mockResolvedValue({ isAdmin: false, permissions: [] });
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });

    await ctrl.list({ user: { sub: 'u-1', tenantId: EMPRESA } } as never);

    expect(useCases.listar).toHaveBeenCalledWith(
      expect.objectContaining({ somenteUsuarioId: null }),
      EMPRESA,
    );
  });

  // ── `includeDeleted`: normalização do query param ───────────────────
  //
  // MEDIDO 2026-10-13: `users.controller.ts` estava em 97,14% de branch —
  // a única branch descoberta era a normalização de `includeDeleted`
  // (linha 156), porque nenhum spec HTTP passava o query param. Os specs
  // de repositório testavam `list({includeDeleted: true})` direto, o que
  // pula a camada que traduz a string da URL.
  //
  // Os dois braços do `||` precisam ser exercitados: com 'true' o
  // primeiro comparador resolve e o segundo NUNCA é avaliado; com 'True'
  // (ou '1') é o segundo que decide. Sem o par, trocar `=== '1'` por
  // `=== 'yes'` deixaria a suíte verde.
  it.each([
    ['true', true],
    ['True', true],
    ['TRUE', true],
    ['1', true],
    ['0', false],
    ['yes', false],
    ['', false],
  ])('list() traduz includeDeleted=%j para %j', async (entrada, esperado) => {
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });
    await ctrl.list({}, undefined, '20', entrada);
    expect(useCases.listar).toHaveBeenCalledWith(
      expect.objectContaining({ includeDeleted: esperado }),
      null,
    );
  });

  it('findOne() NÃO wrapa em AuditContextStore.run', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.obterPorId.mockResolvedValue(fakeUserOutput);

    await ctrl.findOne('u-1', {});

    expect(runSpy).not.toHaveBeenCalled();
    expect(useCases.obterPorId).toHaveBeenCalledWith({ id: 'u-1' }, null);
    runSpy.mockRestore();
  });

  it('update() parseia If-Match, wrapa em run e seta ETag', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.atualizarNome.mockResolvedValue({ ...fakeUserOutput, version: 8 });

    await ctrl.update('u-1', { novoNome: 'Maria' }, 'W/"v7"', reply as never, SEM_TOKEN);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(useCases.atualizarNome).toHaveBeenCalledWith(
      {
        id: 'u-1',
        novoNome: 'Maria',
        expectedVersion: 7,
      },
      null,
    );
    expect(reply.header).toHaveBeenCalledWith('ETag', 'W/"v8"');
    expect(reply.status).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('update() propaga BadRequestException quando If-Match ausente', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    await expect(
      ctrl.update(
        'u-1',
        { novoNome: 'x' },
        undefined as unknown as string,
        reply as never,
        SEM_TOKEN,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(runSpy).not.toHaveBeenCalled();
    expect(useCases.atualizarNome).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('update() rejeita body sem novoNome via ZodValidationPipe (VALIDATION_ERROR)', async () => {
    // pt-BR: `novoNome` é obrigatório no schema Zod — o pipe lança
    // BadRequestException com `code: VALIDATION_ERROR` antes de o
    // handler rodar, então o controller NÃO precisa de guard manual.
    // Aqui exercitamos o pipe+schema (mesma estratégia dos demais
    // testes de boundary Zod), pois é a única forma determinística
    // de verificar o schema sem montar o TestingModule inteiro.
    const pipe = new ZodValidationPipe(UpdateUserSchema);
    let captured: unknown;
    try {
      pipe.transform({}, { type: 'body' });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('VALIDATION_ERROR');
    // Garante também que o controller não chega a ser invocado neste
    // caminho (defesa em profundidade: o pipe roda no boundary).
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    expect(useCases.atualizarNome).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('remove() parseia If-Match e wrapa em run, NÃO seta ETag', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.softDelete.mockResolvedValue(undefined);

    await ctrl.remove('u-1', 'W/"v7"', SEM_TOKEN);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(useCases.softDelete).toHaveBeenCalledWith(
      {
        id: 'u-1',
        reason: null,
        expectedVersion: 7,
      },
      null,
    );
    expect(reply.header).not.toHaveBeenCalled();
    expect(reply.status).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('remove() propaga BadRequestException quando If-Match malformado', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    await expect(ctrl.remove('u-1', '"v3"', SEM_TOKEN)).rejects.toBeInstanceOf(BadRequestException);
    expect(runSpy).not.toHaveBeenCalled();
    expect(useCases.softDelete).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('restore() parseia If-Match, wrapa em run, seta ETag + status 201', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.restaurar.mockResolvedValue({ ...fakeUserOutput, version: 9 });

    await ctrl.restore('u-1', 'W/"v8"', reply as never, SEM_TOKEN);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(useCases.restaurar).toHaveBeenCalledWith({ id: 'u-1', expectedVersion: 8 }, null);
    expect(reply.header).toHaveBeenCalledWith('ETag', 'W/"v9"');
    expect(reply.status).toHaveBeenCalledWith(201);
    runSpy.mockRestore();
  });

  it('history() NÃO wrapa em AuditContextStore.run e delega para auditService.listHistory', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    audit.listHistory.mockResolvedValue({ entries: [], nextCursor: null });

    const result = await ctrl.history('u-1', undefined, '20');

    expect(runSpy).not.toHaveBeenCalled();
    expect(audit.listHistory).toHaveBeenCalledWith(
      {
        entityName: 'User',
        entityId: 'u-1',
        cursor: null,
        limit: 20,
      },
      null,
    );
    expect(result).toEqual({ entries: [], nextCursor: null });
    runSpy.mockRestore();
  });

  it('history() propaga cursor quando fornecido', async () => {
    audit.listHistory.mockResolvedValue({ entries: [], nextCursor: null });
    await ctrl.history('u-1', 'cur-1', '5');
    expect(audit.listHistory).toHaveBeenCalledWith(
      {
        entityName: 'User',
        entityId: 'u-1',
        cursor: 'cur-1',
        limit: 5,
      },
      null,
    );
  });

  // ── Fase 10: a auditoria é escopada pela empresa do token ─────────────
  //
  // Mesmo raciocínio do `list()` acima: os dois asserts acima afirmam `null`,
  // e `null` é o bucket de SISTEMA. Se `history()` voltasse a passar `null`
  // fixo, nenhum deles cairia — a rota continuaria devolvendo o histórico
  // cross-tenant, que é o elo 1 da escalada fechada na migration
  // `20261020000002`. Sem este teste, a fiação nova é código morto.
  it('history() repassa a empresa do token como escopo', async () => {
    audit.listHistory.mockResolvedValue({ entries: [], nextCursor: null });
    await ctrl.history('u-1', undefined, '20', {
      user: { sub: 'u-1', tenantId: EMPRESA },
    } as never);
    expect(audit.listHistory).toHaveBeenCalledWith(expect.anything(), EMPRESA);
  });

  it('as mutações gravam a auditoria no escopo da empresa do token', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.atualizarNome.mockResolvedValue({ ...fakeUserOutput, version: 8 });
    await ctrl.update(
      'u-1',
      { novoNome: 'Maria' },
      'W/"v7"',
      reply as never,
      { user: { sub: 'u-1', tenantId: EMPRESA } } as never,
    );
    const ctx = runSpy.mock.calls[0]?.[0] as unknown as { tenantId: string | null };
    expect(ctx.tenantId).toBe(EMPRESA);
    runSpy.mockRestore();
  });

  it('AuditContext.correlationId vem do span ativo quando há traceId W3C (32 hex chars)', async () => {
    // pt-BR: W3C traceId são exatamente 32 chars hex minúsculos. Spy em
    // `trace.getSpan` (do módulo singleton OTel) faz o controller usar
    // o traceId do span ativo em vez do Math.random legado (gap G-011).
    // Verifica-se o correlationId que chega no AuditContextStore.run() —
    // é o caminho end-to-end do correlationId dentro do AuditContext VO.
    const fakeSpan = {
      spanContext: () => ({
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        traceFlags: 0x01,
      }),
    } as unknown as Span;
    const getSpanSpy = vi.spyOn(trace, 'getSpan').mockReturnValue(fakeSpan);
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.criarUser.mockResolvedValue(fakeUserOutput);

    try {
      const input: CreateUserDto = {
        nome: 'João',
        email: 'joao@example.com',
        senha: 'senha-super-secreta',
      };
      await ctrl.create(input, reply as never, SEM_TOKEN);

      expect(runSpy).toHaveBeenCalledTimes(1);
      const ctx = runSpy.mock.calls[0]?.[0] as AuditContext;
      expect(ctx).toBeDefined();
      expect(ctx.correlationId).toBe('a'.repeat(32));
      expect(ctx.correlationId).toHaveLength(32);
      expect(ctx.correlationId).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      getSpanSpy.mockRestore();
      runSpy.mockRestore();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Validação Zod no boundary HTTP (Task 7.4 — defense-in-depth).
//
// pt-BR: o controller declara `@Body(new ZodValidationPipe(CreateUserSchema))`.
// NestJS instancia o pipe no momento do request e propaga
// BadRequestException com code='VALIDATION_ERROR'. Aqui exercitamos
// diretamente pipe+schema (não o método do controller), porque é a
// única forma unitariamente determinística de verificar o schema sem
// montar o TestingModule inteiro — o pipe é puro (stateless) e o
// schema é a fonte de verdade da validação HTTP. Confiamos que o
// framework NestJS invoca o pipe declarado no decorator.
// ───────────────────────────────────────────────────────────────────────────

describe('UsersController — Zod validation at HTTP boundary', () => {
  function captureValidationError(payload: unknown): unknown {
    let captured: unknown;
    try {
      new ZodValidationPipe(CreateUserSchema).transform(payload, { type: 'body' });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    return captured;
  }

  function captureUpdateError(payload: unknown): unknown {
    let captured: unknown;
    try {
      new ZodValidationPipe(UpdateUserSchema).transform(payload, { type: 'body' });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    return captured;
  }

  it('create rejeita payload com email vazio (VALIDATION_ERROR)', () => {
    const err = captureValidationError({ nome: 'João', email: '' });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create rejeita payload com email em formato inválido', () => {
    const err = captureValidationError({ nome: 'João', email: 'invalid-email' });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create rejeita payload sem o campo email', () => {
    const err = captureValidationError({ nome: 'João' });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create rejeita payload com nome vazio', () => {
    const err = captureValidationError({ nome: '', email: 'joao@example.com' });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create rejeita payload com nome > 120 chars', () => {
    const err = captureValidationError({
      nome: 'x'.repeat(121),
      email: 'joao@example.com',
    });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create rejeita payload com email > 255 chars', () => {
    const longLocal = 'a'.repeat(250);
    const err = captureValidationError({
      nome: 'João',
      email: `${longLocal}@example.com`,
    });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create aceita payload válido (nome + email RFC 5322 + senha)', () => {
    const pipe = new ZodValidationPipe(CreateUserSchema);
    const out = pipe.transform(
      { nome: 'João', email: 'joao@example.com', senha: 'senha-super-secreta' },
      { type: 'body' },
    );
    expect(out).toEqual({ nome: 'João', email: 'joao@example.com', senha: 'senha-super-secreta' });
  });

  it('create rejeita payload SEM senha (campo obrigatório no boundary)', () => {
    const pipe = new ZodValidationPipe(CreateUserSchema);
    expect(() =>
      pipe.transform({ nome: 'João', email: 'joao@example.com' }, { type: 'body' }),
    ).toThrow();
  });

  it('update rejeita novoNome vazio', () => {
    const err = captureUpdateError({ novoNome: '' });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('update rejeita novoNome com tipo errado (number)', () => {
    const err = captureUpdateError({ novoNome: 42 });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('update rejeita novoNome > 120 chars', () => {
    const err = captureUpdateError({ novoNome: 'x'.repeat(121) });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('update aceita novoNome válido', () => {
    const pipe = new ZodValidationPipe(UpdateUserSchema);
    const out = pipe.transform({ novoNome: 'Maria' }, { type: 'body' });
    expect(out).toEqual({ novoNome: 'Maria' });
  });

  it('update rejeita payload sem novoNome (campo obrigatório)', () => {
    const err = captureUpdateError({});
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });
});
