// apps/api/vitest.workspace.ts
//
// Workspaces para o Vitest 2.x — separa `unit` (specs em memória) de
// `integration` (Testcontainers + Prisma real) e `e2e` (AppModule via
// app.inject).
//
// pt-BR: vitest 2.x não suporta o array `projects` no config raiz; em vez
// disso, define-se aqui via `defineWorkspace`. Cada projeto estende
// vitest.config.ts e sobrescreve só o que lhe é próprio (include/exclude
// de specs, timeouts, pool).
//
// ── Cobertura: duas armadilhas do Vitest 2.1.9 ────────────────────────────
//
// 1. `coverage.thresholds` declarado AQUI é INERTE. O Vitest constrói o
//    reporter de coverage com o `ctx` do projeto RAIZ
//    (`initCoverageProvider` → `ctx.config.coverage`,
//    dist/chunks/cli-api*.js:10582-10588), logo o único threshold que vale
//    é o do `vitest.config.ts`. Não existe opt-out por projeto via config:
//    nem `thresholds: { lines: 0 }` sobrepõe o piso herdado.
//
// 2. Blocos `coverage: { provider, reporter }` por projeto também não têm
//    efeito — o projeto herda os mesmos valores do config raiz, que ele
//    estende. Medido (issue #40): removê-los deixa o `coverage-final.json`
//    do projeto `integration` byte-a-byte idêntico. Eles foram removidos
//    porque além de mortos eram **inválidos**: `coverage` não existe em
//    `ProjectConfig`, e o erro só aparecia porque este arquivo nunca entrou
//    no programa do `tsc` (não está no `include` do tsconfig.json).
//
// O gate de 80% vive no config raiz, derivado do projeto ativo por
// `isCoverageEnforced` (test/config/coverage-floor.ts). Os nomes dos
// projetos são lidos daqui pelo próprio config raiz, então um projeto novo
// é registrado ao ser declarado e, por ser diferente de `unit`,
// automaticamente deixa de ser enforced — nada a fazer aqui.

import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      // `test/config/**` entra porque é onde mora a lógica que decide se o
      // gate é aplicado (issue #40). O caminho já está no `coverage.exclude`
      // do config raiz, então rodar estas specs não altera o denominador.
      include: ['src/**/*.spec.ts', 'test/config/**/*.spec.ts'],
      exclude: ['src/**/*.integration.spec.ts', 'src/**/*.testcontainers.spec.ts'],
      environment: 'node',
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      include: ['src/**/*.integration.spec.ts', 'src/**/*.testcontainers.spec.ts'],
      exclude: [],
      environment: 'node',
      // Testcontainers pode levar mais de 10s para subir a imagem na
      // primeira execução, então elevamos os timeouts. hook cobre
      // beforeAll/afterAll que bootam o container.
      testTimeout: 60_000,
      hookTimeout: 60_000,
      // fork pool com singleFork: o container PostgreSQL é compartilhado
      // por todos os testes da mesma run; múltiplos workers poderiam
      // competir pela mesma porta efêmera.
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      // pt-BR: o coverage RODE neste projeto (visibilidade/relatório), mas
      // o gate de 80% NÃO se aplica a ele — exercita só os adapters
      // Prisma (~38% agregado, esperado). O opt-out é derivado no config
      // raiz pelo `isCoverageEnforced`; ver issue #40 e cobertura-testes.md
      // §CI Enforcement.
    },
  },
  {
    // pt-BR: projeto `e2e` (Fase 7 Task 7.7) — sobe o AppModule inteiro
    // (controller + use cases + PrismaModule + AuditInfraModule) e bate
    // nas rotas HTTP via `app.inject(...)`. Diferente do `integration`
    // porque exercita o boundary HTTP completo: ZodValidationPipe,
    // GlobalExceptionFilter, optimistic locking, ETag/If-Match.
    extends: './vitest.config.ts',
    test: {
      name: 'e2e',
      include: ['test/**/*.e2e.spec.ts'],
      exclude: [],
      environment: 'node',
      // Testcontainers + boot do NestApp + apply migrations — margem
      // generosa para CI.
      testTimeout: 120_000,
      hookTimeout: 120_000,
      // singleFork: o container Postgres + NestApp são compartilhados por
      // todos os testes da run; múltiplos workers competiriam pela mesma
      // porta efêmera e levantariam apps duplicados.
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      // pt-BR: coverage roda para relatório, gate de 80% fica no `unit`.
      // Mesmo motivo do `integration` (ver nota lá).
    },
  },
]);
