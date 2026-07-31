'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';

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
  MANUALLY_RESOLVED:       { label: 'Resolvido (manual)',     className: 'bg-brand/10 text-[color:var(--brand-strong)]' },
  PAYMENT_WITHOUT_CREDIT:  { label: 'Pag. sem Crédito',       className: 'bg-red-100 text-red-700' },
  CREDIT_NOT_ACKNOWLEDGED: { label: 'Crédito não confirmado', className: 'bg-orange-100 text-orange-700' },
  CREDIT_WITHOUT_PLAY:     { label: 'Crédito sem Jogada',     className: 'bg-yellow-100 text-yellow-700' },
  PENDING:                 { label: 'Pendente',               className: 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]' },
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

  const { data: cases = [], isLoading, isError, error } = useQuery<ReconciliationCase[]>({
    queryKey: ['reconciliation', statusFilter],
    queryFn: () =>
      api.get('/reconciliation' + (statusFilter ? `?status=${statusFilter}` : ''))
         .then(r => r.data?.content ?? []),
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
      <PageHeader title="Conciliação" description="Casos de conciliação entre pagamento, crédito e jogada" />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(summary.byStatus).map(([s, count]) => {
            const meta = STATUS_META[s] || { label: s, className: 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]' };
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                className={`rounded-xl p-4 border-2 text-left transition-all
                  ${statusFilter === s ? 'border-brand' : 'border-transparent'}
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
          className="text-sm border border-[color:var(--line)] rounded-lg px-3 py-2 text-[color:var(--text-muted)]"
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
            className="text-sm text-brand hover:text-[color:var(--brand-strong)]"
          >
            Limpar filtro
          </button>
        )}
        <span className="text-sm text-[color:var(--text-muted)] ml-auto">{cases.length} caso(s)</span>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar casos de conciliação: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-[color:var(--text-soft)]">Carregando casos...</div>
      ) : (
        <div className="bg-[color:var(--surface)] rounded-xl border border-[color:var(--line)] overflow-hidden">
          <table className="w-full text-sm" role="table" aria-label="Casos de conciliação">
            <thead className="bg-[color:var(--surface-muted)] border-b border-[color:var(--line)]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Pagamento</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Crédito</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Jogada</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Criado em</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--line)]">
              {cases.map(c => {
                const meta = STATUS_META[c.status] || { label: c.status, className: 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]' };
                const isPending = !['MATCHED', 'MANUALLY_RESOLVED'].includes(c.status);
                return (
                  <tr key={c.id} className="hover:bg-[color:var(--surface-muted)]">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[color:var(--text-muted)]">
                      {shortId(c.paymentTransactionId)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[color:var(--text-muted)]">
                      {shortId(c.creditGrantId)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[color:var(--text-muted)]">
                      {shortId(c.playSessionId)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-muted)] whitespace-nowrap">
                      {fmt(c.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {isPending && (
                        <button
                          onClick={() => setResolveTarget(c.id)}
                          className="text-xs px-3 py-1 bg-brand text-white rounded-md hover:bg-[color:var(--brand-strong)] transition-colors"
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
                  <td colSpan={6} className="px-4 py-8 text-center text-[color:var(--text-soft)]">
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
          <div className="bg-[color:var(--surface)] rounded-xl p-6 w-full max-w-md shadow-xl mx-4">
            <h2 className="text-lg font-bold text-[color:var(--text)] mb-2">Resolver Manualmente</h2>
            <p className="text-sm text-[color:var(--text-muted)] mb-4">
              Caso: <span className="font-mono">{resolveTarget.slice(0, 8)}…</span>
            </p>
            <textarea
              value={resolveNote}
              onChange={e => setResolveNote(e.target.value)}
              placeholder="Descreva o motivo da resolução manual..."
              className="w-full border border-[color:var(--line)] rounded-lg p-3 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-brand"
              aria-label="Motivo da resolução"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setResolveTarget(null); setResolveNote(''); }}
                className="flex-1 border border-[color:var(--line)] text-[color:var(--text-muted)] rounded-lg py-2 text-sm font-medium hover:bg-[color:var(--surface-muted)]"
              >
                Cancelar
              </button>
              <button
                onClick={() => resolve.mutate({ id: resolveTarget, note: resolveNote })}
                disabled={!resolveNote.trim() || resolve.isPending}
                className="flex-1 bg-brand text-white rounded-lg py-2 text-sm font-medium hover:bg-[color:var(--brand-strong)] disabled:opacity-50"
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
