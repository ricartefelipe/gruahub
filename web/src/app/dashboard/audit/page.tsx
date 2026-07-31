'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';

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
      <PageHeader title="Auditoria" description="Log de eventos imutável — todas as ações sensíveis são registradas" />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          placeholder="Filtrar por ação (ex: MACHINE_ACTIVATED)"
          className="border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand"
          aria-label="Filtrar por ação"
        />
        <input
          type="text"
          value={resourceFilter}
          onChange={e => setResourceFilter(e.target.value)}
          placeholder="Filtrar por recurso (ex: machine)"
          className="border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand"
          aria-label="Filtrar por tipo de recurso"
        />
        {(actionFilter || resourceFilter) && (
          <button
            onClick={() => { setActionFilter(''); setResourceFilter(''); }}
            className="text-sm text-brand hover:text-[color:var(--brand-strong)] px-2"
          >
            Limpar filtros
          </button>
        )}
        <span className="ml-auto self-center text-sm text-[color:var(--text-muted)]">{events.length} evento(s)</span>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar eventos de auditoria: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-[color:var(--text-soft)]">Carregando eventos de auditoria...</div>
      ) : (
        <div className="bg-[color:var(--surface)] rounded-xl border border-[color:var(--line)] overflow-hidden">
          <table className="w-full text-xs" role="table" aria-label="Eventos de auditoria">
            <thead className="bg-[color:var(--surface-muted)] border-b border-[color:var(--line)]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Data/Hora</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Ação</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Recurso</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">ID Recurso</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Ator</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Detalhes</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Correlation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--line)] font-mono">
              {events.map(e => (
                <tr key={e.id} className="hover:bg-[color:var(--surface-muted)]">
                  <td className="px-4 py-2.5 text-[color:var(--text-muted)] whitespace-nowrap">
                    {fmtDate(e.occurredAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded text-[11px] font-semibold">
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[color:var(--text-muted)]">{e.resourceType}</td>
                  <td className="px-4 py-2.5 text-[color:var(--text-soft)]">
                    {e.resourceId ? e.resourceId.slice(0, 8) + '…' : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[color:var(--text-muted)] max-w-[120px] truncate">
                    {e.actorEmail || e.actorId?.slice(0, 8) || 'system'}
                  </td>
                  <td className="px-4 py-2.5 text-[color:var(--text-soft)] max-w-[160px] truncate" title={e.details || ''}>
                    {e.details || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[color:var(--text-soft)]">
                    {e.correlationId ? e.correlationId.slice(0, 8) + '…' : '—'}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[color:var(--text-soft)] font-sans">
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
