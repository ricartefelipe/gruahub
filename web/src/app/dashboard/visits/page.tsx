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
  IN_PROGRESS: { label: 'Em andamento', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  COMPLETED: { label: 'Concluída', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  CANCELLED: { label: 'Cancelada', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
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
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Campo
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Visitas
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Registros sincronizados do app mobile · atualização a cada minuto
          </p>
        </div>
        <Link
          href="/dashboard/routes"
          className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500 hover:text-blue-600 transition-colors"
        >
          Ver rotas do dia
        </Link>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Resumo de visitas">
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200/80 dark:border-slate-800 p-5 border-l-4 border-l-blue-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-2 tabular-nums">
            {stats.total}
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200/80 dark:border-slate-800 p-5 border-l-4 border-l-amber-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Em andamento</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-2 tabular-nums">
            {stats.inProgress}
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200/80 dark:border-slate-800 p-5 border-l-4 border-l-emerald-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sangria (concluídas)</p>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">
            {fmtMoney(stats.totalCash)}
          </p>
        </div>
      </section>

      {isError && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 p-4 text-rose-700 dark:text-rose-200 text-sm"
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
                  ? 'rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-blue-500'
              }
            >
              {f.label} ({f.count})
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-400">
          Carregando visitas…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="text-slate-700 dark:text-slate-200 font-medium">Nenhuma visita neste filtro</p>
          <p className="text-sm text-slate-400 mt-1">
            As visitas aparecem aqui quando o app mobile sincroniza.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800" aria-label="Lista de visitas">
            <thead className="bg-slate-50 dark:bg-slate-950/60">
              <tr>
                {['Status', 'Ponto', 'Responsável', 'Check-in', 'Check-out', 'Sangria'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((visit) => {
                const meta =
                  STATUS_META[visit.status] || {
                    label: visit.status,
                    className: 'bg-slate-100 text-slate-600',
                  };
                return (
                  <tr key={visit.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {visit.operatingPointName}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {visit.responsibleName}
                    </td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums whitespace-nowrap">
                      {fmtDate(visit.checkinAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums whitespace-nowrap">
                      {fmtDate(visit.checkoutAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-slate-100 tabular-nums">
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
