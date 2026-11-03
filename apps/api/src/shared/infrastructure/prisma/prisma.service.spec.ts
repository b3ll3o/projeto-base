import { describe, it, expect, vi, afterEach } from 'vitest';

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

// A senha do teste NÃO pode ser uma senha exposta nem um placeholder: o guard
// `verificarCredenciaisDoBanco` roda ANTES do `$connect` mockado, e um guard
// que recusa derruba o teste pelo MOTIVO ERRADO (a spec passa a medir o
// guard, não a tradução).
const SENHA_DE_TESTE = 'senha-de-teste-local-9f2a';
const DATABASE_URL_DE_TESTE = `postgresql://app_runtime:${SENHA_DE_TESTE}@localhost:5432/projeto_base?schema=public`;

describe('PrismaService $connect', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('um erro que NÃO é P1001 sai INTACTO — a mesma instância, com o stack original', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', DATABASE_URL_DE_TESTE);
    const svcModule = await import('./prisma.service.js');
    const erro = new Error('boom');
    vi.spyOn(svcModule.PrismaService.prototype, '$connect').mockRejectedValue(erro);

    const svc = new svcModule.PrismaService();

    await expect(svc.onModuleInit()).rejects.toBe(erro);
  });

  it('o P1001 sai traduzido — a pessoa vê a causa e o comando, não a stack crua', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', DATABASE_URL_DE_TESTE);
    const svcModule = await import('./prisma.service.js');
    vi.spyOn(svcModule.PrismaService.prototype, '$connect').mockRejectedValue({
      errorCode: 'P1001',
      message: "Can't reach database server at `localhost:5432`",
    });

    const svc = new svcModule.PrismaService();

    await expect(svc.onModuleInit()).rejects.toThrow(/P1001/);
    await expect(svc.onModuleInit()).rejects.toThrow(/docker start projeto-base-pg-local/);
    await expect(svc.onModuleInit()).rejects.toThrow(/docs\/como-rodar\.md/);
  });

  it('a mensagem traduzida NÃO carrega a senha do DATABASE_URL', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', DATABASE_URL_DE_TESTE);
    const svcModule = await import('./prisma.service.js');
    vi.spyOn(svcModule.PrismaService.prototype, '$connect').mockRejectedValue({
      errorCode: 'P1001',
      message: 'boom',
    });

    const svc = new svcModule.PrismaService();

    await expect(svc.onModuleInit()).rejects.not.toThrow(new RegExp(SENHA_DE_TESTE));
  });
});
