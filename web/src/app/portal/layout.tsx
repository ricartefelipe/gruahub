'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
    if (status === 'authenticated') {
      const roles: string[] = (session as { roles?: string[] } | null)?.roles ?? [];
      const allowedRoles = ['ESTABLISHMENT_VIEWER', 'PLATFORM_ADMIN', 'TENANT_ADMIN'];
      if (!roles.some((r) => allowedRoles.includes(r))) {
        router.replace('/dashboard');
      }
    }
  }, [status, session, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center gh-atmosphere-ink">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--mist)]">
      <header className="border-b border-[color:var(--line)] bg-[color:var(--surface)]">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-teal-700">
              <span className="text-xs font-bold text-white">GH</span>
            </div>
            <div>
              <span className="font-display font-semibold text-[color:var(--text)]">GruaHub</span>
              <span className="ml-2 rounded-full bg-[color:var(--surface-muted)] px-2 py-0.5 text-xs text-[color:var(--text-soft)]">
                Portal do Parceiro
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[color:var(--text-muted)]">
              {(session?.user as { email?: string } | undefined)?.email}
            </span>
            <Link
              href="/api/auth/signout"
              className="text-sm text-[color:var(--text-muted)] transition hover:text-[color:var(--text)]"
            >
              Sair
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>

      <footer className="mt-auto border-t border-[color:var(--line)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <span className="text-xs text-[color:var(--text-soft)]">
            © {new Date().getFullYear()} GruaHub — Acesso restrito ao parceiro
          </span>
          <a href="mailto:suporte@gruahub.com.br" className="text-xs text-brand hover:underline">
            Suporte
          </a>
        </div>
      </footer>
    </div>
  );
}
