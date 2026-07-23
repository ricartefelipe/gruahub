'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

interface Ticket {
  id: string;
  machineId: string;
  machineAssetNumber: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  symptomCode: string | null;
  assignedTo: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: 'Crítica', className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200' },
  HIGH: { label: 'Alta', className: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200' },
  MEDIUM: { label: 'Média', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  LOW: { label: 'Baixa', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200' },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Aberto', className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200' },
  IN_PROGRESS: { label: 'Em andamento', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  RESOLVED: { label: 'Resolvido', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  CLOSED: { label: 'Fechado', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function MaintenancePage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [updateTarget, setUpdateTarget] = useState<Ticket | null>(null);
  const [updateForm, setUpdateForm] = useState({
    status: '',
    assignedTo: '',
    resolutionNotes: '',
  });

  const { data: tickets = [], isLoading, isError, error } = useQuery<Ticket[]>({
    queryKey: ['maintenance', statusFilter],
    queryFn: () =>
      api.get(`/maintenance?status=${statusFilter}&size=100`).then((r) => r.data?.content ?? []),
  });

  const updateTicket = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      api.put(`/maintenance/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      setUpdateTarget(null);
    },
  });

  function openUpdate(ticket: Ticket) {
    setUpdateTarget(ticket);
    setUpdateForm({
      status: ticket.status,
      assignedTo: ticket.assignedTo || '',
      resolutionNotes: ticket.resolutionNotes || '',
    });
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Campo
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Manutenção
          </h1>
          <p className="text-sm text-slate-500 mt-1">Chamados técnicos das máquinas da frota</p>
        </div>
        <Link
          href="/dashboard/machines"
          className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500 hover:text-blue-600 transition-colors"
        >
          Ir para frota
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(STATUS_META).map(([s, m]) => {
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={
                active
                  ? `px-3 py-1.5 rounded-full text-xs font-semibold ${m.className} ring-2 ring-offset-1 ring-blue-400`
                  : 'px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
              }
              aria-pressed={active}
            >
              {m.label}
            </button>
          );
        })}
        <span className="ml-auto text-sm text-slate-500 tabular-nums">
          {tickets.length} chamado(s)
        </span>
      </div>

      {isError && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 p-4 text-rose-700 dark:text-rose-200 text-sm"
          role="alert"
        >
          Erro ao carregar chamados: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-400">
          Carregando chamados…
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-10 text-center">
          <p className="text-emerald-800 dark:text-emerald-200 font-semibold">
            Nenhum chamado {STATUS_META[statusFilter]?.label.toLowerCase()}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => {
            const pMeta = PRIORITY_META[ticket.priority] || PRIORITY_META.LOW;
            const sMeta = STATUS_META[ticket.status] || STATUS_META.OPEN;
            return (
              <li
                key={ticket.id}
                className="rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200/80 dark:border-slate-800 p-4"
                aria-label={`Chamado: ${ticket.title}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${pMeta.className}`}>
                        {pMeta.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${sMeta.className}`}>
                        {sMeta.label}
                      </span>
                      <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">
                        {ticket.machineAssetNumber || ticket.machineId.slice(0, 8)}
                      </span>
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{ticket.title}</h3>
                    {ticket.description ? (
                      <p className="text-sm text-slate-500 line-clamp-2">{ticket.description}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 tabular-nums">
                      <span>Criado: {fmt(ticket.createdAt)}</span>
                      {ticket.assignedTo ? <span>Atribuído: {ticket.assignedTo}</span> : null}
                      {ticket.resolvedAt ? <span>Resolvido: {fmt(ticket.resolvedAt)}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openUpdate(ticket)}
                    className="text-xs px-3 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-500 whitespace-nowrap"
                    aria-label={`Atualizar chamado ${ticket.title}`}
                  >
                    Atualizar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {updateTarget ? (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Atualizar chamado de manutenção"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Atualizar chamado</h2>
            <p className="text-sm text-slate-500 mb-4">{updateTarget.title}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Status
                </label>
                <select
                  value={updateForm.status}
                  onChange={(e) => setUpdateForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  aria-label="Novo status do chamado"
                >
                  {Object.entries(STATUS_META).map(([s, m]) => (
                    <option key={s} value={s}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Atribuído a
                </label>
                <input
                  type="text"
                  value={updateForm.assignedTo}
                  onChange={(e) => setUpdateForm((f) => ({ ...f, assignedTo: e.target.value }))}
                  placeholder="Nome do técnico"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  aria-label="Nome do técnico responsável"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notas de resolução
                </label>
                <textarea
                  value={updateForm.resolutionNotes}
                  onChange={(e) =>
                    setUpdateForm((f) => ({ ...f, resolutionNotes: e.target.value }))
                  }
                  placeholder="Descreva o que foi feito…"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm h-20 resize-none bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  aria-label="Notas de resolução"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setUpdateTarget(null)}
                className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => updateTicket.mutate({ id: updateTarget.id, body: updateForm })}
                disabled={updateTicket.isPending}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
              >
                {updateTicket.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
