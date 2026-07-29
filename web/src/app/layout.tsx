import type { Metadata } from 'next';
import { Figtree, Syne } from 'next/font/google';
import { Providers } from './providers';
import { themeBootstrapScript } from '@/lib/theme-script';
import './globals.css';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap',
});

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GruaHub — Gestão de Máquinas',
  description: 'Plataforma multitenant para gestão de máquinas de pelúcia e gruas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${syne.variable} ${figtree.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="font-body antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
