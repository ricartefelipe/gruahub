'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { machinesApi, Machine } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_META: Record<Machine['status'], { label: string; bg: string; dot: string }> = {
  ACTIVE:      { label: 'Online',       bg: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  OFFLINE:     { label: 'Offline',      bg: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400'  },
  MAINTENANCE: { label: 'Manutenção',   bg: 'bg-yellow-100 text-yellow-700',dot: 'bg-yellow-500'},
  DRAFT:       { label: 'Rascunho',     bg: 'bg-blue-100 text-blue-600',    dot: 'bg-blue-400'  },
  DISABLED:    { label: 'Desabilitada', bg: 'bg-red-100 text-red-600',      dot: 'bg-red-400'   },
  RETIRED:     { label: 'Aposentada',   bg: 'bg-slate-100 text-slate-500',  dot: 'bg-slate-400' },
};

interface Ticket  { id: string; title: string; priority: string; status: string; createdAt: string }
interface Alert   { id: string; alertType: string; severity: string; status: string; message: string | null; occurredAt: string }
interface StockBalance { prizeId: string; prizeName: string; currentQuantity: number; minimumQuantity: number }
interface PlayEvent { id: string; outcome: string; amountPaidCents: number; occurredAt: string }

export default function MachineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'info' | 'tickets' | 'alerts' | 'stock' | 'plays'>('info');

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: machine, isLoading, isError } = useQuery<Machine>({
    queryKey: ['machine', id],
    queryFn: () => machinesApi.get(id).then(r => r.data),
    refetchInterval: 15_000,
  });

  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: ['machine-tickets', id],
    queryFn: () => api.get('/maintenance', { params: { machineId: id, size: 10 } }).then(r => r.data?.content ?? []),
    enabled: tab === 'tickets',
  });

  const { data: alerts = [] } = useQuery<Alert[]>({
    queryKey: ['machine-alerts', id],
    queryFn: () => api.get('/alerts', { params: { machineId: id, status: 'ALL', size: 20 } }).then(r => r.data?.content ?? []),
    enabled: tab === 'alerts',
    refetchInterval: tab === 'alerts' ? 30_000 : false,
  });

  const { data: stock = [] } = useQuery<StockBalance[]>({
    queryKey: ['machine-stock', id],
    queryFn: () => api.get('/inventory/balances', { params: { machineId: id } }).then(r => r.data?.content ?? []),
    enabled: tab === 'stock',
  });

  const { data: plays = [] } = useQuery<PlayEvent[]>({
    queryKey: ['machine-plays', id],
    queryFn: () =>
      api.get('/plays', { params: { machineId: id, size: 20 } }).then(r => r.data?.content ?? []),
    enabled: tab === 'plays',
  });

  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditPlays, setCreditPlays] = useState('1');
  const [creditJustification, setCreditJustification] = useState('');

  const statusMutation = useMutation({
    mutationFn: (status: string) => machinesApi.changeStatus(id, status),
    onSuccess: (r) => {
      qc.setQueryData(['machine', id], r.data);
      qc.invalidateQueries({ queryKey: ['machines'] });
      toast.success('Status atualizado');
    },
    onError: (e: any) => toast.error(e.response?.data?.title || 'Erro ao atualizar status'),
  });

  const manualCredit = useMutation({
    mutationFn: () =>
      api.post('/plays/manual-credit', {
        machineId: id,
        playsGranted: Number(creditPlays) || 1,
        amountCents: 0,
        justification: creditJustification.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machine-plays', id] });
      setShowCreditForm(false);
      setCreditPlays('1');
      setCreditJustification('');
      toast.success('Crédito remoto enfileirado');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao liberar crédito'),
  });

  // ── Loading / Error ──────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <svg className="animate-spin h-8 w-8 mr-3" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Carregando máquina…
    </div>
  );

  if (isError || !machine) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
      Máquina não encontrada ou sem permissão de acesso.{' '}
      <Link href="/dashboard/machines" className="underline">Voltar à lista</Link>
    </div>
  );

  const meta = STATUS_META[machine.status] ?? STATUS_META.OFFLINE;
  const isOnline = machine.status === 'ACTIVE';

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            aria-label="Voltar"
          >
            ←
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{machine.assetNumber}</h1>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${meta.bg}`}>
                <span className={`h-2 w-2 rounded-full ${meta.dot} ${isOnline ? 'animate-pulse' : ''}`} />
                {meta.label}
              </span>
            </div>
            {machine.name && <p className="text-gray-500 mt-0.5">{machine.name}</p>}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={() => setShowCreditForm(v => !v)}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Liberar crédito
          </button>
          {machine.status !== 'ACTIVE' && machine.status !== 'RETIRED' && (
            <button
              onClick={() => statusMutation.mutate('ACTIVE')}
              disabled={statusMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Ativar
            </button>
          )}
          {machine.status === 'ACTIVE' && (
            <button
              onClick={() => statusMutation.mutate('MAINTENANCE')}
              disabled={statusMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
            >
              → Manutenção
            </button>
          )}
          {machine.status !== 'DISABLED' && machine.status !== 'RETIRED' && (
            <button
              onClick={() => {
                if (confirm('Desativar esta máquina?')) statusMutation.mutate('DISABLED');
              }}
              disabled={statusMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Desativar
            </button>
          )}
        </div>
      </div>

      {showCreditForm && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-indigo-900">Crédito remoto (bonificação / teste)</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="number"
              min="1"
              value={creditPlays}
              onChange={e => setCreditPlays(e.target.value)}
              placeholder="Jogadas"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              aria-label="Quantidade de jogadas"
            />
            <input
              type="text"
              value={creditJustification}
              onChange={e => setCreditJustification(e.target.value)}
              placeholder="Justificativa"
              className="md:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              aria-label="Justificativa do crédito"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => manualCredit.mutate()}
              disabled={!creditJustification.trim() || manualCredit.isPending}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {manualCredit.isPending ? 'Enviando...' : 'Enviar comando'}
            </button>
            <button
              onClick={() => setShowCreditForm(false)}
              className="px-3 py-2 text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Preço da jogada</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmtCents(machine.playPriceCents)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Cap. prêmios</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{machine.prizeCapacity}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Jogadas bônus</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{machine.bonusPlays}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Último sinal</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{fmt(machine.lastSeenAt)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="border-b">
          <nav className="flex gap-0" aria-label="Abas da máquina">
            {([
              ['info',    'Informações'],
              ['tickets', 'Chamados'],
              ['alerts',  'Alertas'],
              ['stock',   'Estoque'],
              ['plays',   'Jogadas'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
                  tab === key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* ── Info ── */}
          {tab === 'info' && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {[
                ['ID',              machine.id],
                ['Asset Number',    machine.assetNumber],
                ['Nome',            machine.name || '—'],
                ['Status',          meta.label],
                ['QR Code',         machine.qrCode || '—'],
                ['Ponto operacional', machine.operatingPointId || '—'],
                ['Controller ID',   machine.controllerId || '—'],
                ['Modelo',          machine.machineModelId || '—'],
                ['Moeda',           machine.currency],
                ['Criada em',       fmt(machine.createdAt)],
                ['Atualizada em',   fmt(machine.updatedAt)],
                ['Versão (ETag)',    String(machine.version)],
              ].map(([label, val]) => (
                <div key={label}>
                  <dt className="text-xs text-gray-500 uppercase tracking-wide">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-gray-900 break-all">{val}</dd>
                </div>
              ))}
              {machine.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-gray-500 uppercase tracking-wide">Notas</dt>
                  <dd className="mt-0.5 text-sm text-gray-700">{machine.notes}</dd>
                </div>
              )}
            </dl>
          )}

          {/* ── Tickets ── */}
          {tab === 'tickets' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-800">Chamados de manutenção</h3>
                <Link
                  href="/dashboard/maintenance"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Ver todos →
                </Link>
              </div>
              {tickets.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">Sem chamados abertos.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase border-b">
                    <tr>
                      <th className="pb-2 text-left">Título</th>
                      <th className="pb-2 text-left">Prioridade</th>
                      <th className="pb-2 text-left">Status</th>
                      <th className="pb-2 text-left">Criado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="py-2 font-medium">{t.title}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            t.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                            t.priority === 'HIGH'     ? 'bg-orange-100 text-orange-700' :
                            t.priority === 'MEDIUM'   ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-blue-100 text-blue-700'
                          }`}>{t.priority}</span>
                        </td>
                        <td className="py-2 text-gray-600">{t.status}</td>
                        <td className="py-2 text-gray-500">{fmt(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Alerts ── */}
          {tab === 'alerts' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800">Alertas da máquina</h3>
              {alerts.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">Nenhum alerta registrado.</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 p-3 rounded-lg border">
                      <span className={`mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                        a.severity === 'CRITICAL' ? 'bg-red-500' :
                        a.severity === 'WARNING'  ? 'bg-yellow-400' : 'bg-blue-400'
                      }`} />
                      <div className="min-w-0">
                        <div className="flex gap-2 items-center">
                          <span className="text-xs font-mono text-gray-400">{a.alertType}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            a.status === 'OPEN' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'
                          }`}>{a.status}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-0.5">{a.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{fmt(a.occurredAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Stock ── */}
          {tab === 'stock' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800">Estoque de prêmios</h3>
              {stock.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">Sem dados de estoque para esta máquina.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase border-b">
                    <tr>
                      <th className="pb-2 text-left">Prêmio</th>
                      <th className="pb-2 text-right">Atual</th>
                      <th className="pb-2 text-right">Mínimo</th>
                      <th className="pb-2 text-left">Nível</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stock.map((s) => {
                      const pct = s.minimumQuantity > 0
                        ? Math.round(s.currentQuantity / s.minimumQuantity * 100)
                        : 100;
                      return (
                        <tr key={s.prizeId} className="hover:bg-gray-50">
                          <td className="py-2 font-medium">{s.prizeName}</td>
                          <td className="py-2 text-right">{s.currentQuantity}</td>
                          <td className="py-2 text-right text-gray-500">{s.minimumQuantity}</td>
                          <td className="py-2 pl-4 w-32">
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  pct < 33  ? 'bg-red-500' :
                                  pct < 75  ? 'bg-yellow-400' : 'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Plays ── */}
          {tab === 'plays' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800">Últimas 20 jogadas</h3>
              {plays.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">Sem jogadas registradas.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase border-b">
                    <tr>
                      <th className="pb-2 text-left">Resultado</th>
                      <th className="pb-2 text-right">Valor pago</th>
                      <th className="pb-2 text-left">Data/hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {plays.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            p.outcome === 'WIN'  ? 'bg-green-100 text-green-700' :
                            p.outcome === 'LOSE' ? 'bg-red-100 text-red-600' :
                                                   'bg-gray-100 text-gray-500'
                          }`}>{p.outcome}</span>
                        </td>
                        <td className="py-2 text-right font-mono">{fmtCents(p.amountPaidCents)}</td>
                        <td className="py-2 text-gray-500">{fmt(p.occurredAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
