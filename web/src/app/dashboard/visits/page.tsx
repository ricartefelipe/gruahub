'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface Visit {
  id: string;
  operatingPointId: string;
  operatingPointName: string;
  status: string;
  responsibleName: string;
  checkinAt: string | null;
  checkoutAt: string | null;
  cashCollectedCents: number | null;
  createdAt: string;
}

type StatusFilter = 'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const STATUS_META: Record<string, { label: string; className: string }> = {
  IN_PROGRESS: { label: 'Em andamento', className: 'bg-amber-100 text-amber-800' },
  COMPLETED: { label: 'Concluída', className: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Cancelada', className: 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]' },
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMoney(cents: number | null) {
  if (cents == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export default function VisitsPage() {
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  const { data: visits = [], isLoading, isError, error } = useQuery<Visit[]>({
    queryKey: ['visits'],
    queryFn: () => api.get('/visits?size=100').then((r) => r.data?.content ?? []),
    refetchInterval: 60_000,
  });

  const stats = useMemo(() => {
    const inProgress = visits.filter((v) => v.status === 'IN_PROGRESS').length;
    const completed = visits.filter((v) => v.status === 'COMPLETED').length;
    const totalCash = visits
      .filter((v) => v.status === 'COMPLETED')
      .reduce((sum, v) => sum + (v.cashCollectedCents || 0), 0);
    return { inProgress, completed, totalCash, total: visits.length };
  }, [visits]);

  const filtered = useMemo(() => {
    if (filter === 'ALL') return visits;
    return visits.filter((v) => v.status === filter);
  }, [visits, filter]);

  const filters: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'ALL', label: 'Todas', count: stats.total },
    { key: 'IN_PROGRESS', label: 'Em andamento', count: stats.inProgress },
    { key: 'COMPLETED', label: 'Concluídas', count: stats.completed },
    {
      key: 'CANCELLED',
      label: 'Canceladas',
      count: visits.filter((v) => v.status === 'CANCELLED').length,
    },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">
            Campo
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[color:var(--text)] mt-1">
            Visitas
          </h1>
          <p className="text-sm text-[color:var(--text-muted)] mt-1">
            Registros sincronizados do app mobile · atualização a cada minuto
          </p>
        </div>
        <Link
          href="/dashboard/routes"
          className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-muted)] hover:border-brand hover:text-brand transition-colors"
        >
          Ver rotas do dia
        </Link>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Resumo de visitas">
        <div className="rounded-2xl bg-[color:var(--surface)] shadow-sm border border-[color:var(--line)]/80 p-5 border-l-4 border-l-blue-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">Total</p>
          <p className="text-3xl font-bold text-[color:var(--text)] mt-2 tabular-nums">
            {stats.total}
          </p>
        </div>
        <div className="rounded-2xl bg-[color:var(--surface)] shadow-sm border border-[color:var(--line)]/80 p-5 border-l-4 border-l-amber-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">Em andamento</p>
          <p className="text-3xl font-bold text-[color:var(--text)] mt-2 tabular-nums">
            {stats.inProgress}
          </p>
        </div>
        <div className="rounded-2xl bg-[color:var(--surface)] shadow-sm border border-[color:var(--line)]/80 p-5 border-l-4 border-l-emerald-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">Sangria (concluídas)</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2 tabular-nums">
            {fmtMoney(stats.totalCash)}
          </p>
        </div>
      </section>

      {isError && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm"
          role="alert"
        >
          Erro ao carregar visitas: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={
                active
                  ? 'rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-muted)] hover:border-brand'
              }
            >
              {f.label} ({f.count})
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] p-10 text-center text-[color:var(--text-soft)]">
          Carregando visitas…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] p-10 text-center">
          <p className="text-[color:var(--text-muted)] font-medium">Nenhuma visita neste filtro</p>
          <p className="text-sm text-[color:var(--text-soft)] mt-1">
            As visitas aparecem aqui quando o app mobile sincroniza.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-[color:var(--line)]" aria-label="Lista de visitas">
            <thead className="bg-[color:var(--surface-muted)]">
              <tr>
                {['Status', 'Ponto', 'Responsável', 'Check-in', 'Check-out', 'Sangria'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--line)]">
              {filtered.map((visit) => {
                const meta =
                  STATUS_META[visit.status] || {
                    label: visit.status,
                    className: 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]',
                  };
                return (
                  <tr key={visit.id} className="hover:bg-[color:var(--surface-muted)]/80">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-[color:var(--text)]">
                      {visit.operatingPointName}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-muted)]">
                      {visit.responsibleName}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-muted)] tabular-nums whitespace-nowrap">
                      {fmtDate(visit.checkinAt)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-muted)] tabular-nums whitespace-nowrap">
                      {fmtDate(visit.checkoutAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[color:var(--text)] tabular-nums">
                      {fmtMoney(visit.cashCollectedCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
