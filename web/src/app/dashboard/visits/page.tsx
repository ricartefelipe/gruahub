'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface Visit {
  id: string;
  operatingPointId: string;
  operatingPointName: string;
  status: string;
  responsibleName: string;
  checkinAt: string | null;
  checkoutAt: string | null;
  cashCollectedCents: number | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  IN_PROGRESS: { label: 'Em andamento', className: 'bg-yellow-100 text-yellow-700' },
  COMPLETED:   { label: 'Concluída',    className: 'bg-green-100 text-green-700' },
  CANCELLED:   { label: 'Cancelada',    className: 'bg-gray-100 text-gray-600' },
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMoney(cents: number | null) {
  if (cents == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100);
}

export default function VisitsPage() {
  const { data: visits = [], isLoading, isError, error } = useQuery<Visit[]>({
    queryKey: ['visits'],
    queryFn: () =>
      api.get('/visits?size=100').then(r => r.data?.content ?? []),
    refetchInterval: 60_000,
  });

  const totalCash = visits
    .filter(v => v.status === 'COMPLETED')
    .reduce((sum, v) => sum + (v.cashCollectedCents || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visitas de Campo</h1>
          <p className="text-sm text-gray-500 mt-1">Registros sincronizados do app mobile</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Total coletado</div>
          <div className="text-xl font-bold text-green-600">{fmtMoney(totalCash)}</div>
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar visitas: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando visitas...</div>
      ) : visits.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500">Nenhuma visita registrada ainda.</p>
          <p className="text-gray-400 text-sm mt-1">As visitas aparecerão aqui quando sincronizadas pelo app mobile.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm" role="table" aria-label="Lista de visitas de campo">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ponto de Operação</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Responsável</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Check-in</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Check-out</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Sangria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visits.map(visit => {
                const meta = STATUS_META[visit.status] || { label: visit.status, className: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={visit.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{visit.operatingPointName}</td>
                    <td className="px-4 py-3 text-gray-600">{visit.responsibleName}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(visit.checkinAt)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(visit.checkoutAt)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {fmtMoney(visit.cashCollectedCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
