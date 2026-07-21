'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

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

interface Machine {
  id: string;
  assetNumber: string;
  playPriceCents: number;
}

interface InitiateResult {
  id: string;
  providerTransactionId: string;
  provider: string;
  amountCents: number;
  copyPaste: string | null;
  ticketUrl: string | null;
  qrCodeBase64: string | null;
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
  const [showInitiate, setShowInitiate] = useState(false);
  const [machineId, setMachineId] = useState('');
  const [amountCents, setAmountCents] = useState('');
  const [lastInitiate, setLastInitiate] = useState<InitiateResult | null>(null);

  const { data: payments = [], isLoading, isError, error } = useQuery<Payment[]>({
    queryKey: ['payments', statusFilter],
    queryFn: () =>
      api.get(`/payments${statusFilter ? `?status=${statusFilter}` : ''}`)
        .then(r => r.data?.content ?? []),
    refetchInterval: 30_000,
  });

  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ['machines-for-payment'],
    queryFn: () => api.get('/machines?size=100').then(r => r.data?.content ?? []),
    enabled: showInitiate,
  });

  const isSandbox = process.env.NEXT_PUBLIC_SANDBOX_ENABLED === 'true';

  const initiate = useMutation({
    mutationFn: () =>
      api.post<InitiateResult>('/payments/initiate', {
        machineId,
        amountCents: amountCents ? Number(amountCents) : undefined,
      }).then(r => r.data),
    onSuccess: (data) => {
      setLastInitiate(data);
      qc.invalidateQueries({ queryKey: ['payments'] });
      toast.success(`Pagamento iniciado via ${data.provider}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao iniciar pagamento'),
  });

  const sandboxConfirm = useMutation({
    mutationFn: (providerTransactionId: string) =>
      api.post(`/payments/sandbox/confirm/${providerTransactionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Pagamento confirmado (sandbox)');
    },
  });

  const sandboxFail = useMutation({
    mutationFn: (providerTransactionId: string) =>
      api.post(`/payments/sandbox/fail/${providerTransactionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Pagamento marcado como falha (sandbox)');
    },
  });

  const totalConfirmed = payments
    .filter(p => p.status === 'CONFIRMED')
    .reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagamentos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Transações Pix/cartão via provider configurado
          </p>
        </div>
        <div className="flex items-end gap-4">
          <div className="text-right">
            <div className="text-xs text-gray-500">Total confirmado</div>
            <div className="text-xl font-bold text-green-600">{fmtMoney(totalConfirmed)}</div>
          </div>
          <button
            onClick={() => setShowInitiate(v => !v)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Iniciar pagamento
          </button>
        </div>
      </div>

      {showInitiate && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              value={machineId}
              onChange={e => {
                setMachineId(e.target.value);
                const m = machines.find(x => x.id === e.target.value);
                if (m) setAmountCents(String(m.playPriceCents));
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              aria-label="Máquina"
            >
              <option value="">Selecione a máquina</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.assetNumber} ({fmtMoney(m.playPriceCents)})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={amountCents}
              onChange={e => setAmountCents(e.target.value)}
              placeholder="Valor (centavos)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={() => initiate.mutate()}
              disabled={!machineId || initiate.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {initiate.isPending ? 'Gerando...' : 'Gerar cobrança'}
            </button>
          </div>
          {lastInitiate && (
            <div className="bg-white border border-blue-100 rounded-lg p-3 text-sm space-y-1">
              <p><span className="text-gray-500">Provider:</span> {lastInitiate.provider}</p>
              <p><span className="text-gray-500">Tx:</span> <span className="font-mono text-xs">{lastInitiate.providerTransactionId}</span></p>
              {lastInitiate.copyPaste && (
                <p className="break-all"><span className="text-gray-500">Pix Copia e Cola:</span> {lastInitiate.copyPaste}</p>
              )}
              {lastInitiate.ticketUrl && (
                <a href={lastInitiate.ticketUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  Abrir ticket Pix
                </a>
              )}
            </div>
          )}
        </div>
      )}

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

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar pagamentos: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando pagamentos...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm" role="table" aria-label="Lista de pagamentos">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Provider</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">ID Transação</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Máquina</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Valor</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Criado em</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Confirmado em</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ações</th>
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
                    <td className="px-4 py-3 text-xs font-mono text-gray-600">{p.provider}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {p.providerTransactionId?.slice(0, 16) || p.id.slice(0, 8)}…
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
                      {isSandbox && p.provider === 'SANDBOX' && p.status === 'PENDING' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => sandboxConfirm.mutate(p.providerTransactionId)}
                            disabled={sandboxConfirm.isPending}
                            className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => sandboxFail.mutate(p.providerTransactionId)}
                            disabled={sandboxFail.isPending}
                            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            Falhar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
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
