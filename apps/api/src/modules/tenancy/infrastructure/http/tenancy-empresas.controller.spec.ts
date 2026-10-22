// apps/api/src/modules/tenancy/infrastructure/http/tenancy-empresas.controller.spec.ts
//
// pt-BR (onboarding de empresa, 2026-10-21): as DUAS rotas que fecham o
// onboarding —
//
//   POST /tenants     → a empresa de quem JÁ tem conta (a página de criação)
//   GET  /me/tenants  → as empresas do ator (o que o login consulta)
//
// ── POR QUE O CONTROLLER DE VERDADE ───────────────────────────────────────────
// Pipes são aplicados pelo framework, não pela assinatura do método: um teste
// que chamasse `controller.criar(...)` direto PASSARIA VERDE com o body
// inteiro inválido. Aqui o Nest sobe a rota com os decorators resolvidos pelo
// container, então o `@Body(new ZodValidationPipe(…))` só existe se estiver no
// fonte.
//
// ── POR QUE A AFIRMAÇÃO É "O USE CASE NÃO FOI CHAMADO" ─────────────────────
// Status sozinho não distingue "a borda recusou" de "algo depois recusou por
// outro motivo". O `criarEmpresa`/`listarEmpresas` ser chamado é a prova de que
// a borda deixou passar.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { TenancyEmpresasController } from './tenancy-empresas.controller.js';
import { TENANCY_USE_CASES, TenancyUseCases } from '../../application/tenancy.use-cases.js';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { GlobalExceptionFilter } from '../../../../shared/infrastructure/http/global-exception.filter.js';

const SUB = '0190a8b6-0000-7000-8000-000000000001';
const TENANT_OK = '0190a8b6-0000-7000-8000-00000000aaaa';

describe('TenancyEmpresasController — as empresas do ator', () => {
  let app: NestFastifyApplication;
  let criarEmpresa: ReturnType<typeof vi.fn>;
  let listarEmpresas: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    criarEmpresa = vi.fn().mockResolvedValue({ id: TENANT_OK, nome: 'ACME', slug: 'acme' });
    listarEmpresas = vi.fn().mockResolvedValue([]);

    const useCases = { criarEmpresa, listarEmpresas } as unknown as TenancyUseCases;

    // O guard fica ABERTO de propósito: o que está sob teste é a borda do
    // body, e um 401 aqui esconderia o 400 que o teste precisa observar.
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TenancyEmpresasController],
      providers: [{ provide: TENANCY_USE_CASES, useValue: useCases }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => { user?: unknown } } }) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { sub: SUB };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('cria a empresa e devolve a empresa aberta', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: { nome: 'ACME', slug: 'acme' },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({ id: TENANT_OK, nome: 'ACME', slug: 'acme' });
    expect(criarEmpresa).toHaveBeenCalledWith({
      userId: SUB,
      nome: 'ACME',
      slug: 'acme',
    });
  });

  it('recusa um slug fora do formato com 400, sem chamar o use case', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: { nome: 'ACME', slug: 'AcmeCorp' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().code).toBe('VALIDATION_ERROR');
    expect(criarEmpresa).not.toHaveBeenCalled();
  });

  it('recusa um body sem nome com 400, sem chamar o use case', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: { slug: 'acme' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(criarEmpresa).not.toHaveBeenCalled();
  });

  it('recusa um nome de só espaços com 400 — o nome em branco passa o `min`', async () => {
    // pt-BR: `"   "` tem TRÊS caracteres, e o `min(2)` o aceitaria — a
    // empresa nasceria com o nome em branco, e o slug ficaria tomado. O
    // `.trim()` antes do `min` é o que fecha isso, e a API é a fronteira de
    // confiança: quem valida é ela, não o formulário.
    const resposta = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: { nome: '   ', slug: 'acme' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(criarEmpresa).not.toHaveBeenCalled();
  });

  it('apara o identificador nas pontas — o formulário apara, e a API é a fronteira', async () => {
    // pt-BR: o formulário (`empresa-schema.ts`) apara o identificador, e a
    // API NÃO aparava — as DUAS cópias da MESMA regra divergiam no único
    // ponto que produz comportamento observável. Sem o `.trim()` aqui,
    // `" acme "` era RECUSADO com a mensagem de formato ("slug em
    // minúsculo…"), que é a mensagem errada para o problema real (espaço em
    // volta). E quem fala com a API sem passar pelo formulário — curl, outro
    // cliente — levava o 400.
    const resposta = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: { nome: 'ACME', slug: ' acme ' },
    });

    expect(resposta.statusCode).toBe(201);
    expect(criarEmpresa).toHaveBeenCalledWith({ userId: SUB, nome: 'ACME', slug: 'acme' });
  });

  it('lista as empresas do ator', async () => {
    listarEmpresas.mockResolvedValue([
      { id: TENANT_OK, nome: 'ACME', slug: 'acme', role: 'gerente' },
    ]);

    const resposta = await app.inject({ method: 'GET', url: '/me/tenants' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([
      { id: TENANT_OK, nome: 'ACME', slug: 'acme', role: 'gerente' },
    ]);
    expect(listarEmpresas).toHaveBeenCalledWith(SUB);
  });

  it('a lista vazia é 200 com corpo vazio — não 404 (a conta pode estar em onboarding)', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/me/tenants' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([]);
  });
});

