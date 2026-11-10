// apps/api/src/shared/idempotency/infrastructure/http/idempotency.interceptor.spec.ts
//
// pt-BR (2026-11-10 — conformidade do system design): o INTERCEPTOR da
// idempotência de escrita.
//
// O QUE ESTE ARQUIVO PROVA
//
// O port é um dublê — o que se mede aqui é a DECISÃO do interceptor: quando
// ele age, quando ele não age, o que ele devolve no replay, e o que ele
// faz com a chave quando a operação falha. O adapter Prisma é medido contra
// Postgres de verdade (o projeto `integration`).
//
// ⚠️ Por que um dublê e não o adapter real: o interceptor decide em cima do
// VEREDITO do port (`livre`/`replay`/`conflito`/`em_voo`), e cada um desses
// ramos precisa serprovocado — o que no banco exigiria fabricar corrida.

import { describe, it, expect, vi } from 'vitest';
import { firstValueFrom, of, throwError } from 'rxjs';
import type { ExecutionContext } from '@nestjs/common';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  HEADER_DE_IDEMPOTENCIA,
  HEADER_DE_REPLAY,
  type HeadersDaResposta,
  type IdempotencyPort,
  type ImpressaoDePedido,
  type ReservaDeChave,
} from '../../application/idempotency.port.js';
import { IdempotencyInterceptor, impressaoDoPedido } from './idempotency.interceptor.js';

/** O pepper de teste — a impressão depende dele (é o HMAC que a calcula). */
const PEPPER = 'pepper-de-teste-da-impressao-do-pedido';

/** O port, dublê: o interceptor só precisa do VEREDITO. */
class PortDuble implements IdempotencyPort {
  reservas: ImpressaoDePedido[] = [];
  guardados: {
    chave: string;
    ator: string;
    status: number;
    resposta: unknown;
    headers: HeadersDaResposta;
  }[] = [];
  liberados: { chave: string; ator: string }[] = [];
  veredito: ReservaDeChave = { estado: 'livre' };
  falhaAoGuardar: Error | null = null;

  async reservar(pedido: ImpressaoDePedido): Promise<ReservaDeChave> {
    this.reservas.push(pedido);
    return this.veredito;
  }
  async guardar(input: {
    chave: string;
    ator: string;
    status: number;
    resposta: unknown;
    headers: HeadersDaResposta;
  }): Promise<void> {
    if (this.falhaAoGuardar !== null) throw this.falhaAoGuardar;
    this.guardados.push(input);
  }
  async liberar(input: { chave: string; ator: string }): Promise<void> {
    this.liberados.push(input);
  }
}

/** O request mínimo que o interceptor lê. */
function request(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    method: 'POST',
    url: '/api/v1/users',
    routeOptions: { url: '/api/v1/users' },
    headers: { [HEADER_DE_IDEMPOTENCIA]: 'chave-1' },
    body: { nome: 'João', email: 'joao@example.com' },
    ...extra,
  };
}

/**
 * O reply mínimo: o interceptor escreve status e header nele, e LÊ os
 * headers que ele já tem (`getHeaders()`).
 */
function reply(): {
  statusCode: number;
  headers: Record<string, string>;
  status: (codigo: number) => { statusCode: number };
  header: (nome: string, valor: string) => { headers: Record<string, string> };
  getHeaders: () => Record<string, string>;
} {
  const alvo = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status(codigo: number) {
      alvo.statusCode = codigo;
      return alvo;
    },
    header(nome: string, valor: string) {
      alvo.headers[nome] = valor;
      return alvo;
    },
    getHeaders() {
      return alvo.headers;
    },
  };
  return alvo;
}

