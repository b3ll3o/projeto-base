/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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