describe('TenancyEmpresasController — o documento OpenAPI não mente', () => {
  // pt-BR: no documento OpenAPI deste repo a rota PÚBLICA é a única que não
  // declara `security` — e estas duas exigem JWT. Sem `@ApiBearerAuth()`, o
  // documento as anuncia como públicas: um cliente gerado dele não manda
  // `Authorization` e leva 401 na primeira chamada. Nenhum teste de runtime
  // acusa isso — o guard está certo — e só quem lê o DOCUMENTO vê o erro.
  let app: NestFastifyApplication;
  let doc: OpenAPIObject;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TenancyEmpresasController],
      providers: [
        {
          provide: TENANCY_USE_CASES,
          useValue: {
            criarEmpresa: vi.fn(),
            listarEmpresas: vi.fn(),
          } as unknown as TenancyUseCases,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('t').addBearerAuth().build(),
    );
  });

  afterEach(async () => {
    await app.close();
  });

  function operacao(
    method: string,
    path: string,
  ): { security?: unknown; responses?: Record<string, unknown> } {
    const op = (
      doc.paths[path] as
        Record<string, { security?: unknown; responses?: Record<string, unknown> }> | undefined
    )?.[method];
    expect(op, `operação ${method.toUpperCase()} ${path} ausente do documento`).toBeDefined();
    return op as { security?: unknown; responses?: Record<string, unknown> };
  }

  it('as DUAS rotas exigem bearer no documento', () => {
    expect(operacao('post', '/tenants').security).toEqual([{ bearer: [] }]);
    expect(operacao('get', '/me/tenants').security).toEqual([{ bearer: [] }]);
  });

  // pt-BR: os status DECLARADOS são o contrato que o cliente gerado do
  // documento consome. O `POST /tenants` DEVOLVE 404 (a conta foi apagada
  // entre o token ser emitido e o pedido) e o documento não o anunciava — um
  // cliente gerado não tem ramo para ele, e o erro sai como falha genérica.
  //
  // ⚠️ O que este teste mede é o que o DOCUMENTO DIZ, e não o que o decorator
  // faz: um status declarado que a rota nunca devolve também é mentira (o
  // inverso do defeito, com o mesmo custo para o cliente que lê o documento).
  it('o POST /tenants declara os status que a API devolve', () => {
    const declarados = Object.keys(operacao('post', '/tenants').responses ?? {});
    for (const status of ['201', '400', '401', '404', '409']) {
      expect(declarados, `o documento não declara o ${status}`).toContain(status);
    }
  });
});
