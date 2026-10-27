// apps/api/src/modules/tenancy/infrastructure/http/admin-tenancy.controller.spec.ts
//
// pt-BR (visão de admin, 2026-10-22): as DUAS rotas do inventário de tenancy.
//
//   GET /admin/tenants → todas as empresas, com os membros de cada uma
//   GET /admin/users   → todos os usuários, com as empresas de cada um
//
// ── O QUE ESTE ARQUIVO SEGURA, E O QUE NÃO SEGURA ──────────────────────────
//
// Segura a BORDA: que a rota existe, que o ator viaja para a use case com o
// `tenantId` e o `isAdmin` que o `JwtAuthGuard` publicou, e que o documento
// OpenAPI declara `security` nas duas (a rota pública é a única que não
// declara — e nenhuma destas duas é pública).
//
// NÃO segura o PORTÃO: quem recusa o gerente de empresa é a use case (D2), e
// o caso está em `tenancy.use-cases.spec.ts`. Aqui o `PermissionsGuard` é
// ABERTO de propósito: um 403 do guard esconderia o 403 da use case, e as
// duas coisas precisam ser observadas em separado.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { ForbiddenException } from '@nestjs/common';

import { AdminTenancyController } from './admin-tenancy.controller.js';
import { TENANCY_USE_CASES, TenancyUseCases } from '../../application/tenancy.use-cases.js';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from '../../../profiles/infrastructure/http/guards/permissions.guard.js';
import { GlobalExceptionFilter } from '../../../../shared/infrastructure/http/global-exception.filter.js';

const SUB = '0190a8b6-0000-7000-8000-000000000001';
const TENANT_OK = '0190a8b6-0000-7000-8000-00000000aaaa';
const USER_OK = '0190a8b6-0000-7000-8000-00000000bbbb';

describe('AdminTenancyController — o inventário de tenancy', () => {
  let app: NestFastifyApplication;
  let listarEmpresasDoSistema: ReturnType<typeof vi.fn>;
  let listarUsuariosDoSistema: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listarEmpresasDoSistema = vi.fn().mockResolvedValue([]);
    listarUsuariosDoSistema = vi.fn().mockResolvedValue([]);

    const useCases = {
      listarEmpresasDoSistema,
      listarUsuariosDoSistema,
    } as unknown as TenancyUseCases;

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminTenancyController],
      providers: [{ provide: TENANCY_USE_CASES, useValue: useCases }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => { user?: unknown } } }) => {
          const req = ctx.switchToHttp().getRequest();
          // O bucket GLOBAL: sem `X-Tenant-Id`, `tenantId` é `null` — e é
          // esse `null` que D2 exige para o administrador do sistema.
          req.user = { sub: SUB, tenantId: null, isAdmin: true };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('devolve todas as empresas com os membros', async () => {
    listarEmpresasDoSistema.mockResolvedValue([
      {
        id: TENANT_OK,
        nome: 'ACME',
        slug: 'acme',
        membros: [
          {
            id: USER_OK,
            nome: 'Ana',
            email: 'ana@acme.com',
            role: 'gerente',
            perfil: 'gerente',
          },
        ],
      },
    ]);

    const resposta = await app.inject({ method: 'GET', url: '/admin/tenants' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([
      {
        id: TENANT_OK,
        nome: 'ACME',
        slug: 'acme',
        membros: [
          {
            id: USER_OK,
            nome: 'Ana',
            email: 'ana@acme.com',
            role: 'gerente',
            perfil: 'gerente',
          },
        ],
      },
    ]);
  });

  it('devolve todos os usuários com as empresas', async () => {
    listarUsuariosDoSistema.mockResolvedValue([
      {
        id: USER_OK,
        nome: 'Ana',
        email: 'ana@acme.com',
        empresas: [
          { id: TENANT_OK, nome: 'ACME', slug: 'acme', role: 'gerente', perfil: 'gerente' },
        ],
      },
    ]);

    const resposta = await app.inject({ method: 'GET', url: '/admin/users' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([
      {
        id: USER_OK,
        nome: 'Ana',
        email: 'ana@acme.com',
        empresas: [
          { id: TENANT_OK, nome: 'ACME', slug: 'acme', role: 'gerente', perfil: 'gerente' },
        ],
      },
    ]);
  });

  it('passa o ator para a use case — com o bucket GLOBAL (`tenantId: null`)', async () => {
    await app.inject({ method: 'GET', url: '/admin/tenants' });
    await app.inject({ method: 'GET', url: '/admin/users' });

    expect(listarEmpresasDoSistema).toHaveBeenCalledWith({
      userId: SUB,
      tenantId: null,
      isAdmin: true,
    });
    expect(listarUsuariosDoSistema).toHaveBeenCalledWith({
      userId: SUB,
      tenantId: null,
      isAdmin: true,
    });
  });

  it('a lista vazia is 200 com corpo vazio — um sistema sem empresa é um sistema', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/admin/tenants' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([]);
  });

  it('a recusa da use case sai 403 — e não 500', async () => {
    listarEmpresasDoSistema.mockRejectedValue(
      new ForbiddenException({ code: 'FORBIDDEN', detail: 'só o administrador do sistema' }),
    );

    const resposta = await app.inject({ method: 'GET', url: '/admin/tenants' });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json().code).toBe('FORBIDDEN');
  });
});

describe('AdminTenancyController — o documento OpenAPI não mente', () => {
  let app: NestFastifyApplication;
  let doc: OpenAPIObject;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminTenancyController],
      providers: [
        {
          provide: TENANCY_USE_CASES,
          useValue: {
            listarEmpresasDoSistema: vi.fn(),
            listarUsuariosDoSistema: vi.fn(),
          } as unknown as TenancyUseCases,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
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

  it('as DUAS rotas exigem token — sem `security` no documento, o cliente não manda Authorization', () => {
    const rotas = doc.paths ?? {};

    expect(rotas['/admin/tenants']?.get?.security).toBeDefined();
    expect(rotas['/admin/users']?.get?.security).toBeDefined();
  });
});
