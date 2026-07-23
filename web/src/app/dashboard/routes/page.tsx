'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

interface RoutePlan {
  id: string;
  operatorUserId: string;
  plannedDate: string;
  status: string;
  totalStops: number;
  completedStops: number;
  createdAt: string;
}

interface RouteStop {
  id: string;
  routePlanId: string;
  operatingPointId: string;
  operatingPointName: string;
  address: string;
  stopOrder: number;
  priorityScore: number;
  priorityExplanation: string | null;
  status: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function planStatusLabel(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'Concluída';
    case 'IN_PROGRESS':
      return 'Em andamento';
    case 'PLANNED':
      return 'Planejada';
    default:
      return status;
  }
}

function stopStatusMeta(status: string): { label: string; className: string } {
  switch (status) {
    case 'COMPLETED':
      return {
        label: 'Concluída',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
      };
    case 'IN_PROGRESS':
      return {
        label: 'Em andamento',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
      };
    case 'SKIPPED':
      return {
        label: 'Pulado',
        className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      };
    default:
      return {
        label: 'Pendente',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
      };
  }
}

export default function RoutesPage() {
  const qc = useQueryClient();
  const {
    data: plans = [],
    isLoading,
    isError: plansError,
    error: plansErrorObj,
  } = useQuery<RoutePlan[]>({
    queryKey: ['route-plans'],
    queryFn: () => api.get('/routes?size=30').then((r) => r.data?.content ?? []),
  });

  const [selected, setSelected] = useState<string | null>(plans[0]?.id ?? null);

  const {
    data: stops = [],
    isError: stopsError,
    error: stopsErrorObj,
    isLoading: stopsLoading,
  } = useQuery<RouteStop[]>({
    queryKey: ['route-stops', selected],
    queryFn: () => api.get(`/routes/${selected}/stops`).then((r) => r.data?.content ?? []),
    enabled: !!selected,
  });

  const generate = useMutation({
    mutationFn: () => api.post('/routes/generate', null, { params: { maxStops: 10 } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['route-plans'] });
      const id = res.data?.id as string | undefined;
      if (id) setSelected(id);
    },
  });

  useEffect(() => {
    if (plans.length > 0 && !selected) {
      setSelected(plans[0].id);
    }
  }, [plans, selected]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-400">
        Carregando rotas…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Operação
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Rotas
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Planos ordenados por prioridade dos pontos de operação
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/visits"
            className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500 hover:text-blue-600 transition-colors"
          >
            Ver visitas
          </Link>
          <button
            type="button"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
          >
            {generate.isPending ? 'Gerando…' : 'Gerar rota de hoje'}
          </button>
        </div>
      </header>

      {generate.isError && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 p-4 text-rose-700 dark:text-rose-200 text-sm"
          role="alert"
        >
          Erro ao gerar rota: {(generate.error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {plansError && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 p-4 text-rose-700 dark:text-rose-200 text-sm"
          role="alert"
        >
          Erro ao carregar planos: {(plansErrorObj as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {stopsError && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 p-4 text-rose-700 dark:text-rose-200 text-sm"
          role="alert"
        >
          Erro ao carregar paradas: {(stopsErrorObj as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="text-slate-700 dark:text-slate-200 font-medium">Nenhum plano de rota</p>
          <p className="text-sm text-slate-400 mt-1">
            Use &quot;Gerar rota de hoje&quot; para criar um plano com os pontos ativos por prioridade.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[calc(100vh-240px)]">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex flex-col">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Planos ({plans.length})
              </h2>
            </div>
            <ul className="overflow-y-auto flex-1">
              {plans.map((plan) => {
                const active = selected === plan.id;
                return (
                  <li key={plan.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(plan.id)}
                      className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 transition-colors ${
                        active
                          ? 'bg-blue-50 dark:bg-blue-950/40 border-l-2 border-l-blue-500'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                      aria-pressed={active}
                    >
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100 capitalize">
                        {fmtDate(plan.plannedDate)}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {plan.completedStops}/{plan.totalStops} paradas
                        {' · '}
                        <span
                          className={
                            plan.status === 'COMPLETED'
                              ? 'font-medium text-emerald-600'
                              : plan.status === 'IN_PROGRESS'
                                ? 'font-medium text-blue-600'
                                : 'font-medium text-slate-500'
                          }
                        >
                          {planStatusLabel(plan.status)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex flex-col">
            {selected ? (
              <>
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Paradas da rota
                  </h2>
                  <span className="text-xs text-slate-400 tabular-nums">{stops.length} pontos</span>
                </div>
                {stopsLoading ? (
                  <div className="p-8 text-center text-slate-400">Carregando paradas…</div>
                ) : stops.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">Nenhuma parada neste plano.</div>
                ) : (
                  <ol className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto flex-1">
                    {stops.map((stop) => {
                      const st = stopStatusMeta(stop.status);
                      return (
                        <li
                          key={stop.id}
                          className="px-4 py-4 flex items-start gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-200 flex items-center justify-center font-bold text-sm tabular-nums">
                            {stop.stopOrder}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-4">
                              <p className="font-medium text-slate-900 dark:text-slate-100">
                                {stop.operatingPointName}
                              </p>
                              <span
                                className={`text-lg font-bold tabular-nums ${
                                  stop.priorityScore >= 80
                                    ? 'text-emerald-600'
                                    : stop.priorityScore >= 50
                                      ? 'text-amber-600'
                                      : 'text-slate-400'
                                }`}
                                aria-label={`Score de prioridade: ${stop.priorityScore}`}
                              >
                                {stop.priorityScore}
                              </span>
                            </div>
                            <p className="text-sm text-slate-500 mt-0.5">{stop.address}</p>
                            {stop.priorityExplanation ? (
                              <p className="text-xs text-slate-400 mt-1">{stop.priorityExplanation}</p>
                            ) : null}
                          </div>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold flex-shrink-0 ${st.className}`}
                          >
                            {st.label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-slate-400">Selecione um plano de rota</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
