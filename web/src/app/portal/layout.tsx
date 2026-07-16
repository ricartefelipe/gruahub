'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Layout do portal do parceiro (ESTABLISHMENT_VIEWER).
 * Separado do dashboard admin — rota /portal.
 * Apenas usuários com role ESTABLISHMENT_VIEWER podem acessar.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/signin');
    }
    // Se autenticado mas sem role de parceiro, redireciona para o dashboard admin
    if (status === 'authenticated') {
      const roles: string[] = (session as any)?.roles ?? [];
      const allowedRoles = ['ESTABLISHMENT_VIEWER', 'PLATFORM_ADMIN', 'TENANT_ADMIN'];
      if (!roles.some(r => allowedRoles.includes(r))) {
        router.replace('/dashboard');
      }
    }
  }, [status, session, router]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">GH</span>
            </div>
            <div>
              <span className="font-semibold text-gray-900">GruaHub</span>
              <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                Portal do Parceiro
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{(session?.user as any)?.email}</span>
            <Link
              href="/api/auth/signout"
              className="text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Sair
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            © {new Date().getFullYear()} GruaHub — Acesso restrito ao parceiro
          </span>
          <a
            href="mailto:suporte@gruahub.com.br"
            className="text-xs text-blue-600 hover:underline"
          >
            Suporte
          </a>
        </div>
      </footer>
    </div>
  );
}
