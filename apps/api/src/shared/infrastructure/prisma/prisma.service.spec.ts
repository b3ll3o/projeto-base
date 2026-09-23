import { describe, it, expect, vi } from 'vitest';

describe('PrismaService $on handlers', () => {
  it('registra $on("query"), $on("error") e $on("warn") no constructor', async () => {
    const svcModule = await import('./prisma.service.js');
    const $onSpy = vi.spyOn(svcModule.PrismaService.prototype, '$on');

    new svcModule.PrismaService();

    expect($onSpy.mock.calls.length).toBeGreaterThanOrEqual(3);

    const calledEvents = $onSpy.mock.calls.map((c) => c[0]);
    expect(calledEvents).toContain('query');
    expect(calledEvents).toContain('error');
    expect(calledEvents).toContain('warn');

    $onSpy.mockRestore();
  });
});
