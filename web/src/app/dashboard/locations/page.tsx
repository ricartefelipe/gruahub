'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Establishment {
  id: string;
  name: string;
  externalCode: string | null;
  status: string;
  createdAt: string;
}

interface OperatingPoint {
  id: string;
  establishmentId: string;
  establishmentName: string;
  name: string;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  commissionPct: number | null;
  contractType: string | null;
  status: string;
  priorityScore: number | null;
}

export default function LocationsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'establishments' | 'points'>('establishments');
  const [newEstName, setNewEstName] = useState('');
  const [showNewEst, setShowNewEst] = useState(false);
  const [showNewPoint, setShowNewPoint] = useState(false);
  const [pointForm, setPointForm] = useState({
    establishmentId: '',
    name: '',
    addressCity: '',
    addressState: '',
    commissionPct: '15',
    contractType: 'COMODATO',
  });

  const { data: establishments = [], isLoading: estLoading, isError: estError, error: estErrorObj } = useQuery<Establishment[]>({
    queryKey: ['establishments'],
    queryFn: () =>
      api.get('/establishments?size=100').then(r => r.data?.content ?? []),
  });

  const { data: points = [], isLoading: ptLoading, isError: ptError, error: ptErrorObj } = useQuery<OperatingPoint[]>({
    queryKey: ['operating-points'],
    queryFn: () =>
      api.get('/operating-points?size=100').then(r => r.data?.content ?? []),
    enabled: activeTab === 'points' || showNewPoint,
  });

  const createEst = useMutation({
    mutationFn: (name: string) => api.post('/establishments', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['establishments'] });
      setShowNewEst(false);
      setNewEstName('');
      toast.success('Estabelecimento criado');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao criar estabelecimento'),
  });

  const createPoint = useMutation({
    mutationFn: () =>
      api.post('/operating-points', {
        establishmentId: pointForm.establishmentId,
        name: pointForm.name,
        addressCity: pointForm.addressCity || null,
        addressState: pointForm.addressState || null,
        commissionPct: pointForm.commissionPct ? Number(pointForm.commissionPct) : null,
        contractType: pointForm.contractType || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operating-points'] });
      setShowNewPoint(false);
      setPointForm({
        establishmentId: '',
        name: '',
        addressCity: '',
        addressState: '',
        commissionPct: '15',
        contractType: 'COMODATO',
      });
      toast.success('Ponto de operação criado');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao criar ponto'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Locais</h1>
        <p className="text-sm text-gray-500 mt-1">Estabelecimentos e pontos de operação</p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-4" aria-label="Abas de locais">
          {(['establishments', 'points'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              aria-selected={activeTab === tab}
              role="tab"
            >
              {tab === 'establishments' ? `Estabelecimentos (${establishments.length})` : `Pontos (${points.length})`}
            </button>
          ))}
        </nav>
      </div>

      {estError && activeTab === 'establishments' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar estabelecimentos: {(estErrorObj as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {ptError && activeTab === 'points' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar pontos de operação: {(ptErrorObj as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {activeTab === 'establishments' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowNewEst(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              aria-label="Novo estabelecimento"
            >
              + Novo Estabelecimento
            </button>
          </div>

          {showNewEst && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
              <input
                type="text"
                value={newEstName}
                onChange={e => setNewEstName(e.target.value)}
                placeholder="Nome do estabelecimento"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={e => e.key === 'Enter' && newEstName.trim() && createEst.mutate(newEstName.trim())}
                aria-label="Nome do novo estabelecimento"
                autoFocus
              />
              <button
                onClick={() => newEstName.trim() && createEst.mutate(newEstName.trim())}
                disabled={!newEstName.trim() || createEst.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50 hover:bg-blue-700"
              >
                {createEst.isPending ? 'Criando...' : 'Criar'}
              </button>
              <button
                onClick={() => { setShowNewEst(false); setNewEstName(''); }}
                className="px-3 py-2 text-gray-500 hover:text-gray-700"
                aria-label="Cancelar"
              >
                ✕
              </button>
            </div>
          )}

          {estLoading ? (
            <div className="text-center py-8 text-gray-400">Carregando...</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {establishments.map(est => (
                <div
                  key={est.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                  role="article"
                  aria-label={`Estabelecimento: ${est.name}`}
                >
                  <div className="font-semibold text-gray-900">{est.name}</div>
                  {est.externalCode && (
                    <div className="text-xs text-gray-400 font-mono mt-1">{est.externalCode}</div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      est.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {est.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {points.filter(p => p.establishmentId === est.id).length} pontos
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'points' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowNewPoint(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              + Novo ponto
            </button>
          </div>

          {showNewPoint && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={pointForm.establishmentId}
                  onChange={e => setPointForm(f => ({ ...f, establishmentId: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  aria-label="Estabelecimento"
                >
                  <option value="">Estabelecimento</option>
                  {establishments.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={pointForm.name}
                  onChange={e => setPointForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nome do ponto"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={pointForm.addressCity}
                  onChange={e => setPointForm(f => ({ ...f, addressCity: e.target.value }))}
                  placeholder="Cidade"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={pointForm.addressState}
                  onChange={e => setPointForm(f => ({ ...f, addressState: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="UF"
                  maxLength={2}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={pointForm.commissionPct}
                  onChange={e => setPointForm(f => ({ ...f, commissionPct: e.target.value }))}
                  placeholder="Comissão %"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={pointForm.contractType}
                  onChange={e => setPointForm(f => ({ ...f, contractType: e.target.value }))}
                  placeholder="Tipo de contrato"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => createPoint.mutate()}
                  disabled={!pointForm.establishmentId || !pointForm.name.trim() || createPoint.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  {createPoint.isPending ? 'Criando...' : 'Criar'}
                </button>
                <button
                  onClick={() => setShowNewPoint(false)}
                  className="px-3 py-2 text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {ptLoading ? (
            <div className="text-center py-8 text-gray-400">Carregando pontos...</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm" role="table" aria-label="Pontos de operação">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Ponto</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Estabelecimento</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Cidade</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Comissão</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Score</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {points.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-gray-600">{p.establishmentName}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {[p.addressCity, p.addressState].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {p.commissionPct != null ? `${p.commissionPct}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.priorityScore != null ? (
                          <span className={`font-bold ${
                            p.priorityScore >= 80 ? 'text-green-600' :
                            p.priorityScore >= 50 ? 'text-amber-600' : 'text-gray-400'
                          }`}>
                            {p.priorityScore}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {p.status === 'ACTIVE' ? 'Ativo' : p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {points.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        Nenhum ponto de operação cadastrado.
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
