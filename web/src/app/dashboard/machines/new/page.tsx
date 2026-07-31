'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { machinesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface OperatingPoint {
  id: string;
  name: string;
  addressCity: string;
  addressState: string;
}

interface FormState {
  assetNumber: string;
  name: string;
  operatingPointId: string;
  playPriceCents: string;       // digitado em reais, convertido na submissão
  prizeCapacity: string;
  bonusPlays: string;
  controllerId: string;
  notes: string;
}

const INITIAL: FormState = {
  assetNumber: '',
  name: '',
  operatingPointId: '',
  playPriceCents: '2.00',
  prizeCapacity: '200',
  bonusPlays: '0',
  controllerId: '',
  notes: '',
};

export default function NewMachinePage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const { data: operatingPoints = [] } = useQuery<OperatingPoint[]>({
    queryKey: ['operating-points-select'],
    queryFn: () => api.get('/operating-points', { params: { size: 200 } }).then(r => r.data?.content ?? []),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      machinesApi.create(payload as any),
    onSuccess: (r) => {
      toast.success('Máquina criada com sucesso!');
      router.push(`/dashboard/machines/${r.data.id}`);
    },
    onError: (e: any) => {
      const msg = e.response?.data?.title || e.message || 'Erro ao criar máquina';
      toast.error(msg);
    },
  });

  function set(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.assetNumber.trim()) errs.assetNumber = 'Obrigatório';
    if (!form.playPriceCents || isNaN(parseFloat(form.playPriceCents)))
      errs.playPriceCents = 'Valor inválido';
    if (!form.prizeCapacity || isNaN(parseInt(form.prizeCapacity, 10)))
      errs.prizeCapacity = 'Número inválido';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const priceCents = Math.round(parseFloat(form.playPriceCents) * 100);
    createMutation.mutate({
      assetNumber: form.assetNumber.trim().toUpperCase(),
      name: form.name.trim() || undefined,
      operatingPointId: form.operatingPointId || undefined,
      playPriceCents: priceCents,
      prizeCapacity: parseInt(form.prizeCapacity, 10),
      bonusPlays: parseInt(form.bonusPlays, 10) || 0,
      controllerId: form.controllerId.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/machines"
          className="p-2 rounded-lg text-[color:var(--text-soft)] hover:text-[color:var(--text-muted)] hover:bg-[color:var(--surface-muted)] transition"
          aria-label="Voltar"
        >
          ←
        </Link>
        <PageHeader title="Nova máquina" description="Cadastre uma máquina de pelúcia ou grua na frota." />
      </div>

      {/* Form */}
      <form onSubmit={onSubmit} noValidate className="bg-[color:var(--surface)] rounded-xl border divide-y">

        {/* Identificação */}
        <section className="p-6 space-y-4">
          <h2 className="font-semibold text-[color:var(--text)]">Identificação</h2>

          <div>
            <label className="block text-sm font-medium text-[color:var(--text-muted)] mb-1">
              Asset Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.assetNumber}
              onChange={e => set('assetNumber', e.target.value)}
              placeholder="GRUA-001"
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-brand uppercase ${
                errors.assetNumber ? 'border-red-400' : 'border-[color:var(--line)]'
              }`}
            />
            {errors.assetNumber && (
              <p className="text-red-500 text-xs mt-1">{errors.assetNumber}</p>
            )}
            <p className="text-[color:var(--text-soft)] text-xs mt-1">
              Código único da máquina. Será impresso no QR Code de campo.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[color:var(--text-muted)] mb-1">Nome / apelido</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Grua Shopping Norte — Loja 12"
              className="w-full px-3 py-2 rounded-lg border border-[color:var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[color:var(--text-muted)] mb-1">Controller ID</label>
            <input
              type="text"
              value={form.controllerId}
              onChange={e => set('controllerId', e.target.value)}
              placeholder="MAC address ou ID do dispositivo MQTT"
              className="w-full px-3 py-2 rounded-lg border border-[color:var(--line)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <p className="text-[color:var(--text-soft)] text-xs mt-1">
              Identificador do controlador MQTT. Usado para vincular telemetria.
            </p>
          </div>
        </section>

        {/* Localização */}
        <section className="p-6 space-y-4">
          <h2 className="font-semibold text-[color:var(--text)]">Localização</h2>

          <div>
            <label className="block text-sm font-medium text-[color:var(--text-muted)] mb-1">Ponto operacional</label>
            <select
              value={form.operatingPointId}
              onChange={e => set('operatingPointId', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[color:var(--line)] text-sm bg-[color:var(--surface)] focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">— Selecione (opcional) —</option>
              {operatingPoints.map(op => (
                <option key={op.id} value={op.id}>
                  {op.name} — {op.addressCity}/{op.addressState}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Configuração */}
        <section className="p-6 space-y-4">
          <h2 className="font-semibold text-[color:var(--text)]">Configuração</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[color:var(--text-muted)] mb-1">
                Preço da jogada (R$) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.50"
                min="0.50"
                value={form.playPriceCents}
                onChange={e => set('playPriceCents', e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-brand ${
                  errors.playPriceCents ? 'border-red-400' : 'border-[color:var(--line)]'
                }`}
              />
              {errors.playPriceCents && (
                <p className="text-red-500 text-xs mt-1">{errors.playPriceCents}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[color:var(--text-muted)] mb-1">
                Capacidade de prêmios <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={form.prizeCapacity}
                onChange={e => set('prizeCapacity', e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-brand ${
                  errors.prizeCapacity ? 'border-red-400' : 'border-[color:var(--line)]'
                }`}
              />
              {errors.prizeCapacity && (
                <p className="text-red-500 text-xs mt-1">{errors.prizeCapacity}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[color:var(--text-muted)] mb-1">Jogadas bônus</label>
              <input
                type="number"
                min="0"
                value={form.bonusPlays}
                onChange={e => set('bonusPlays', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[color:var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <p className="text-[color:var(--text-soft)] text-xs mt-1">Jogadas extras ao inserir crédito (0 = sem bônus)</p>
            </div>
          </div>
        </section>

        {/* Notas */}
        <section className="p-6 space-y-4">
          <h2 className="font-semibold text-[color:var(--text)]">Observações</h2>
          <textarea
            rows={3}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Informações adicionais sobre a máquina…"
            className="w-full px-3 py-2 rounded-lg border border-[color:var(--line)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </section>

        {/* Actions */}
        <div className="p-6 flex justify-end gap-3">
          <Link
            href="/dashboard/machines"
            className="px-5 py-2 text-sm font-medium text-[color:var(--text-muted)] border rounded-lg hover:bg-[color:var(--surface-muted)] transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-5 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-[color:var(--brand-strong)] disabled:opacity-50 transition"
          >
            {createMutation.isPending ? 'Salvando…' : 'Criar máquina'}
          </button>
        </div>
      </form>
    </div>
  );
}