function contextoDe(req: Record<string, unknown>, res: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('IdempotencyInterceptor', () => {
  it('SEM o header, o pedido passa direto — o port nem é chamado', async () => {
    const port = new PortDuble();
    const interceptor = new IdempotencyInterceptor(port);
    const req = request({ headers: {} });

    const resposta = await firstValueFrom(
      await interceptor.intercept(contextoDe(req, reply()), {
        handle: () => of({ id: 'u-1' }),
      }),
    );

    expect(resposta).toEqual({ id: 'u-1' });
    expect(port.reservas).toHaveLength(0);
    expect(port.guardados).toHaveLength(0);
  });

  it('FORA de POST, o pedido passa direto — o port nem é chamado', async () => {
    const port = new PortDuble();
    const interceptor = new IdempotencyInterceptor(port);
    const req = request({ method: 'PATCH' });

    await firstValueFrom(
      await interceptor.intercept(contextoDe(req, reply()), {
        handle: () => of({ id: 'u-1' }),
      }),
    );

    expect(port.reservas).toHaveLength(0);
  });

  it('em /auth, o pedido passa direto — a sessão tem semântica própria', async () => {
    // O refresh token é de uso ÚNICO e é rotacionado: um replay ali
    // devolveria um token já consumido.
    const port = new PortDuble();
    const interceptor = new IdempotencyInterceptor(port);
    const req = request({
      url: '/api/v1/auth/refresh',
      routeOptions: { url: '/api/v1/auth/refresh' },
    });

    await firstValueFrom(
      await interceptor.intercept(contextoDe(req, reply()), {
        handle: () => of({ ok: true }),
      }),
    );

    expect(port.reservas).toHaveLength(0);
  });

  it('com a chave LIVRE, o handler roda e a resposta é guardada', async () => {
    const port = new PortDuble();
    const interceptor = new IdempotencyInterceptor(port);
    const res = reply();
    res.statusCode = 201;

    const resposta = await firstValueFrom(
      await interceptor.intercept(contextoDe(request(), res), {
        handle: () => of({ id: 'u-1' }),
      }),
    );

    expect(resposta).toEqual({ id: 'u-1' });
    expect(port.guardados).toEqual([
      {
        chave: 'chave-1',
        ator: 'anônimo',
        status: 201,
        resposta: { id: 'u-1' },
        headers: {},
      },
    ]);
  });

  it('guarda SÓ os headers que o handler escreveu (o `ETag`), não os de infraestrutura', async () => {
    const port = new PortDuble();
    const interceptor = new IdempotencyInterceptor(port);
    const res = reply();
    // O header de INFRAESTRUTURA: ele já está no reply antes do handler
    // (o rate limit e o helmet escrevem antes do interceptor) — e é do
    // request, não da resposta.
    res.headers['x-ratelimit-limit'] = '100';

    await firstValueFrom(
      await interceptor.intercept(contextoDe(request(), res), {
        handle: () => {
          // O que o HANDLER escreve: o `ETag` do `POST /users`.
          res.header('etag', 'W/"v1"');
          return of({ id: 'u-1' });
        },
      }),
    );

    expect(port.guardados[0]?.headers).toEqual({ etag: 'W/"v1"' });
  });

  it('com REPLAY, o handler NÃO roda e a MESMA resposta volta', async () => {
    const port = new PortDuble();
    port.veredito = {
      estado: 'replay',
      status: 201,
      resposta: { id: 'u-1' },
      headers: { etag: 'W/"v1"' },
    };
    const interceptor = new IdempotencyInterceptor(port);
    const res = reply();
    const handler = vi.fn(() => of({ id: 'u-2' }));

    const resposta = await firstValueFrom(
      await interceptor.intercept(contextoDe(request(), res), { handle: handler }),
    );

    expect(handler).not.toHaveBeenCalled();
    expect(resposta).toEqual({ id: 'u-1' });
    expect(res.statusCode).toBe(201);
    expect(res.headers[HEADER_DE_REPLAY]).toBe('true');
    // O `ETag` da primeira vez volta: sem ele, a resposta do retry não
    // seria a mesma da original.
    expect(res.headers['etag']).toBe('W/"v1"');
  });

  it('com CONFLITO (a chave reusada com outro pedido), responde 409', async () => {
    const port = new PortDuble();
    port.veredito = { estado: 'conflito' };
    const interceptor = new IdempotencyInterceptor(port);

    await expect(
      interceptor.intercept(contextoDe(request(), reply()), {
        handle: () => of({}),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('com a chave EM VOO, responde 409', async () => {
    const port = new PortDuble();
    port.veredito = { estado: 'em_voo' };
    const interceptor = new IdempotencyInterceptor(port);

    await expect(
      interceptor.intercept(contextoDe(request(), reply()), {
        handle: () => of({}),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('quando a operação ERRA, a chave é liberada para o cliente repetir', async () => {
    const port = new PortDuble();
    const interceptor = new IdempotencyInterceptor(port);

    await expect(
      firstValueFrom(
        await interceptor.intercept(contextoDe(request(), reply()), {
          handle: () => throwError(() => new Error('deu ruim')),
        }),
      ),
    ).rejects.toThrow('deu ruim');

    expect(port.liberados).toEqual([{ chave: 'chave-1', ator: 'anônimo' }]);
    expect(port.guardados).toHaveLength(0);
  });

  it('quando GUARDAR a resposta falha, o cliente ainda recebe a resposta', async () => {
    // A operação JÁ ACONTECEU: virar 500 aqui faria o cliente repetir, e o
    // retry faria a operação DUAS vezes. O registro da falha fica no log.
    const port = new PortDuble();
    port.falhaAoGuardar = new Error('o banco caiu');
    const interceptor = new IdempotencyInterceptor(port);

    const resposta = await firstValueFrom(
      await interceptor.intercept(contextoDe(request(), reply()), {
        handle: () => of({ id: 'u-1' }),
      }),
    );

    expect(resposta).toEqual({ id: 'u-1' });
    // E a chave NÃO foi liberada — liberada, ela autorizaria a duplicata.
    expect(port.liberados).toHaveLength(0);
  });

  it('o ATOR escopa a chave: a chave de uma conta não vale para outra', async () => {
    const port = new PortDuble();
    const interceptor = new IdempotencyInterceptor(port);

    await firstValueFrom(
      await interceptor.intercept(contextoDe(request({ user: { sub: 'user-1' } }), reply()), {
        handle: () => of({ id: 'u-1' }),
      }),
    );

    expect(port.reservas[0]?.ator).toBe('user-1');
  });

  describe('a impressão do pedido', () => {
    it('NÃO depende da ordem das chaves do corpo', () => {
      const a = impressaoDoPedido(
        request({ body: { nome: 'João', email: 'j@e.com' } }) as never,
        PEPPER,
      );
      const b = impressaoDoPedido(
        request({ body: { email: 'j@e.com', nome: 'João' } }) as never,
        PEPPER,
      );
      expect(a).toBe(b);
    });

    it('MUDA quando o corpo muda — a mesma chave com outro pedido é conflito', () => {
      const a = impressaoDoPedido(request({ body: { nome: 'João' } }) as never, PEPPER);
      const b = impressaoDoPedido(request({ body: { nome: 'Maria' } }) as never, PEPPER);
      expect(a).not.toBe(b);
    });

    it('MUDA quando a rota muda', () => {
      const a = impressaoDoPedido(request() as never, PEPPER);
      const b = impressaoDoPedido(
        request({
          url: '/api/v1/tenants',
          routeOptions: { url: '/api/v1/tenants' },
        }) as never,
        PEPPER,
      );
      expect(a).not.toBe(b);
    });

    // ⚠️ O path param: `POST /tenants/:id/invitations` tem o MESMO template
    // para toda empresa. Se a impressão usasse o template, a resposta da
    // empresa A seria replayada na empresa B.
    it('MUDA quando o PATH PARAM muda (o template não basta)', () => {
      const a = impressaoDoPedido(
        request({
          url: '/api/v1/tenants/empresa-a/invitations',
          routeOptions: { url: '/api/v1/tenants/:id/invitations' },
        }) as never,
        PEPPER,
      );
      const b = impressaoDoPedido(
        request({
          url: '/api/v1/tenants/empresa-b/invitations',
          routeOptions: { url: '/api/v1/tenants/:id/invitations' },
        }) as never,
        PEPPER,
      );
      expect(a).not.toBe(b);
    });

    // ⚠️ O escopo: o `tenantId` não está na URL.
    it('MUDA quando o ESCOPO (empresa) muda', () => {
      const a = impressaoDoPedido(
        request({ user: { sub: 'u-1', tenantId: 'empresa-a' } }) as never,
        PEPPER,
      );
      const b = impressaoDoPedido(
        request({ user: { sub: 'u-1', tenantId: 'empresa-b' } }) as never,
        PEPPER,
      );
      expect(a).not.toBe(b);
    });

    // ⚠️ O pepper: o corpo cru carrega a senha em texto plano, e um SHA-256
    // simples seria um oráculo de senha barato para quem lê a tabela.
    it('MUDA quando o PEPPER muda — a impressão não é um hash do corpo', () => {
      const a = impressaoDoPedido(request() as never, PEPPER);
      const b = impressaoDoPedido(request() as never, 'outro-pepper');
      expect(a).not.toBe(b);
    });
  });

  it('um status que NÃO é 2xx NÃO é guardado — a chave é liberada', async () => {
    const port = new PortDuble();
    const interceptor = new IdempotencyInterceptor(port);
    const res = reply();
    res.statusCode = 422;

    await firstValueFrom(
      await interceptor.intercept(contextoDe(request(), res), { handle: () => of({ erro: true }) }),
    );

    expect(port.guardados).toHaveLength(0);
    expect(port.liberados).toEqual([{ chave: 'chave-1', ator: 'anônimo' }]);
  });

  it('uma chave maior que o teto é recusada com 400 (a chave vai para a PK)', async () => {
    const port = new PortDuble();
    const interceptor = new IdempotencyInterceptor(port);
    const req = request({ headers: { [HEADER_DE_IDEMPOTENCIA]: 'x'.repeat(256) } });

    await expect(
      interceptor.intercept(contextoDe(req, reply()), { handle: () => of({}) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(port.reservas).toHaveLength(0);
  });
});
