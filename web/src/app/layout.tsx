import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from './providers';
import './globals.css';

const inter = localFont({
  src: '../fonts/InterVariable.woff2',
  weight: '100 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GruaHub — Gestão de Máquinas',
  description: 'Plataforma multitenant para gestão de máquinas de pelúcia e gruas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
