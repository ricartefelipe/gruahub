'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

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

interface Prize {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  costCents: number;
  sizeCategory: string | null;
  active: boolean;
  createdAt: string;
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

function fmtMoney(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'balances' | 'movements' | 'prizes'>('balances');
  const [showPrizeForm, setShowPrizeForm] = useState(false);
  const [prizeForm, setPrizeForm] = useState({
    sku: '',
    name: '',
    description: '',
    costCents: '0',
    sizeCategory: 'M',
  });

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

  const { data: prizes = [], isLoading: prizeLoading } = useQuery<Prize[]>({
    queryKey: ['prizes'],
    queryFn: () =>
      api.get('/inventory/prizes?size=200').then(r => r.data?.content ?? []),
    enabled: activeTab === 'prizes',
  });

  const createPrize = useMutation({
    mutationFn: () =>
      api.post('/inventory/prizes', {
        sku: prizeForm.sku.trim(),
        name: prizeForm.name.trim(),
        description: prizeForm.description.trim() || null,
        costCents: Number(prizeForm.costCents) || 0,
        sizeCategory: prizeForm.sizeCategory || null,
        active: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prizes'] });
      setShowPrizeForm(false);
      setPrizeForm({ sku: '', name: '', description: '', costCents: '0', sizeCategory: 'M' });
      toast.success('Prêmio cadastrado');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao cadastrar prêmio'),
  });

  const togglePrize = useMutation({
    mutationFn: (prize: Prize) =>
      api.put(`/inventory/prizes/${prize.id}`, {
        sku: prize.sku,
        name: prize.name,
        description: prize.description,
        costCents: prize.costCents,
        sizeCategory: prize.sizeCategory,
        active: !prize.active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prizes'] });
      toast.success('Prêmio atualizado');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao atualizar prêmio'),
  });

  const lowStock = balances.filter(b => b.occupancyPct < 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>
        <p className="text-sm text-gray-500 mt-1">Saldo de pelúcias, movimentações e catálogo</p>
      </div>

      {lowStock.length > 0 && activeTab === 'balances' && (
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

      <div className="border-b border-gray-200">
        <nav className="flex gap-4" role="tablist" aria-label="Abas de estoque">
          {([
            ['balances', 'Saldo por Máquina'],
            ['movements', 'Movimentações'],
            ['prizes', 'Catálogo'],
          ] as const).map(([tab, label]) => (
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
              {label}
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

      {activeTab === 'prizes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowPrizeForm(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              + Novo prêmio
            </button>
          </div>

          {showPrizeForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={prizeForm.sku}
                  onChange={e => setPrizeForm(f => ({ ...f, sku: e.target.value }))}
                  placeholder="SKU"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={prizeForm.name}
                  onChange={e => setPrizeForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nome"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={prizeForm.description}
                  onChange={e => setPrizeForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Descrição"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  value={prizeForm.costCents}
                  onChange={e => setPrizeForm(f => ({ ...f, costCents: e.target.value }))}
                  placeholder="Custo (centavos)"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <select
                  value={prizeForm.sizeCategory}
                  onChange={e => setPrizeForm(f => ({ ...f, sizeCategory: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  aria-label="Categoria de tamanho"
                >
                  <option value="P">P</option>
                  <option value="M">M</option>
                  <option value="G">G</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => createPrize.mutate()}
                  disabled={!prizeForm.sku.trim() || !prizeForm.name.trim() || createPrize.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  {createPrize.isPending ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  onClick={() => setShowPrizeForm(false)}
                  className="px-3 py-2 text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {prizeLoading ? (
            <div className="text-center py-8 text-gray-400">Carregando catálogo...</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm" role="table" aria-label="Catálogo de prêmios">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">SKU</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Nome</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Tamanho</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Custo</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {prizes.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.sku}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-gray-600">{p.sizeCategory || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtMoney(p.costCents)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {p.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => togglePrize.mutate(p)}
                          disabled={togglePrize.isPending}
                          className="text-xs px-3 py-1 bg-gray-800 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
                        >
                          {p.active ? 'Desativar' : 'Ativar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {prizes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        Nenhum prêmio cadastrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
