import type { Metadata } from 'next';
import './globals.css';
import { WebVitalsReporter } from '../src/telemetry/web-vitals-reporter';
import { Sidebar } from '../components/Sidebar';

export const metadata: Metadata = {
  title: 'Projeto Base',
  description: 'Aplicação Next.js 15 do projeto base',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <WebVitalsReporter />
        {/* pt-BR: era `<div class="layout">` + `<main class="layout-content">`,
            duas classes que não existem em `globals.css` — o shell inteiro
            renderizava como texto empilhado sem estilo. E o `<main>` do layout
            envolvia cada página num SEGUNDO `<main>` (a11y: só pode haver um
            landmark main por tela); quem mantém o `<main>` é a página. */}
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
