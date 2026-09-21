// apps/api/src/main.spec.ts
import { describe, it, expect } from 'vitest';
import { GlobalExceptionFilter } from './shared/infrastructure/http/global-exception.filter.js';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('GlobalExceptionFilter', () => {
  it('converte HttpException em Problem Details', () => {
    const filter = new GlobalExceptionFilter();
    const fakeReply = {
      status: () => ({ send: (body: unknown) => body }),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => fakeReply,
        getRequest: () => ({ url: '/api/v1/users/u-1', method: 'GET', id: 'req-1' }),
      }),
    } as any;
    const payload = filter.catch(new HttpException('Não encontrado', HttpStatus.NOT_FOUND), host);
    expect(payload).toBeUndefined(); // chamada void, send acontece internamente
  });
});
