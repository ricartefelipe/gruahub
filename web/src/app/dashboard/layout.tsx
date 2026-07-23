'use client';

import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';

type NavItem = {
  href: string;
  label: string;
  roles: string[];
};

const ALL_ROLES = [
  'PLATFORM_ADMIN',
  'TENANT_ADMIN',
  'OPERATIONS_MANAGER',
  'FIELD_OPERATOR',
  'TECHNICIAN',
  'FINANCE',
];

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ALL_ROLES },
  { href: '/dashboard/machines', label: 'Máquinas', roles: ALL_ROLES },
  {
    href: '/dashboard/locations',
    label: 'Pontos',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'OPERATIONS_MANAGER', 'FIELD_OPERATOR', 'FINANCE'],
  },
  {
    href: '/dashboard/payments',
    label: 'Pagamentos',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'FINANCE', 'OPERATIONS_MANAGER'],
  },
  {
    href: '/dashboard/promotions',
    label: 'Promoções',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'OPERATIONS_MANAGER', 'FINANCE'],
  },
  {
    href: '/dashboard/reconciliation',
    label: 'Conciliação',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'FINANCE', 'OPERATIONS_MANAGER'],
  },
  {
    href: '/dashboard/inventory',
    label: 'Estoque',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'FIELD_OPERATOR', 'FINANCE', 'TECHNICIAN', 'OPERATIONS_MANAGER'],
  },
  {
    href: '/dashboard/visits',
    label: 'Visitas',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'FIELD_OPERATOR', 'OPERATIONS_MANAGER'],
  },
  {
    href: '/dashboard/routes',
    label: 'Rotas',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'FIELD_OPERATOR', 'OPERATIONS_MANAGER'],
  },
  {
    href: '/dashboard/finance',
    label: 'Financeiro',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'FINANCE'],
  },
  {
    href: '/dashboard/fiscal',
    label: 'Fiscal',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'FINANCE'],
  },
  {
    href: '/dashboard/maintenance',
    label: 'Manutenção',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'TECHNICIAN', 'FIELD_OPERATOR', 'OPERATIONS_MANAGER'],
  },
  {
    href: '/dashboard/alerts',
    label: 'Alertas',
    roles: ALL_ROLES,
  },
  {
    href: '/dashboard/reports',
    label: 'Relatórios',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'FINANCE', 'OPERATIONS_MANAGER'],
  },
  {
    href: '/dashboard/audit',
    label: 'Auditoria',
    roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'],
  },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? '/dashboard';

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  const roles: string[] = (session as { roles?: string[] } | null)?.roles ?? [];

  const visibleNav = useMemo(() => {
    if (roles.length === 0) return navItems;
    return navItems.filter((item) => item.roles.some((r) => roles.includes(r)));
  }, [roles]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <p className="text-lg font-semibold text-blue-400">GruaHub</p>
          <p className="text-sm text-slate-400 mt-2">Carregando sessão…</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const email = (session.user as { email?: string } | undefined)?.email ?? '';

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950">
      <aside className="w-60 bg-slate-950 text-white flex flex-col flex-shrink-0 border-r border-slate-800">
        <div className="px-5 py-5 border-b border-slate-800">
          <p className="text-xl font-bold tracking-tight text-white">GruaHub</p>
          <p className="text-xs text-slate-400 mt-1 truncate" title={email}>
            {email}
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navegação principal">
          <ul className="space-y-0.5">
            {visibleNav.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={
                      active
                        ? 'flex items-center px-3 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white'
                        : 'flex items-center px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors'
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full text-left text-sm text-slate-400 hover:text-white transition-colors rounded px-1 py-1"
            aria-label="Sair do sistema"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6 md:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
