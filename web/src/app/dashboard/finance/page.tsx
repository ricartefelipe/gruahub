'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

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

interface CommissionPolicy {
  id: string;
  operatingPointId: string;
  operatingPointName: string;
  policyType: string;
  percentage: number | null;
  fixedAmountCents: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  versionNumber: number;
}

interface OperatingPoint {
  id: string;
  name: string;
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
  DRAFT:     { label: 'Rascunho',  className: 'bg-gray-100 text-gray-600' },
  APPROVED:  { label: 'Aprovado', className: 'bg-blue-100 text-blue-700' },
  PAID:      { label: 'Pago',     className: 'bg-green-100 text-green-700' },
  DISPUTED:  { label: 'Em disputa', className: 'bg-red-100 text-red-700' },
};

export default function FinancePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'settlements' | 'policies'>('settlements');
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    operatingPointId: '',
    policyType: 'PERCENTAGE',
    percentage: '15',
    fixedAmountCents: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
  });

  const { data: settlements = [], isLoading, isError, error } = useQuery<Settlement[]>({
    queryKey: ['settlements'],
    queryFn: () =>
      api.get('/finance/settlements?size=100').then(r => r.data?.content ?? []),
  });

  const { data: policies = [], isLoading: policiesLoading } = useQuery<CommissionPolicy[]>({
    queryKey: ['commission-policies'],
    queryFn: () =>
      api.get('/finance/commission-policies?size=100').then(r => r.data?.content ?? []),
    enabled: tab === 'policies',
  });

  const { data: points = [] } = useQuery<OperatingPoint[]>({
    queryKey: ['operating-points'],
    queryFn: () =>
      api.get('/operating-points?size=100').then(r => r.data?.content ?? []),
    enabled: showPolicyForm,
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.put(`/finance/settlements/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements'] });
      toast.success('Liquidação aprovada');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao aprovar'),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => api.put(`/finance/settlements/${id}/mark-paid`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements'] });
      toast.success('Liquidação marcada como paga');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao marcar como paga'),
  });

  const createPolicy = useMutation({
    mutationFn: () =>
      api.post('/finance/commission-policies', {
        operatingPointId: policyForm.operatingPointId,
        policyType: policyForm.policyType,
        percentage: policyForm.policyType === 'PERCENTAGE'
          ? Number(policyForm.percentage)
          : null,
        fixedAmountCents: policyForm.policyType === 'FIXED'
          ? Number(policyForm.fixedAmountCents)
          : null,
        effectiveFrom: policyForm.effectiveFrom,
        effectiveTo: policyForm.effectiveTo || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commission-policies'] });
      setShowPolicyForm(false);
      toast.success('Política de comissão criada');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao criar política'),
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
        <p className="text-sm text-gray-500 mt-1">Liquidações e políticas de comissão</p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-4" aria-label="Abas financeiras">
          {([
            ['settlements', 'Liquidações'],
            ['policies', 'Políticas de comissão'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              aria-selected={tab === key}
              role="tab"
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'settlements' && (
        <>
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

          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Carregando liquidações...</div>
          ) : settlements.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-gray-500">Nenhuma liquidação registrada ainda.</p>
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
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {settlements.map(s => {
                    const meta = STATUS_META[s.status] || { label: s.status, className: 'bg-gray-100 text-gray-600' };
                    const canApprove = s.status === 'PENDING' || s.status === 'DRAFT';
                    const canPay = s.status === 'APPROVED';
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
                        <td className="px-4 py-3 text-right space-x-2">
                          {canApprove && (
                            <button
                              onClick={() => approve.mutate(s.id)}
                              disabled={approve.isPending}
                              className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                              Aprovar
                            </button>
                          )}
                          {canPay && (
                            <button
                              onClick={() => markPaid.mutate(s.id)}
                              disabled={markPaid.isPending}
                              className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              Marcar pago
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'policies' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowPolicyForm(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              + Nova política
            </button>
          </div>

          {showPolicyForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={policyForm.operatingPointId}
                  onChange={e => setPolicyForm(f => ({ ...f, operatingPointId: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  aria-label="Ponto de operação"
                >
                  <option value="">Selecione o ponto</option>
                  {points.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={policyForm.policyType}
                  onChange={e => setPolicyForm(f => ({ ...f, policyType: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  aria-label="Tipo de política"
                >
                  <option value="PERCENTAGE">Percentual</option>
                  <option value="FIXED">Valor fixo</option>
                </select>
                {policyForm.policyType === 'PERCENTAGE' ? (
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={policyForm.percentage}
                    onChange={e => setPolicyForm(f => ({ ...f, percentage: e.target.value }))}
                    placeholder="Percentual"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                ) : (
                  <input
                    type="number"
                    min="0"
                    value={policyForm.fixedAmountCents}
                    onChange={e => setPolicyForm(f => ({ ...f, fixedAmountCents: e.target.value }))}
                    placeholder="Valor fixo (centavos)"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                )}
                <input
                  type="date"
                  value={policyForm.effectiveFrom}
                  onChange={e => setPolicyForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  aria-label="Vigência inicial"
                />
                <input
                  type="date"
                  value={policyForm.effectiveTo}
                  onChange={e => setPolicyForm(f => ({ ...f, effectiveTo: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  aria-label="Vigência final"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => createPolicy.mutate()}
                  disabled={!policyForm.operatingPointId || createPolicy.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  {createPolicy.isPending ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  onClick={() => setShowPolicyForm(false)}
                  className="px-3 py-2 text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {policiesLoading ? (
            <div className="text-center py-8 text-gray-400">Carregando políticas...</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm" role="table" aria-label="Políticas de comissão">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Ponto</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Tipo</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Valor</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Vigência</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Versão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {policies.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.operatingPointName}</td>
                      <td className="px-4 py-3 text-gray-600">{p.policyType}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {p.policyType === 'FIXED'
                          ? fmtMoney(p.fixedAmountCents ?? 0)
                          : `${p.percentage ?? 0}%`}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {fmtDate(p.effectiveFrom)}
                        {p.effectiveTo ? ` – ${fmtDate(p.effectiveTo)}` : ' – vigente'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">v{p.versionNumber}</td>
                    </tr>
                  ))}
                  {policies.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                        Nenhuma política cadastrada.
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
