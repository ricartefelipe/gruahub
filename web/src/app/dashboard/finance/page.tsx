'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface Settlement {
  id: string;
  operatingPointId: string;
  operatingPointName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  grossRevenueCents: number;
  commissionPct: number;
  commissionCents: number;
  netRevenueCents: number;
  createdAt: string;
}

function fmtMoney(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING:   { label: 'Pendente',  className: 'bg-yellow-100 text-yellow-700' },
  APPROVED:  { label: 'Aprovado', className: 'bg-blue-100 text-blue-700' },
  PAID:      { label: 'Pago',     className: 'bg-green-100 text-green-700' },
  DISPUTED:  { label: 'Em disputa', className: 'bg-red-100 text-red-700' },
};

export default function FinancePage() {
  const { data: settlements = [], isLoading, isError, error } = useQuery<Settlement[]>({
    queryKey: ['settlements'],
    queryFn: () =>
      api.get('/finance/settlements?size=100').then(r => r.data?.content ?? r.data ?? []),
  });

  const totals = settlements.reduce((acc, s) => ({
    gross: acc.gross + s.grossRevenueCents,
    commission: acc.commission + s.commissionCents,
    net: acc.net + s.netRevenueCents,
  }), { gross: 0, commission: 0, net: 0 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
        <p className="text-sm text-gray-500 mt-1">Liquidações e comissões por ponto de operação</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5" role="region" aria-label="Receita bruta total">
          <div className="text-xs text-gray-500 uppercase font-semibold">Receita Bruta</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{fmtMoney(totals.gross)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5" role="region" aria-label="Total de comissões">
          <div className="text-xs text-gray-500 uppercase font-semibold">Comissões</div>
          <div className="text-2xl font-bold text-orange-600 mt-1">{fmtMoney(totals.commission)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5" role="region" aria-label="Receita líquida total">
          <div className="text-xs text-gray-500 uppercase font-semibold">Receita Líquida</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{fmtMoney(totals.net)}</div>
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar liquidações: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {/* Settlements table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando liquidações...</div>
      ) : settlements.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500">Nenhuma liquidação registrada ainda.</p>
          <p className="text-sm text-gray-400 mt-1">As liquidações são calculadas automaticamente ao final do período.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm" role="table" aria-label="Liquidações financeiras">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ponto</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Período</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Receita Bruta</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Comissão</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Receita Líquida</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {settlements.map(s => {
                const meta = STATUS_META[s.status] || { label: s.status, className: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.operatingPointName}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtMoney(s.grossRevenueCents)}</td>
                    <td className="px-4 py-3 text-right text-orange-600">
                      {fmtMoney(s.commissionCents)}
                      <span className="text-xs text-gray-400 ml-1">({s.commissionPct}%)</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">
                      {fmtMoney(s.netRevenueCents)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
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
