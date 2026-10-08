// apps/web/playwright.config.ts
//
// Configuração da suíte e2e de frontend. Ver
// `.agents/specs/conventions/e2e-playwright.md` para a regra que obriga todo
// fluxo de usuário com tela a ter um spec aqui.
//
// ── `workers: 1` ────────────────────────────────────────────────────────────
//
// Não é default — é consequência. O isolamento entre specs é "a listagem está
// vazia", e ela é uma afirmação sobre o BANCO INTEIRO. Com mais de um worker
// dois specs dividem a mesma base, e a mesma asserção: o que semeia para o
// fluxo de duplicado (F4) faz a contagem do fluxo de sucesso (F2) errar. E o
// spec que passa é o que rodou primeiro — não é flake, é sorteio.
//
// É o mesmo motivo do `singleFork` do Vitest no e2e de API.
//
// ── Por que não há `baseURL` ────────────────────────────────────────────────
//
// A porta do Next de teste é escolhida em tempo de execução (a 3001 pode estar
// ocupada pelo `pnpm dev` da pessoa — ver `portaLivre()` em
// `support/portas.ts`), e este arquivo é carregado ANTES do `globalSetup` rodar.
// Um `baseURL` fixado aqui apontaria para uma porta que ainda não existe.
//
// A alternativa seria a config reservar a porta, mas pedir uma porta efêmera
// ao kernel (`listen(0)`) é assíncrono e a config é síncrona. Os specs recebem
// a URL por um fixture (`appUrl`, em `e2e/support/fixtures.ts`), que lê o que
// o setup gravou. Ver o comentário desse arquivo sobre o porquê do arquivo de
// estado.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // `*.spec.ts` e não `*.e2e.ts`: é a convenção do resto do repo (Vitest).
  // O guard `vitest-include.spec.ts` é quem exige isto — ele varre a árvore
  // atrás de specs que nenhum coletor pega. Ver o comentário em `IGNORAR`.
  testMatch: '**/*.spec.ts',

  fullyParallel: false,
  workers: 1,

  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    // pt-BR: sem isto, um e2e que falha não deixa vestígio do que a tela fez.
    // `retain-on-failure` só escreve quando o spec quebra, então não infla o
    // disco nas execuções verdes.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    // pt-BR: a UI é pt-BR. Fixar idioma e fuso tira uma classe inteira de
    // flake de formatação sem custo — nenhum fluxo formata data, mas a
    // listagem devolve um `createdAt` qualquer.
    locale: 'pt-BR',
    timezoneId: 'UTC',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
