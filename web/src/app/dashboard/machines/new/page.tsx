'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
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
    queryFn: () => api.get('/operating-points', { params: { size: 200 } }).then(r => r.data),
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
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          aria-label="Voltar"
        >
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nova máquina</h1>
          <p className="text-gray-500 text-sm">Cadastre uma máquina de pelúcia ou grua na frota.</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={onSubmit} noValidate className="bg-white rounded-xl border divide-y">

        {/* Identificação */}
        <section className="p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Identificação</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Asset Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.assetNumber}
              onChange={e => set('assetNumber', e.target.value)}
              placeholder="GRUA-001"
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase ${
                errors.assetNumber ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {errors.assetNumber && (
              <p className="text-red-500 text-xs mt-1">{errors.assetNumber}</p>
            )}
            <p className="text-gray-400 text-xs mt-1">
              Código único da máquina. Será impresso no QR Code de campo.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome / apelido</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Grua Shopping Norte — Loja 12"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Controller ID</label>
            <input
              type="text"
              value={form.controllerId}
              onChange={e => set('controllerId', e.target.value)}
              placeholder="MAC address ou ID do dispositivo MQTT"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-400 text-xs mt-1">
              Identificador do controlador MQTT. Usado para vincular telemetria.
            </p>
          </div>
        </section>

        {/* Localização */}
        <section className="p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Localização</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ponto operacional</label>
            <select
              value={form.operatingPointId}
              onChange={e => set('operatingPointId', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <h2 className="font-semibold text-gray-800">Configuração</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preço da jogada (R$) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.50"
                min="0.50"
                value={form.playPriceCents}
                onChange={e => set('playPriceCents', e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.playPriceCents ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              {errors.playPriceCents && (
                <p className="text-red-500 text-xs mt-1">{errors.playPriceCents}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Capacidade de prêmios <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={form.prizeCapacity}
                onChange={e => set('prizeCapacity', e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.prizeCapacity ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              {errors.prizeCapacity && (
                <p className="text-red-500 text-xs mt-1">{errors.prizeCapacity}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jogadas bônus</label>
              <input
                type="number"
                min="0"
                value={form.bonusPlays}
                onChange={e => set('bonusPlays', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-gray-400 text-xs mt-1">Jogadas extras ao inserir crédito (0 = sem bônus)</p>
            </div>
          </div>
        </section>

        {/* Notas */}
        <section className="p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Observações</h2>
          <textarea
            rows={3}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Informações adicionais sobre a máquina…"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </section>

        {/* Actions */}
        <div className="p-6 flex justify-end gap-3">
          <Link
            href="/dashboard/machines"
            className="px-5 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50 transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {createMutation.isPending ? 'Salvando…' : 'Criar máquina'}
          </button>
        </div>
      </form>
    </div>
  );
}
