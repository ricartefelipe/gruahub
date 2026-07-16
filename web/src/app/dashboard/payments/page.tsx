'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

interface Payment {
  id: string;
  providerTransactionId: string;
  provider: string;
  amountCents: number;
  currency: string;
  status: string;
  machineId: string;
  machineAssetNumber: string;
  paymentMethod: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING:   { label: 'Pendente',   className: 'bg-yellow-100 text-yellow-700' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-green-100 text-green-700' },
  FAILED:    { label: 'Falhou',     className: 'bg-red-100 text-red-700' },
  REFUNDED:  { label: 'Estornado',  className: 'bg-purple-100 text-purple-700' },
  EXPIRED:   { label: 'Expirado',   className: 'bg-gray-100 text-gray-600' },
};

function fmtMoney(cents: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PaymentsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ['payments', statusFilter],
    queryFn: () =>
      api.get(`/payments${statusFilter ? `?status=${statusFilter}` : ''}`)
        .then(r => r.data).catch(() => []),
    refetchInterval: 30_000,
  });

  // Sandbox actions (only meaningful in dev)
  const sandboxConfirm = useMutation({
    mutationFn: (id: string) => api.post(`/payments/sandbox/confirm/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  });

  const sandboxFail = useMutation({
    mutationFn: (id: string) => api.post(`/payments/sandbox/fail/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  });

  const totalConfirmed = payments
    .filter(p => p.status === 'CONFIRMED')
    .reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagamentos</h1>
          <p className="text-sm text-gray-500 mt-1">Transações de pagamento (sandbox)</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Total confirmado</div>
          <div className="text-xl font-bold text-green-600">{fmtMoney(totalConfirmed)}</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter('')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${!statusFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          aria-pressed={!statusFilter}
        >
          Todos
        </button>
        {Object.entries(STATUS_META).map(([s, m]) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            aria-pressed={statusFilter === s}
          >
            {m.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando pagamentos...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm" role="table" aria-label="Lista de pagamentos">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">ID Transação</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Máquina</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Valor</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Criado em</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Confirmado em</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Sandbox</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map(p => {
                const meta = STATUS_META[p.status] || { label: p.status, className: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {p.providerTransactionId?.slice(0, 12) || p.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {p.machineAssetNumber || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {fmtMoney(p.amountCents, p.currency)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.confirmedAt)}</td>
                    <td className="px-4 py-3">
                      {p.status === 'PENDING' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => sandboxConfirm.mutate(p.id)}
                            className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                            title="Simular confirmação de pagamento"
                          >
                            ✓ Confirmar
                          </button>
                          <button
                            onClick={() => sandboxFail.mutate(p.id)}
                            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                            title="Simular falha de pagamento"
                          >
                            ✕ Falhar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Nenhum pagamento encontrado.
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
