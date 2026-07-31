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
  EXPIRED:   { label: 'Expirado',   className: 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]' },
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
  const [sandboxConfirmed, setSandboxConfirmed] = useState(false);

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
      setSandboxConfirmed(false);
      qc.invalidateQueries({ queryKey: ['payments'] });
      toast.success(`Pagamento iniciado via ${data.provider}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao iniciar pagamento'),
  });

  const sandboxConfirm = useMutation({
    mutationFn: (providerTransactionId: string) =>
      api.post(`/payments/sandbox/confirm/${providerTransactionId}`),
    onSuccess: () => {
      setSandboxConfirmed(true);
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
    <div className="space-y-6 gh-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Financeiro</p>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-[color:var(--text)]">
            Pagamentos
          </h1>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            Transações Pix/cartão via provider configurado
          </p>
        </div>
        <div className="flex items-end gap-4">
          <div className="text-right">
            <div className="text-xs text-[color:var(--text-soft)]">Total confirmado</div>
            <div className="font-display text-xl font-bold text-emerald-600">
              {fmtMoney(totalConfirmed)}
            </div>
          </div>
          <button type="button" onClick={() => setShowInitiate((v) => !v)} className="gh-btn-primary">
            Iniciar pagamento
          </button>
        </div>
      </div>

      {isSandbox && (
        <section className="gh-surface border-brand/25 p-4" aria-label="Fluxo guiado do sandbox">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Sandbox de pagamentos</p>
          <h2 className="mt-1 text-base font-semibold text-[color:var(--text)]">Teste o ciclo completo</h2>
          <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <li className="rounded-lg bg-[color:var(--surface-muted)] p-3 text-[color:var(--text-muted)]">
              <span className="font-semibold text-[color:var(--text)]">1. Iniciar</span>
              <p className="mt-1">Selecione uma máquina e gere uma cobrança.</p>
            </li>
            <li className="rounded-lg bg-[color:var(--surface-muted)] p-3 text-[color:var(--text-muted)]">
              <span className="font-semibold text-[color:var(--text)]">2. Confirmar sandbox</span>
              <p className="mt-1">Na transação pendente, use o botão Confirmar.</p>
            </li>
            <li className="rounded-lg bg-[color:var(--surface-muted)] p-3 text-[color:var(--text-muted)]">
              <span className="font-semibold text-[color:var(--text)]">3. Verificar status</span>
              <p className="mt-1">
                {sandboxConfirmed ? 'CONFIRMED registrado nesta sessão.' : 'O pagamento deve aparecer como CONFIRMED.'}
              </p>
            </li>
          </ol>
        </section>
      )}

      {showInitiate && (
        <div className="bg-brand/10 border border-brand/30 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              value={machineId}
              onChange={e => {
                setMachineId(e.target.value);
                const m = machines.find(x => x.id === e.target.value);
                if (m) setAmountCents(String(m.playPriceCents));
              }}
              className="border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm"
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
              className="border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={() => initiate.mutate()}
              disabled={!machineId || initiate.isPending}
              className="px-4 py-2 bg-brand text-white text-sm rounded-lg disabled:opacity-50"
            >
              {initiate.isPending ? 'Gerando...' : 'Gerar cobrança'}
            </button>
          </div>
          {lastInitiate && (
            <div className="bg-[color:var(--surface)] border border-blue-100 rounded-lg p-3 text-sm space-y-1">
              <p><span className="text-[color:var(--text-muted)]">Provider:</span> {lastInitiate.provider}</p>
              <p><span className="text-[color:var(--text-muted)]">Tx:</span> <span className="font-mono text-xs">{lastInitiate.providerTransactionId}</span></p>
              {lastInitiate.copyPaste && (
                <p className="break-all"><span className="text-[color:var(--text-muted)]">Pix Copia e Cola:</span> {lastInitiate.copyPaste}</p>
              )}
              {lastInitiate.ticketUrl && (
                <a href={lastInitiate.ticketUrl} target="_blank" rel="noreferrer" className="text-brand underline">
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
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${!statusFilter ? 'bg-brand text-white' : 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)] hover:bg-[color:var(--surface-muted)]'}`}
          aria-pressed={!statusFilter}
        >
          Todos
        </button>
        {Object.entries(STATUS_META).map(([s, m]) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s ? 'bg-brand text-white' : 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)] hover:bg-[color:var(--surface-muted)]'}`}
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
        <div className="text-center py-12 text-[color:var(--text-soft)]">Carregando pagamentos...</div>
      ) : (
        <div className="bg-[color:var(--surface)] rounded-xl border border-[color:var(--line)] overflow-hidden">
          <table className="w-full text-sm" role="table" aria-label="Lista de pagamentos">
            <thead className="bg-[color:var(--surface-muted)] border-b border-[color:var(--line)]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Provider</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">ID Transação</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Máquina</th>
                <th className="px-4 py-3 text-right font-semibold text-[color:var(--text-muted)]">Valor</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Criado em</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Confirmado em</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--line)]">
              {payments.map(p => {
                const meta = STATUS_META[p.status] || { label: p.status, className: 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]' };
                return (
                  <tr key={p.id} className="hover:bg-[color:var(--surface-muted)]">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-[color:var(--text-muted)]">{p.provider}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[color:var(--text-muted)]">
                      {p.providerTransactionId?.slice(0, 16) || p.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-muted)]">
                      {p.machineAssetNumber || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[color:var(--text)]">
                      {fmtMoney(p.amountCents, p.currency)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-muted)] whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                    <td className="px-4 py-3 text-[color:var(--text-muted)] whitespace-nowrap">{fmtDate(p.confirmedAt)}</td>
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
                  <td colSpan={8} className="px-4 py-8 text-center text-[color:var(--text-soft)]">
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
