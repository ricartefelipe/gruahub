'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import toast from 'react-hot-toast';

interface Campaign {
  id: string;
  name: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  machineId: string | null;
  ruleType: string;
  extraBonusPlays: number;
  buyN: number | null;
  getM: number | null;
}

interface Machine {
  id: string;
  assetNumber: string;
  name: string | null;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  DRAFT:  { label: 'Rascunho', className: 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]' },
  ACTIVE: { label: 'Ativa',    className: 'bg-green-100 text-green-700' },
  PAUSED: { label: 'Pausada',  className: 'bg-yellow-100 text-yellow-700' },
};

export default function PromotionsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    status: 'ACTIVE',
    startsAt: new Date().toISOString().slice(0, 16),
    endsAt: '',
    machineId: '',
    ruleType: 'EXTRA_BONUS',
    extraBonusPlays: '1',
    buyN: '2',
    getM: '1',
  });

  const { data: campaigns = [], isLoading, isError } = useQuery<Campaign[]>({
    queryKey: ['promotion-campaigns'],
    queryFn: () =>
      api.get('/promotions/campaigns?size=100').then(r => r.data?.content ?? []),
  });

  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ['machines-for-campaigns'],
    queryFn: () =>
      api.get('/machines?size=100').then(r => r.data?.content ?? []),
    enabled: showForm,
  });

  const create = useMutation({
    mutationFn: () => {
      const startsAt = new Date(form.startsAt).toISOString();
      const endsAt = form.endsAt ? new Date(form.endsAt).toISOString() : null;
      return api.post('/promotions/campaigns', {
        name: form.name.trim(),
        status: form.status,
        startsAt,
        endsAt,
        machineId: form.machineId || null,
        ruleType: form.ruleType,
        extraBonusPlays: form.ruleType === 'EXTRA_BONUS' ? Number(form.extraBonusPlays) || 1 : 0,
        buyN: form.ruleType === 'BUY_N_GET_M' ? Number(form.buyN) || 1 : null,
        getM: form.ruleType === 'BUY_N_GET_M' ? Number(form.getM) || 1 : null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotion-campaigns'] });
      setShowForm(false);
      toast.success('Campanha criada');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao criar campanha'),
  });

  const setStatus = useMutation({
    mutationFn: ({ campaign, status }: { campaign: Campaign; status: string }) =>
      api.patch(`/promotions/campaigns/${campaign.id}`, {
        name: campaign.name,
        status,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        machineId: campaign.machineId,
        ruleType: campaign.ruleType,
        extraBonusPlays: campaign.extraBonusPlays,
        buyN: campaign.buyN,
        getM: campaign.getM,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotion-campaigns'] });
      toast.success('Status atualizado');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao atualizar'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Promoções"
          description="Campanhas de jogada bônus aplicadas no crédito pós-pagamento"
        />
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg"
        >
          {showForm ? 'Fechar' : 'Nova campanha'}
        </button>
      </div>

      {showForm && (
        <div className="bg-[color:var(--surface)] border rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-[color:var(--text-muted)] font-medium">Nome</span>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[color:var(--text-muted)] font-medium">Status</span>
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              >
                <option value="ACTIVE">Ativa</option>
                <option value="DRAFT">Rascunho</option>
                <option value="PAUSED">Pausada</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[color:var(--text-muted)] font-medium">Início</span>
              <input
                type="datetime-local"
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={form.startsAt}
                onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[color:var(--text-muted)] font-medium">Fim (opcional)</span>
              <input
                type="datetime-local"
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={form.endsAt}
                onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[color:var(--text-muted)] font-medium">Máquina (vazio = todas)</span>
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={form.machineId}
                onChange={e => setForm(f => ({ ...f, machineId: e.target.value }))}
              >
                <option value="">Todas as máquinas</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.assetNumber}{m.name ? ` — ${m.name}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[color:var(--text-muted)] font-medium">Regra</span>
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={form.ruleType}
                onChange={e => setForm(f => ({ ...f, ruleType: e.target.value }))}
              >
                <option value="EXTRA_BONUS">Bônus extra fixo</option>
                <option value="BUY_N_GET_M">Compre N, ganhe M</option>
              </select>
            </label>
            {form.ruleType === 'EXTRA_BONUS' ? (
              <label className="block text-sm">
                <span className="text-[color:var(--text-muted)] font-medium">Jogadas bônus extras</span>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={form.extraBonusPlays}
                  onChange={e => setForm(f => ({ ...f, extraBonusPlays: e.target.value }))}
                />
              </label>
            ) : (
              <>
                <label className="block text-sm">
                  <span className="text-[color:var(--text-muted)] font-medium">Compre N</span>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={form.buyN}
                    onChange={e => setForm(f => ({ ...f, buyN: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-[color:var(--text-muted)] font-medium">Ganhe M</span>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={form.getM}
                    onChange={e => setForm(f => ({ ...f, getM: e.target.value }))}
                  />
                </label>
              </>
            )}
          </div>
          <button
            type="button"
            disabled={!form.name.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {create.isPending ? 'Salvando...' : 'Criar campanha'}
          </button>
        </div>
      )}

      <div className="bg-[color:var(--surface)] border rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-[color:var(--text-soft)] text-sm">Carregando...</p>
        ) : isError ? (
          <p className="p-6 text-red-500 text-sm">Falha ao carregar campanhas.</p>
        ) : campaigns.length === 0 ? (
          <p className="p-6 text-[color:var(--text-soft)] text-sm text-center">Nenhuma campanha cadastrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-[color:var(--text-muted)] uppercase border-b bg-[color:var(--surface-muted)]">
              <tr>
                <th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Regra</th>
                <th className="px-4 py-3 text-left">Janela</th>
                <th className="px-4 py-3 text-left">Escopo</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => {
                const meta = STATUS_META[c.status] ?? STATUS_META.DRAFT;
                const ruleLabel = c.ruleType === 'BUY_N_GET_M'
                  ? `Compre ${c.buyN}, ganhe ${c.getM}`
                  : `+${c.extraBonusPlays} bônus`;
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium text-[color:var(--text)]">{c.name}</td>
                    <td className="px-4 py-3 text-[color:var(--text-muted)]">{ruleLabel}</td>
                    <td className="px-4 py-3 text-[color:var(--text-muted)]">
                      {fmtDate(c.startsAt)} → {fmtDate(c.endsAt)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-muted)]">
                      {c.machineId ? c.machineId.slice(0, 8) + '…' : 'Todas'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {c.status !== 'ACTIVE' && (
                          <button
                            type="button"
                            className="text-xs text-green-700 hover:underline"
                            onClick={() => setStatus.mutate({ campaign: c, status: 'ACTIVE' })}
                          >
                            Ativar
                          </button>
                        )}
                        {c.status === 'ACTIVE' && (
                          <button
                            type="button"
                            className="text-xs text-yellow-700 hover:underline"
                            onClick={() => setStatus.mutate({ campaign: c, status: 'PAUSED' })}
                          >
                            Pausar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
