// apps/api/src/modules/users/infrastructure/http/users.controller.ts
//
// Controller HTTP do BC Users. Camada fina — delega TUDO para os use cases.
//
// pt-BR:
// - Mutating endpoints wrapped em AuditContextStore.run() para que os use
//   cases possam puxar o AuditContext via AuditContextStore.get().
// - Optimistic locking (RFC 7232): parseIfMatch extrai W/"v<n>" do header
//   `If-Match`; divergência vira ApplicationConcurrencyException → 412.
// - ETag (RFC 7232): toda resposta mutante inclui `ETag: W/"v<n>"` para
//   que clientes possam re-enviá-lo no próximo `If-Match` (evita lost-update).
// - Validation: Zod schemas NÃO estão neste commit (Task 7.5 os adiciona).
//   Por enquanto rely na validação do use case; próxima task adiciona
//   `@Body(new ZodValidationPipe(SchemaDoDto))` por rota.

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyAdapter } from '@nestjs/platform-fastify';

import { AUDIT_SERVICE_PORT } from '../../../../shared/audit/shared/audit.tokens.js';
import { AuditContextStore } from '../../../../shared/audit/shared/audit-context-store.js';
import { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import type {
  AuditServicePort,
  ListHistoryInput,
} from '../../../../shared/audit/application/audit-service.port.js';

import { UserUseCases, USER_USE_CASES } from '../../application/user-use-cases.js';
import type { CreateUserInput } from '../../application/dto/create-user.input.js';
import type { GetUserByIdInput } from '../../application/dto/get-user-by-id.input.js';
import type { ListUsersInput } from '../../application/dto/list-users.input.js';
import type { RestoreUserInput } from '../../application/dto/restore-user.input.js';
import type { SoftDeleteUserInput } from '../../application/dto/soft-delete-user.input.js';
import type { UpdateUserNameInput } from '../../application/dto/update-user-name.input.js';

// pt-BR: extraído de @nestjs/platform-fastify (TReply do FastifyAdapter)
// porque o pacote 'fastify' não é dep direta de @projeto/api nesta fase.
type FastifyReply = Parameters<FastifyAdapter['setHeader']>[0];

/**
 * Body do PATCH /users/:id — apenas `novoNome`. Atualização de email
 * não é exposta via HTTP neste commit: Fase 4/6 quebrou `atualizar`
 * em `atualizarNome` + `atualizarEmail` (ports não suportam partial),
 * e PATCH uniforme `{ email?, name? }` ficaria para uma issue de
 * follow-up que adiciona PATCH/name + PATCH/email (ou vice-versa).
 */
interface UpdateUserBody {
  novoNome: string;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    @Inject(USER_USE_CASES) private readonly userUseCases: UserUseCases,
    @Inject(AUDIT_SERVICE_PORT) private readonly auditService: AuditServicePort,
  ) {}

  // ───────────────────────── POST /users ─────────────────────────
  @Post()
  @ApiOperation({ summary: 'Criar novo usuário' })
  @ApiResponse({
    status: 201,
    description: 'User criado',
    schema: { example: { id: '0190a8b6-…', nome: 'João', email: 'joao@example.com' } },
  })
  @ApiResponse({ status: 409, description: 'Email já em uso' })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  async create(
    @Body() body: CreateUserInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const user = await AuditContextStore.run(this.buildContext(), () =>
      this.userUseCases.criarUser(body),
    );
    reply.header('ETag', `W/"v${user.version}"`);
    reply.status(201);
    return user;
  }

  // ───────────────────────── GET /users ──────────────────────────
  @Get()
  @ApiOperation({ summary: 'Listar usuários (paginado por cursor)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Página de usuários' })
  async list(@Query('cursor') cursor?: string, @Query('limit') limit = '20'): Promise<unknown> {
    const input: ListUsersInput = {
      cursor: cursor ?? null,
      limit: Number(limit),
      includeDeleted: false,
    };
    return this.userUseCases.listar(input);
  }

  // ───────────────────────── GET /users/:id ──────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Buscar usuário por ID' })
  @ApiResponse({ status: 200, description: 'User encontrado' })
  @ApiResponse({ status: 404, description: 'User não encontrado' })
  async findOne(@Param('id') id: string): Promise<unknown> {
    const input: GetUserByIdInput = { id };
    return this.userUseCases.obterPorId(input);
  }

  // ───────────────────────── PATCH /users/:id ───────────────────
  @Patch(':id')
  @ApiOperation({ summary: 'Renomear usuário (optimistic locking via If-Match)' })
  @ApiHeader({
    name: 'If-Match',
    required: true,
    description: 'ETag esperado no formato W/"v<n>"',
  })
  @ApiResponse({ status: 200, description: 'User renomeado' })
  @ApiResponse({ status: 400, description: 'Header If-Match ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'User não encontrado' })
  @ApiResponse({ status: 412, description: 'Conflito de versão (optimistic lock)' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserBody,
    @Headers('if-match') ifMatch: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const expectedVersion = this.parseIfMatch(ifMatch);
    const input: UpdateUserNameInput = {
      id,
      novoNome: body.novoNome,
      expectedVersion,
    };
    const user = await AuditContextStore.run(this.buildContext(), () =>
      this.userUseCases.atualizarNome(input),
    );
    reply.header('ETag', `W/"v${user.version}"`);
    return user;
  }

  // ───────────────────────── DELETE /users/:id ──────────────────
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete do usuário (optimistic locking via If-Match)' })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiResponse({ status: 204, description: 'User soft-deletado' })
  @ApiResponse({ status: 400, description: 'Header If-Match ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'User não encontrado' })
  @ApiResponse({ status: 412, description: 'Conflito de versão' })
  async remove(@Param('id') id: string, @Headers('if-match') ifMatch: string): Promise<void> {
    const expectedVersion = this.parseIfMatch(ifMatch);
    const input: SoftDeleteUserInput = {
      id,
      reason: null,
      expectedVersion,
    };
    await AuditContextStore.run(this.buildContext(), () => this.userUseCases.softDelete(input));
  }

  // ───────────────────────── POST /users/:id/restore ────────────
  @Post(':id/restore')
  @ApiOperation({ summary: 'Restaurar usuário soft-deletado (optimistic locking)' })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiResponse({ status: 201, description: 'User restaurado' })
  @ApiResponse({ status: 400, description: 'Header If-Match ausente ou inválido' })
  @ApiResponse({ status: 404, description: 'User não encontrado' })
  @ApiResponse({ status: 412, description: 'Conflito de versão' })
  async restore(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const expectedVersion = this.parseIfMatch(ifMatch);
    const input: RestoreUserInput = { id, expectedVersion };
    const user = await AuditContextStore.run(this.buildContext(), () =>
      this.userUseCases.restaurar(input),
    );
    reply.header('ETag', `W/"v${user.version}"`);
    reply.status(201);
    return user;
  }

  // ───────────────────────── GET /users/:id/history ─────────────
  @Get(':id/history')
  @ApiOperation({ summary: 'Histórico de auditoria do usuário' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Histórico paginado' })
  async history(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
  ): Promise<unknown> {
    const input: ListHistoryInput = {
      entityName: 'User',
      entityId: id,
      cursor: cursor ?? null,
      limit: Number(limit),
    };
    return this.auditService.listHistory(input);
  }

  // ───────────────────────── helpers ─────────────────────────────

  /**
   * pt-BR: parseia `If-Match: W/"v<n>"` em número.
   * Lança `BadRequestException` (RFC 7807 via GlobalExceptionFilter)
   * para header ausente ou formato inválido. Case-insensitive em W/
   * e tolerante a whitespace externo.
   */
  private parseIfMatch(raw: string | undefined): number {
    if (!raw || raw.trim() === '') {
      throw new BadRequestException({
        code: 'IF_MATCH_REQUIRED',
        detail: 'Header If-Match ausente. Forneça W/"v<n>" para optimistic locking.',
      });
    }
    const match = /^W\/"v(\d+)"$/i.exec(raw.trim());
    if (!match) {
      throw new BadRequestException({
        code: 'IF_MATCH_INVALID',
        detail: 'Header If-Match inválido. Esperado W/"v<n>" (versão numérica).',
      });
    }
    return Number(match[1]);
  }

  /**
   * pt-BR: monta o AuditContext a partir da request. `actorId` é null
   * por enquanto — Fase 8 decodificará o header Authorization (JWT)
   * para popular o campo. `correlationId` é gerado localmente; Fase 8
   * substituirá por X-Request-Id / OpenTelemetry trace-id.
   */
  private buildContext(): AuditContext {
    return new AuditContext({
      actorId: null,
      correlationId: Math.random().toString(36).slice(2),
      source: 'http',
      timestamp: new Date(),
    });
  }
}
