'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/dashboard/machines', label: 'Máquinas', icon: '🎰' },
  { href: '/dashboard/locations', label: 'Pontos', icon: '📍' },
  { href: '/dashboard/payments', label: 'Pagamentos', icon: '💳' },
  { href: '/dashboard/reconciliation', label: 'Conciliação', icon: '⚖️' },
  { href: '/dashboard/inventory', label: 'Estoque', icon: '📦' },
  { href: '/dashboard/visits', label: 'Visitas', icon: '🗓️' },
  { href: '/dashboard/routes', label: 'Rotas', icon: '🗺️' },
  { href: '/dashboard/finance', label: 'Financeiro', icon: '💰' },
  { href: '/dashboard/maintenance', label: 'Manutenção', icon: '🔧' },
  { href: '/dashboard/alerts', label: 'Alertas', icon: '🔔' },
  { href: '/dashboard/reports', label: 'Relatórios', icon: '📈' },
  { href: '/dashboard/audit', label: 'Auditoria', icon: '🔍' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-gray-500">Carregando sessão...</span>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-slate-900">
      <aside className="w-64 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-blue-400">GruaHub</h1>
          <p className="text-xs text-gray-400 mt-1">{(session.user as any)?.email}</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-2" aria-label="Navegação principal">
          <ul className="space-y-1">
            {navItems.map(item => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300
                             hover:bg-gray-700 hover:text-white transition-colors duration-150
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-700">
          <ThemeToggle />
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full text-sm text-gray-400 hover:text-white transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            aria-label="Sair do sistema"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto dark:bg-slate-900">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
