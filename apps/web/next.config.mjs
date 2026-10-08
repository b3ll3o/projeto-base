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
};
export default nextConfig;