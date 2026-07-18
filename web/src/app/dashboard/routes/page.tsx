'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function RoutesPage() {
  const { data: plans = [], isLoading, isError: plansError, error: plansErrorObj } = useQuery<RoutePlan[]>({
    queryKey: ['route-plans'],
    queryFn: () =>
      api.get('/routes?size=30').then(r => r.data?.content ?? r.data ?? []),
  });

  const [selected, setSelected] = useState<string | null>(plans[0]?.id ?? null);

  const { data: stops = [], isError: stopsError, error: stopsErrorObj } = useQuery<RouteStop[]>({
    queryKey: ['route-stops', selected],
    queryFn: () =>
      api.get(`/routes/${selected}/stops`).then(r => r.data?.content ?? r.data ?? []),
    enabled: !!selected,
  });

  useEffect(() => {
    if (plans.length > 0 && !selected) {
      setSelected(plans[0].id);
    }
  }, [plans]);

  if (isLoading) {
    return <div className="text-center py-12 text-gray-400">Carregando rotas...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rotas</h1>
        <p className="text-sm text-gray-500 mt-1">Planos de rota por operador — ordenados por score de prioridade</p>
      </div>

      {plansError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar planos de rota: {(plansErrorObj as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {stopsError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar paradas: {(stopsErrorObj as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {plans.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500">Nenhum plano de rota criado.</p>
          <p className="text-sm text-gray-400 mt-1">As rotas são geradas automaticamente com base nas prioridades dos pontos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 h-[calc(100vh-220px)]">
          {/* Plan list */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-y-auto">
            <div className="p-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Planos</h2>
            </div>
            <ul>
              {plans.map(plan => (
                <li key={plan.id}>
                  <button
                    onClick={() => setSelected(plan.id)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      selected === plan.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                    }`}
                    aria-pressed={selected === plan.id}
                  >
                    <div className="text-sm font-medium text-gray-800 capitalize">{fmtDate(plan.plannedDate)}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {plan.completedStops}/{plan.totalStops} paradas
                      {' · '}
                      <span className={`font-medium ${
                        plan.status === 'COMPLETED' ? 'text-green-600' :
                        plan.status === 'IN_PROGRESS' ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                        {plan.status === 'COMPLETED' ? 'Concluída' :
                         plan.status === 'IN_PROGRESS' ? 'Em andamento' : 'Planejada'}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Stop detail */}
          <div className="col-span-2 bg-white border border-gray-200 rounded-xl overflow-y-auto">
            {selected ? (
              <>
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                  <h2 className="text-sm font-semibold text-gray-700">Paradas da Rota</h2>
                </div>
                {stops.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">Carregando paradas...</div>
                ) : (
                  <ol className="divide-y divide-gray-100">
                    {stops.map(stop => (
                      <li key={stop.id} className="px-4 py-4 flex items-start gap-4 hover:bg-gray-50">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                          {stop.stopOrder}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-4">
                            <p className="font-medium text-gray-900">{stop.operatingPointName}</p>
                            <span className={`text-lg font-bold ${
                              stop.priorityScore >= 80 ? 'text-green-600' :
                              stop.priorityScore >= 50 ? 'text-amber-600' : 'text-gray-400'
                            }`} aria-label={`Score de prioridade: ${stop.priorityScore}`}>
                              {stop.priorityScore}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">{stop.address}</p>
                          {stop.priorityExplanation && (
                            <p className="text-xs text-gray-400 mt-1 italic">{stop.priorityExplanation}</p>
                          )}
                        </div>
                        <div className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
                          stop.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                          stop.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                          stop.status === 'SKIPPED' ? 'bg-gray-100 text-gray-500' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {stop.status === 'COMPLETED' ? '✓' :
                           stop.status === 'IN_PROGRESS' ? '⏳' :
                           stop.status === 'SKIPPED' ? '—' : '•'}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-gray-400">Selecione um plano de rota</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
