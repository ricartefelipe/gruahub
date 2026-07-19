'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface AuditEvent {
  id: string;
  tenantId: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: string | null;
  correlationId: string | null;
  ipAddress: string | null;
  occurredAt: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');

  const { data: events = [], isLoading, isError, error } = useQuery<AuditEvent[]>({
    queryKey: ['audit-events', actionFilter, resourceFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('size', '100');
      if (actionFilter) params.set('action', actionFilter);
      if (resourceFilter) params.set('resourceType', resourceFilter);
      return api.get(`/audit?${params}`).then(r => r.data?.content ?? []);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Auditoria</h1>
        <p className="text-sm text-gray-500 mt-1">
          Log de eventos imutável — todas as ações sensíveis são registradas
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          placeholder="Filtrar por ação (ex: MACHINE_ACTIVATED)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Filtrar por ação"
        />
        <input
          type="text"
          value={resourceFilter}
          onChange={e => setResourceFilter(e.target.value)}
          placeholder="Filtrar por recurso (ex: machine)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Filtrar por tipo de recurso"
        />
        {(actionFilter || resourceFilter) && (
          <button
            onClick={() => { setActionFilter(''); setResourceFilter(''); }}
            className="text-sm text-blue-600 hover:text-blue-800 px-2"
          >
            Limpar filtros
          </button>
        )}
        <span className="ml-auto self-center text-sm text-gray-500">{events.length} evento(s)</span>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar eventos de auditoria: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando eventos de auditoria...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs" role="table" aria-label="Eventos de auditoria">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Data/Hora</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ação</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Recurso</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">ID Recurso</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ator</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Detalhes</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Correlation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono">
              {events.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {fmtDate(e.occurredAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded text-[11px] font-semibold">
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{e.resourceType}</td>
                  <td className="px-4 py-2.5 text-gray-400">
                    {e.resourceId ? e.resourceId.slice(0, 8) + '…' : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-[120px] truncate">
                    {e.actorEmail || e.actorId?.slice(0, 8) || 'system'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 max-w-[160px] truncate" title={e.details || ''}>
                    {e.details || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-300">
                    {e.correlationId ? e.correlationId.slice(0, 8) + '…' : '—'}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 font-sans">
                    Nenhum evento de auditoria encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
