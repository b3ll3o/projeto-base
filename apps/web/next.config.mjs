/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // pt-BR (2026-10-08): diretório de saída, sobreposto por variável de
  // ambiente para a suíte e2e de Playwright usar o seu próprio.
  //
  // Motivo medido, não teórico: `next build` e `next dev` NÃO dividem o mesmo
  // `.next` com segurança — o build apaga e reescreve o diretório que o dev
  // está servindo, e a app local passa a responder 500 sem nenhum erro no
  // console do build. Aconteceu nesta máquina ao rodar `pnpm build` para
  // medir o custo da suíte, com o `pnpm dev` de pé havia mais de um dia.
  //
  // O default continua `.next`, então Dockerfile, `pnpm dev`, `pnpm build` e
  // `pnpm start` não mudam de comportamento. Quem muda é a suíte, que passa
  // `NEXT_DIST_DIR=.next-e2e` (ver `apps/web/e2e/global-setup.ts`) — assim o
  // e2e pode rodar com a app local aberta, que é o estado normal de quem
  // desenvolve. `.next-e2e/` está no `.gitignore` da raiz ao lado de `.next/`.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Garante que as deps OTel (NodeSDK + instrumentations) e web-vitals
  // sejam empacotadas no output standalone do Next.js — sem esta chave
  // o tracing em runtime falha em prod (Dockerfile copia apenas
  // `.next/standalone`). Task 3.5 do plano de telemetria.
  //
  // IMPORTANTE: em Next.js 15.5.x `outputFileTracingIncludes` é TOP-LEVEL,
  // NÃO nested sob `experimental`. Evidência em
  // `next/dist/build/collect-build-traces.js`:
  //   const { outputFileTracingIncludes = {} } = config;
  outputFileTracingIncludes: {
    '/**': [
      './node_modules/@opentelemetry/**/*',
      './node_modules/web-vitals/**/*',
    ],
  },

  /**
   * O token de CONVITE viaja na URL — e a URL vaza por `Referer`.
   *
   * pt-BR (onboarding de empresa, 2026-10-21): o convite tem DUAS portas
   * (`/convite/<token>` e `/users/novo?convite=`) e o token atravessa o
   * login (`/login?convite=`). O default do browser
   * (`strict-origin-when-cross-origin`) manda a URL INTEIRA no `Referer` de
   * um link MESMO ORIGEM — então um clique em link interno da tela de
   * convite bota o token no log de acesso de outra rota do mesmo servidor.
   * `no-referrer` fecha isso, e `no-store` impede que um proxy guarde a
   * página com o token no corpo.
   *
   * ⚠️ Isto NÃO resolve o problema de fundo — o token na URL É o problema
   * (achado MAJOR 1 da auditoria de segurança do PR #116). O que ele faz é
   * não ESPALHAR o segredo para fora das três telas que o carregam.
   */
  async headers() {
    const semVazarToken = [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'no-store' },
    ];
    return [
      { source: '/convite/:path*', headers: semVazarToken },
      { source: '/users/novo', headers: semVazarToken },
      { source: '/login', headers: semVazarToken },
    ];
  },
};
export default nextConfig;