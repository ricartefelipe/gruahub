'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
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
      <PageHeader title="Locais" description="Estabelecimentos e pontos de operação" />

      <div className="border-b border-[color:var(--line)]">
        <nav className="flex gap-4" aria-label="Abas de locais">
          {(['establishments', 'points'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-brand text-brand'
                  : 'border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text-muted)]'
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
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-[color:var(--brand-strong)] transition-colors"
              aria-label="Novo estabelecimento"
            >
              + Novo Estabelecimento
            </button>
          </div>

          {showNewEst && (
            <div className="bg-brand/10 border border-brand/30 rounded-xl p-4 flex gap-3">
              <input
                type="text"
                value={newEstName}
                onChange={e => setNewEstName(e.target.value)}
                placeholder="Nome do estabelecimento"
                className="flex-1 border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                onKeyDown={e => e.key === 'Enter' && newEstName.trim() && createEst.mutate(newEstName.trim())}
                aria-label="Nome do novo estabelecimento"
                autoFocus
              />
              <button
                onClick={() => newEstName.trim() && createEst.mutate(newEstName.trim())}
                disabled={!newEstName.trim() || createEst.isPending}
                className="px-4 py-2 bg-brand text-white text-sm rounded-lg disabled:opacity-50 hover:bg-[color:var(--brand-strong)]"
              >
                {createEst.isPending ? 'Criando...' : 'Criar'}
              </button>
              <button
                onClick={() => { setShowNewEst(false); setNewEstName(''); }}
                className="px-3 py-2 text-[color:var(--text-muted)] hover:text-[color:var(--text-muted)]"
                aria-label="Cancelar"
              >
                ✕
              </button>
            </div>
          )}

          {estLoading ? (
            <div className="text-center py-8 text-[color:var(--text-soft)]">Carregando...</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {establishments.map(est => (
                <div
                  key={est.id}
                  className="bg-[color:var(--surface)] border border-[color:var(--line)] rounded-xl p-4 hover:shadow-sm transition-shadow"
                  role="article"
                  aria-label={`Estabelecimento: ${est.name}`}
                >
                  <div className="font-semibold text-[color:var(--text)]">{est.name}</div>
                  {est.externalCode && (
                    <div className="text-xs text-[color:var(--text-soft)] font-mono mt-1">{est.externalCode}</div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      est.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]'
                    }`}>
                      {est.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    </span>
                    <span className="text-xs text-[color:var(--text-soft)]">
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
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-[color:var(--brand-strong)]"
            >
              + Novo ponto
            </button>
          </div>

          {showNewPoint && (
            <div className="bg-brand/10 border border-brand/30 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={pointForm.establishmentId}
                  onChange={e => setPointForm(f => ({ ...f, establishmentId: e.target.value }))}
                  className="border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm"
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
                  className="border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={pointForm.addressCity}
                  onChange={e => setPointForm(f => ({ ...f, addressCity: e.target.value }))}
                  placeholder="Cidade"
                  className="border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={pointForm.addressState}
                  onChange={e => setPointForm(f => ({ ...f, addressState: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="UF"
                  maxLength={2}
                  className="border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={pointForm.commissionPct}
                  onChange={e => setPointForm(f => ({ ...f, commissionPct: e.target.value }))}
                  placeholder="Comissão %"
                  className="border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={pointForm.contractType}
                  onChange={e => setPointForm(f => ({ ...f, contractType: e.target.value }))}
                  placeholder="Tipo de contrato"
                  className="border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => createPoint.mutate()}
                  disabled={!pointForm.establishmentId || !pointForm.name.trim() || createPoint.isPending}
                  className="px-4 py-2 bg-brand text-white text-sm rounded-lg disabled:opacity-50"
                >
                  {createPoint.isPending ? 'Criando...' : 'Criar'}
                </button>
                <button
                  onClick={() => setShowNewPoint(false)}
                  className="px-3 py-2 text-[color:var(--text-muted)] hover:text-[color:var(--text-muted)]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {ptLoading ? (
            <div className="text-center py-8 text-[color:var(--text-soft)]">Carregando pontos...</div>
          ) : (
            <div className="bg-[color:var(--surface)] rounded-xl border border-[color:var(--line)] overflow-hidden">
              <table className="w-full text-sm" role="table" aria-label="Pontos de operação">
                <thead className="bg-[color:var(--surface-muted)] border-b border-[color:var(--line)]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Ponto</th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Estabelecimento</th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Cidade</th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Comissão</th>
                    <th className="px-4 py-3 text-right font-semibold text-[color:var(--text-muted)]">Score</th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--text-muted)]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--line)]">
                  {points.map(p => (
                    <tr key={p.id} className="hover:bg-[color:var(--surface-muted)]">
                      <td className="px-4 py-3 font-medium text-[color:var(--text)]">{p.name}</td>
                      <td className="px-4 py-3 text-[color:var(--text-muted)]">{p.establishmentName}</td>
                      <td className="px-4 py-3 text-[color:var(--text-muted)]">
                        {[p.addressCity, p.addressState].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-[color:var(--text-muted)]">
                        {p.commissionPct != null ? `${p.commissionPct}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.priorityScore != null ? (
                          <span className={`font-bold ${
                            p.priorityScore >= 80 ? 'text-green-600' :
                            p.priorityScore >= 50 ? 'text-amber-600' : 'text-[color:var(--text-soft)]'
                          }`}>
                            {p.priorityScore}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]'
                        }`}>
                          {p.status === 'ACTIVE' ? 'Ativo' : p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {points.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[color:var(--text-soft)]">
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
