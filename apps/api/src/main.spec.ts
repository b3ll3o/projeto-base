// apps/api/src/main.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { GlobalExceptionFilter } from './shared/infrastructure/http/global-exception.filter.js';
import { HttpException, HttpStatus } from '@nestjs/common';

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
    } as any;
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
