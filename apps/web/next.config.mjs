/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // Garante que as deps OTel (NodeSDK + instrumentations) e web-vitals
    // sejam empacotadas no output standalone do Next.js — sem este bloco
    // o tracing em runtime falha em prod (Dockerfile copia apenas
    // `.next/standalone`). Task 3.5 do plano de telemetria.
    outputFileTracingIncludes: {
      '/**': [
        './node_modules/@opentelemetry/**/*',
        './node_modules/web-vitals/**/*',
      ],
    },
  },
};
export default nextConfig;
