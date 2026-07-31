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
        className: 'bg-emerald-100 text-emerald-800',
      };
    case 'IN_PROGRESS':
      return {
        label: 'Em andamento',
        className: 'bg-brand/10 text-blue-800',
      };
    case 'SKIPPED':
      return {
        label: 'Pulado',
        className: 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]',
      };
    default:
      return {
        label: 'Pendente',
        className: 'bg-amber-100 text-amber-800',
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
      <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] p-10 text-center text-[color:var(--text-soft)]">
        Carregando rotas…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">
            Operação
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[color:var(--text)] mt-1">
            Rotas
          </h1>
          <p className="text-sm text-[color:var(--text-muted)] mt-1">
            Planos ordenados por prioridade dos pontos de operação
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/visits"
            className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-muted)] hover:border-brand hover:text-brand transition-colors"
          >
            Ver visitas
          </Link>
          <button
            type="button"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-[color:var(--brand-strong)] disabled:opacity-50"
          >
            {generate.isPending ? 'Gerando…' : 'Gerar rota de hoje'}
          </button>
        </div>
      </header>

      {generate.isError && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm"
          role="alert"
        >
          Erro ao gerar rota: {(generate.error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {plansError && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm"
          role="alert"
        >
          Erro ao carregar planos: {(plansErrorObj as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {stopsError && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm"
          role="alert"
        >
          Erro ao carregar paradas: {(stopsErrorObj as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] p-10 text-center">
          <p className="text-[color:var(--text-muted)] font-medium">Nenhum plano de rota</p>
          <p className="text-sm text-[color:var(--text-soft)] mt-1">
            Use &quot;Gerar rota de hoje&quot; para criar um plano com os pontos ativos por prioridade.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[calc(100vh-240px)]">
          <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] overflow-hidden shadow-sm flex flex-col">
            <div className="p-3 border-b border-[color:var(--line)] bg-[color:var(--surface-muted)]">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
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
                      className={`w-full text-left px-4 py-3 border-b border-[color:var(--line)] transition-colors ${
                        active
                          ? 'bg-brand/10 border-l-2 border-l-blue-500'
                          : 'hover:bg-[color:var(--surface-muted)]'
                      }`}
                      aria-pressed={active}
                    >
                      <div className="text-sm font-medium text-[color:var(--text)] capitalize">
                        {fmtDate(plan.plannedDate)}
                      </div>
                      <div className="text-xs text-[color:var(--text-muted)] mt-0.5">
                        {plan.completedStops}/{plan.totalStops} paradas
                        {' · '}
                        <span
                          className={
                            plan.status === 'COMPLETED'
                              ? 'font-medium text-emerald-600'
                              : plan.status === 'IN_PROGRESS'
                                ? 'font-medium text-brand'
                                : 'font-medium text-[color:var(--text-muted)]'
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

          <div className="lg:col-span-2 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] overflow-hidden shadow-sm flex flex-col">
            {selected ? (
              <>
                <div className="p-4 border-b border-[color:var(--line)] bg-[color:var(--surface-muted)] flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                    Paradas da rota
                  </h2>
                  <span className="text-xs text-[color:var(--text-soft)] tabular-nums">{stops.length} pontos</span>
                </div>
                {stopsLoading ? (
                  <div className="p-8 text-center text-[color:var(--text-soft)]">Carregando paradas…</div>
                ) : stops.length === 0 ? (
                  <div className="p-8 text-center text-[color:var(--text-soft)]">Nenhuma parada neste plano.</div>
                ) : (
                  <ol className="divide-y divide-[color:var(--line)] overflow-y-auto flex-1">
                    {stops.map((stop) => {
                      const st = stopStatusMeta(stop.status);
                      return (
                        <li
                          key={stop.id}
                          className="px-4 py-4 flex items-start gap-4 hover:bg-[color:var(--surface-muted)]/80"
                        >
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-[color:var(--brand-strong)] flex items-center justify-center font-bold text-sm tabular-nums">
                            {stop.stopOrder}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-4">
                              <p className="font-medium text-[color:var(--text)]">
                                {stop.operatingPointName}
                              </p>
                              <span
                                className={`text-lg font-bold tabular-nums ${
                                  stop.priorityScore >= 80
                                    ? 'text-emerald-600'
                                    : stop.priorityScore >= 50
                                      ? 'text-amber-600'
                                      : 'text-[color:var(--text-soft)]'
                                }`}
                                aria-label={`Score de prioridade: ${stop.priorityScore}`}
                              >
                                {stop.priorityScore}
                              </span>
                            </div>
                            <p className="text-sm text-[color:var(--text-muted)] mt-0.5">{stop.address}</p>
                            {stop.priorityExplanation ? (
                              <p className="text-xs text-[color:var(--text-soft)] mt-1">{stop.priorityExplanation}</p>
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
              <div className="p-8 text-center text-[color:var(--text-soft)]">Selecione um plano de rota</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
