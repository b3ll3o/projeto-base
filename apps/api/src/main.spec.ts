// apps/api/src/main.spec.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { GlobalExceptionFilter } from './shared/infrastructure/http/global-exception.filter.js';
import { HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyHelmet from '@fastify/helmet';

describe('GlobalExceptionFilter', () => {
  it('converte HttpException em Problem Details (RFC 7807)', () => {
    const filter = new GlobalExceptionFilter();
    const sendSpy = vi.fn();
    const statusSpy = vi.fn().mockReturnValue({ send: sendSpy });
    const fakeReply = { status: statusSpy };
    const host = {
      switchToHttp: () => ({
        getResponse: () => fakeReply,
        getRequest: () => ({ url: '/api/v1/users/u-1', method: 'GET', id: 'req-1' }),
      }),
    } as unknown as ArgumentsHost;
    filter.catch(new HttpException('Não encontrado', HttpStatus.NOT_FOUND), host);
    expect(statusSpy).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const problem = sendSpy.mock.calls[0]![0];
    expect(problem).toMatchObject({
      title: 'NOT_FOUND',
      status: HttpStatus.NOT_FOUND,
      detail: 'Não encontrado',
      instance: 'GET /api/v1/users/u-1',
      code: 'NOT_FOUND',
      traceId: 'req-1',
      type: 'https://errors.projeto.com/NOT_FOUND',
    });
  });
});

// #85: helm test — o plugin `@fastify/helmet` é registrado no FastifyAdapter
// e os security headers canônicos aparecem em qualquer resposta. Testamos
// o plugin isoladamente (sem subir AppModule/Prisma) usando o mesmo helmet
// config do main.ts e validando contra uma rota /health sintética.
// pt-BR: `app` é tipado como `any` porque o tipo FastifyInstance só é acessível
// via `import type` do `fastify`, que NÃO é dep direta do `@projeto/api` (vem
// como subdep transitiva do `@nestjs/platform-fastify`). Resolver isso exigiria
// adicionar `fastify` como devDep — fora do escopo do fix de #85. Os outros
// tests do projeto usam o mesmo padrão (`adapter.getInstance()`) sem declarar
// tipo.
describe('Helmet security headers (#85)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;

  beforeAll(async () => {
    const adapter = new FastifyAdapter({ logger: false });
    app = adapter.getInstance();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await app.register(fastifyHelmet as any, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          imgSrc: ["'none'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'same-origin' },
    });
    app.get('/api/v1/health', async () => ({ status: 'ok' }));
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('aplica Strict-Transport-Security com maxAge >= 1 ano', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const hsts = res.headers['strict-transport-security'];
    expect(hsts).toBeDefined();
    expect(String(hsts)).toMatch(/max-age=31536000/);
  });

  it('aplica X-Content-Type-Options: nosniff', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('aplica X-Frame-Options: SAMEORIGIN (ou DENY)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const xfo = res.headers['x-frame-options'];
    expect(xfo).toBeDefined();
    expect(['SAMEORIGIN', 'DENY']).toContain(String(xfo).toUpperCase());
  });

  it('aplica Content-Security-Policy com default-src self', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(String(csp)).toMatch(/default-src 'self'/);
    expect(String(csp)).toMatch(/script-src 'none'/);
  });
});
