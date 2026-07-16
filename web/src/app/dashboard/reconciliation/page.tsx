'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

interface ReconciliationCase {
  id: string;
  paymentTransactionId: string | null;
  creditGrantId: string | null;
  playSessionId: string | null;
  status: string;
  statusReason: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

interface Summary {
  byStatus: Record<string, number>;
  totalPending: number;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  MATCHED:                 { label: 'Conciliado',             className: 'bg-green-100 text-green-700' },
  MANUALLY_RESOLVED:       { label: 'Resolvido (manual)',     className: 'bg-blue-100 text-blue-700' },
  PAYMENT_WITHOUT_CREDIT:  { label: 'Pag. sem Crédito',       className: 'bg-red-100 text-red-700' },
  CREDIT_NOT_ACKNOWLEDGED: { label: 'Crédito não confirmado', className: 'bg-orange-100 text-orange-700' },
  CREDIT_WITHOUT_PLAY:     { label: 'Crédito sem Jogada',     className: 'bg-yellow-100 text-yellow-700' },
  PENDING:                 { label: 'Pendente',               className: 'bg-gray-100 text-gray-600' },
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function shortId(id: string | null) {
  if (!id) return '—';
  return id.slice(0, 8) + '…';
}

export default function ReconciliationPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');

  const { data: summary } = useQuery<Summary>({
    queryKey: ['reconciliation-summary'],
    queryFn: () => api.get('/reconciliation/summary').then(r => r.data),
  });

  const { data: cases = [], isLoading } = useQuery<ReconciliationCase[]>({
    queryKey: ['reconciliation', statusFilter],
    queryFn: () =>
      api.get('/reconciliation' + (statusFilter ? `?status=${statusFilter}` : '')).then(r => r.data),
  });

  const resolve = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post(`/reconciliation/${id}/resolve`, { resolution: 'MANUALLY_RESOLVED', note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation'] });
      qc.invalidateQueries({ queryKey: ['reconciliation-summary'] });
      setResolveTarget(null);
      setResolveNote('');
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conciliação</h1>
        <p className="text-sm text-gray-500 mt-1">Casos de conciliação pagamento→crédito→jogada</p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(summary.byStatus).map(([s, count]) => {
            const meta = STATUS_META[s] || { label: s, className: 'bg-gray-100 text-gray-600' };
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                className={`rounded-xl p-4 border-2 text-left transition-all
                  ${statusFilter === s ? 'border-blue-500' : 'border-transparent'}
                  ${meta.className}`}
                aria-pressed={statusFilter === s}
                aria-label={`Filtrar por ${meta.label}`}
              >
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs font-medium mt-1">{meta.label}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-700"
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_META).map(([s, m]) => (
            <option key={s} value={s}>{m.label}</option>
          ))}
        </select>
        {statusFilter && (
          <button
            onClick={() => setStatusFilter('')}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Limpar filtro
          </button>
        )}
        <span className="text-sm text-gray-500 ml-auto">{cases.length} caso(s)</span>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando casos...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm" role="table" aria-label="Casos de conciliação">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Pagamento</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Crédito</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Jogada</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Criado em</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cases.map(c => {
                const meta = STATUS_META[c.status] || { label: c.status, className: 'bg-gray-100 text-gray-600' };
                const isPending = !['MATCHED', 'MANUALLY_RESOLVED'].includes(c.status);
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {shortId(c.paymentTransactionId)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {shortId(c.creditGrantId)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {shortId(c.playSessionId)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {fmt(c.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {isPending && (
                        <button
                          onClick={() => setResolveTarget(c.id)}
                          className="text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                          aria-label={`Resolver manualmente caso ${c.id.slice(0, 8)}`}
                        >
                          Resolver
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {cases.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    Nenhum caso encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Resolve modal */}
      {resolveTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Resolver caso manualmente"
        >
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Resolver Manualmente</h2>
            <p className="text-sm text-gray-500 mb-4">
              Caso: <span className="font-mono">{resolveTarget.slice(0, 8)}…</span>
            </p>
            <textarea
              value={resolveNote}
              onChange={e => setResolveNote(e.target.value)}
              placeholder="Descreva o motivo da resolução manual..."
              className="w-full border border-gray-300 rounded-lg p-3 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Motivo da resolução"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setResolveTarget(null); setResolveNote(''); }}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => resolve.mutate({ id: resolveTarget, note: resolveNote })}
                disabled={!resolveNote.trim() || resolve.isPending}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {resolve.isPending ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
