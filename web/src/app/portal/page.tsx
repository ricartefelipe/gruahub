'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useSession } from 'next-auth/react';

/**
 * Portal do parceiro (ESTABLISHMENT_VIEWER).
 *
 * Mostra apenas dados do próprio estabelecimento:
 *  - Resumo de visitas recentes
 *  - Alertas abertos
 *  - Máquinas instaladas e status
 *
 * O backend filtra por tenant_id derivado do JWT — o portal não envia
 * establishment_id como parâmetro de autorização; confia na sessão.
 */

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

interface Visit {
  id: string;
  operatingPointName: string;
  status: string;
  checkinAt: string | null;
  checkoutAt: string | null;
  cashCollectedCents: number | null;
}

interface AlertRow {
  id: string;
  alertType: string;
  severity: string;
  message: string | null;
  occurredAt: string;
}

interface MachineRow {
  id: string;
  assetNumber: string;
  name: string | null;
  status: string;
  lastSeenAt: string | null;
  playPriceCents: number;
}

const SEV_BG: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700 border-red-200',
  WARNING:  'bg-yellow-100 text-yellow-700 border-yellow-200',
  INFO:     'bg-blue-100 text-blue-600 border-blue-200',
};

const MACH_DOT: Record<string, string> = {
  ACTIVE:      'bg-green-500',
  OFFLINE:     'bg-gray-400',
  MAINTENANCE: 'bg-yellow-500',
  DISABLED:    'bg-red-400',
  DRAFT:       'bg-blue-400',
  RETIRED:     'bg-slate-300',
};

export default function PortalPage() {
  const { data: session } = useSession();
  const tenantName = (session?.user as any)?.name ?? 'Parceiro';

  const { data: visits = [], isLoading: loadingVisits } = useQuery<Visit[]>({
    queryKey: ['portal-visits'],
    queryFn: () =>
      api.get('/visits', { params: { size: 10, status: 'COMPLETED' } })
         .then(r => r.data?.content ?? []),
    refetchInterval: 60_000,
  });

  const { data: alerts = [], isLoading: loadingAlerts } = useQuery<AlertRow[]>({
    queryKey: ['portal-alerts'],
    queryFn: () =>
      api.get('/alerts', { params: { status: 'OPEN', size: 20 } })
         .then(r => r.data?.content ?? []),
    refetchInterval: 30_000,
  });

  const { data: machines = [], isLoading: loadingMachines } = useQuery<MachineRow[]>({
    queryKey: ['portal-machines'],
    queryFn: () =>
      api.get('/machines', { params: { size: 100 } }).then(r => r.data?.content ?? []),
    refetchInterval: 30_000,
  });

  const totalCash = visits.reduce((s, v) => s + (v.cashCollectedCents ?? 0), 0);
  const onlineCount = machines.filter(m => m.status === 'ACTIVE').length;
  const openAlerts = alerts.length;

  return (
    <div className="space-y-8">

      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bom dia, {tenantName}!</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Aqui estão as últimas informações do seu estabelecimento.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Máquinas online</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {loadingMachines ? '…' : `${onlineCount}/${machines.length}`}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Alertas abertos</p>
          <p className={`text-3xl font-bold mt-1 ${openAlerts > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {loadingAlerts ? '…' : openAlerts}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Sangrias (últimas 10 visitas)</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {loadingVisits
              ? '…'
              : (totalCash / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
      </div>

      {/* Alerts */}
      {openAlerts > 0 && (
        <section className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              Alertas que precisam de atenção
            </h2>
          </div>
          <ul className="divide-y">
            {alerts.slice(0, 5).map(a => (
              <li key={a.id} className="px-6 py-4 flex items-start gap-3">
                <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium border ${SEV_BG[a.severity] ?? SEV_BG.INFO}`}>
                  {a.severity}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{a.alertType.replace(/_/g, ' ')}</p>
                  {a.message && <p className="text-sm text-gray-500 mt-0.5">{a.message}</p>}
                  <p className="text-xs text-gray-400 mt-1">{fmt(a.occurredAt)}</p>
                </div>
              </li>
            ))}
          </ul>
          {openAlerts > 5 && (
            <p className="px-6 py-3 text-sm text-gray-400 border-t">
              + {openAlerts - 5} alerta(s) adicional(is). Entre em contato com o operador GruaHub.
            </p>
          )}
        </section>
      )}

      {/* Machines */}
      <section className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Suas máquinas</h2>
        </div>
        {loadingMachines ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">Carregando…</div>
        ) : machines.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            Nenhuma máquina instalada no seu estabelecimento ainda.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Asset</th>
                <th className="px-6 py-3 text-left">Nome</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Último sinal</th>
                <th className="px-6 py-3 text-right">Jogada</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {machines.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-mono font-medium text-gray-900">{m.assetNumber}</td>
                  <td className="px-6 py-3 text-gray-600">{m.name ?? '—'}</td>
                  <td className="px-6 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${MACH_DOT[m.status] ?? 'bg-gray-300'} ${m.status === 'ACTIVE' ? 'animate-pulse' : ''}`} />
                      <span className="text-gray-600">{m.status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-500">{fmt(m.lastSeenAt)}</td>
                  <td className="px-6 py-3 text-right font-mono">
                    {(m.playPriceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recent visits */}
      <section className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Últimas visitas técnicas</h2>
        </div>
        {loadingVisits ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">Carregando…</div>
        ) : visits.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            Nenhuma visita técnica registrada ainda.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Ponto</th>
                <th className="px-6 py-3 text-left">Entrada</th>
                <th className="px-6 py-3 text-left">Saída</th>
                <th className="px-6 py-3 text-right">Sangria</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visits.map(v => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{v.operatingPointName}</td>
                  <td className="px-6 py-3 text-gray-500">{fmt(v.checkinAt)}</td>
                  <td className="px-6 py-3 text-gray-500">{fmt(v.checkoutAt)}</td>
                  <td className="px-6 py-3 text-right font-mono">
                    {v.cashCollectedCents != null
                      ? (v.cashCollectedCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Footer note */}
      <p className="text-xs text-gray-400 text-center pb-4">
        Dados atualizados automaticamente a cada 30 segundos.
        Para dúvidas, fale com o operador GruaHub responsável pelo seu contrato.
      </p>
    </div>
  );
}
