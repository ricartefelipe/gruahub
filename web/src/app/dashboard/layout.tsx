'use client';

import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BrandMark } from '@/components/BrandMark';
import { LoadingScreen } from '@/components/LoadingScreen';

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

const navSections = [
  {
    label: 'Frota',
    hrefs: ['/dashboard', '/dashboard/machines', '/dashboard/locations'],
  },
  {
    label: 'Operação',
    hrefs: ['/dashboard/routes', '/dashboard/visits', '/dashboard/inventory', '/dashboard/maintenance', '/dashboard/alerts'],
  },
  {
    label: 'Financeiro',
    hrefs: ['/dashboard/payments', '/dashboard/promotions', '/dashboard/reconciliation', '/dashboard/finance', '/dashboard/fiscal', '/dashboard/reports'],
  },
  {
    label: 'Sistema',
    hrefs: ['/dashboard/audit'],
  },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-5">
      {navSections.map((section) => {
        const sectionItems = section.hrefs
          .map((href) => items.find((item) => item.href === href))
          .filter((item): item is NavItem => Boolean(item));

        if (sectionItems.length === 0) return null;

        return (
          <li key={section.label}>
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {section.label}
            </p>
            <ul className="space-y-1">
              {sectionItems.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`gh-nav-link ${active ? 'gh-nav-link-active' : 'gh-nav-link-idle'}`}
                    >
                      {active ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-white gh-pulse" aria-hidden="true" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-600" aria-hidden="true" />
                      )}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? '/dashboard';
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const visibleNav = useMemo(() => {
    const roles: string[] = (session as { roles?: string[] } | null)?.roles ?? [];
    if (roles.length === 0) return navItems.filter((item) => item.href === '/dashboard');
    return navItems.filter((item) => item.roles.some((r) => roles.includes(r)));
  }, [session]);

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (!session) return null;

  const email = (session.user as { email?: string } | undefined)?.email ?? '';

  return (
    <div className="flex h-screen overflow-hidden bg-[color:var(--mist)] text-[color:var(--text)]">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-ink text-white lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <BrandMark size="sm" light />
          <p className="mt-3 truncate text-xs text-slate-400" title={email}>
            {email}
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navegação principal">
          <NavList items={visibleNav} pathname={pathname} />
        </nav>

        <div className="space-y-3 border-t border-white/10 p-4">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
            aria-label="Sair do sistema"
          >
            Sair
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-50 flex h-full w-[min(20rem,86vw)] flex-col bg-ink text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <BrandMark size="sm" light />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/5"
              >
                Fechar
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navegação mobile">
              <NavList items={visibleNav} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </nav>
            <div className="space-y-3 border-t border-white/10 p-4">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                Sair
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] bg-[color:var(--surface)]/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-xl border border-[color:var(--line)] px-3 py-2 text-sm font-semibold"
            aria-label="Abrir menu"
          >
            Menu
          </button>
          <BrandMark size="sm" />
          <span className="w-14" />
        </header>

        <main className="relative flex-1 overflow-auto">
          <div className="pointer-events-none absolute inset-0 gh-atmosphere opacity-80" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl p-4 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
