import type { Metadata } from 'next';
import './globals.css';
import { WebVitalsReporter } from '../src/telemetry/web-vitals-reporter';

export const metadata: Metadata = {
  title: 'Projeto Base',
  description: 'Aplicação Next.js 15 do projeto base',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <WebVitalsReporter />
        {children}
      </body>
    </html>
  );
}
