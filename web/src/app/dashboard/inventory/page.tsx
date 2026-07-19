'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface StockBalance {
  machineId: string;
  machineAssetNumber: string;
  prizeId: string;
  prizeName: string;
  sku: string;
  currentQuantity: number;
  capacity: number;
  occupancyPct: number;
}

interface StockMovement {
  id: string;
  machineId: string;
  machineAssetNumber: string;
  prizeId: string;
  prizeName: string;
  movementType: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  clientOperationId: string | null;
  occurredAt: string;
  notes: string | null;
}

const MOV_TYPE_META: Record<string, { label: string; delta: string }> = {
  REPLENISHMENT: { label: 'Reposição',   delta: '+' },
  PRIZE_GIVEN:   { label: 'Prêmio dado', delta: '-' },
  ADJUSTMENT:    { label: 'Ajuste',      delta: '±' },
  INITIAL_LOAD:  { label: 'Carga inicial', delta: '+' },
  REMOVAL:       { label: 'Remoção',     delta: '-' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<'balances' | 'movements'>('balances');

  const { data: balances = [], isLoading: balLoading, isError: balError, error: balErrorObj } = useQuery<StockBalance[]>({
    queryKey: ['stock-balances'],
    queryFn: () =>
      api.get('/inventory/balances?size=200').then(r => r.data?.content ?? []),
    enabled: activeTab === 'balances',
  });

  const { data: movements = [], isLoading: movLoading, isError: movError, error: movErrorObj } = useQuery<StockMovement[]>({
    queryKey: ['stock-movements'],
    queryFn: () =>
      api.get('/inventory/movements?size=100').then(r => r.data?.content ?? []),
    enabled: activeTab === 'movements',
    refetchInterval: 30_000,
  });

  const lowStock = balances.filter(b => b.occupancyPct < 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>
        <p className="text-sm text-gray-500 mt-1">Saldo de pelúcias e movimentações</p>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3"
             role="alert">
          <span className="text-red-500 text-xl" aria-hidden="true">⚠️</span>
          <div>
            <p className="font-semibold text-red-700">
              {lowStock.length} máquina(s) com estoque crítico (&lt;20%)
            </p>
            <p className="text-sm text-red-600 mt-0.5">
              {lowStock.map(b => b.machineAssetNumber).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4" role="tablist" aria-label="Abas de estoque">
          {(['balances', 'movements'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              role="tab"
              aria-selected={activeTab === tab}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'balances' ? 'Saldo por Máquina' : 'Movimentações'}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'balances' && balError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar saldo: {(balErrorObj as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {activeTab === 'balances' && (
        balLoading ? (
          <div className="text-center py-12 text-gray-400">Carregando saldo...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm" role="table" aria-label="Saldo de estoque por máquina">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Máquina</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Prêmio</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">SKU</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Qtd</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Cap.</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Ocupação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {balances.map((b, i) => {
                  const pct = Math.min(100, b.occupancyPct);
                  const barColor = pct < 20 ? '#ef4444' : pct < 50 ? '#f59e0b' : '#22c55e';
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-800">
                        {b.machineAssetNumber}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{b.prizeName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.sku}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {b.currentQuantity}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{b.capacity}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[80px]">
                            <div
                              className="h-2 rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: barColor }}
                              role="progressbar"
                              aria-valuenow={pct}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${pct.toFixed(0)}% de ocupação`}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {balances.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      Nenhum dado de estoque disponível.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {activeTab === 'movements' && movError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar movimentações: {(movErrorObj as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {activeTab === 'movements' && (
        movLoading ? (
          <div className="text-center py-12 text-gray-400">Carregando movimentações...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm" role="table" aria-label="Movimentações de estoque">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Data</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Máquina</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Prêmio</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Delta</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Antes</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Depois</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movements.map(m => {
                  const meta = MOV_TYPE_META[m.movementType] || { label: m.movementType, delta: '?' };
                  const isPositive = m.quantityDelta > 0;
                  return (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(m.occurredAt)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{m.machineAssetNumber}</td>
                      <td className="px-4 py-3 text-gray-600">{m.prizeName}</td>
                      <td className={`px-4 py-3 text-right font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? '+' : ''}{m.quantityDelta}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{m.quantityBefore}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{m.quantityAfter}</td>
                    </tr>
                  );
                })}
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      Nenhuma movimentação registrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
