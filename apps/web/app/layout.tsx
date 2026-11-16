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
            landmark main por tela); quem mantém o `<main>` é a página.

            ⚠️ `flex-col md:flex-row` (MEDIDO 2026-11-16, revisão do PR #168):
            o layout era `flex` FIXO, e o `Sidebar` é `w-64 shrink-0` — a
            320px a coluna de conteúdo ficava com 320 − 256 = 64px, e a tela
            rolava na horizontal (WCAG 1.4.10). Empilhando abaixo de `md`, o
            chrome vira uma barra no topo e o CONTEÚDO fica com a largura
            toda — o app reflowa a 320px sem esconder a navegação. */}
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
