'use client';

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
  CRITICAL: { label: 'Crítica',  className: 'bg-red-100 text-red-700' },
  HIGH:     { label: 'Alta',     className: 'bg-orange-100 text-orange-700' },
  MEDIUM:   { label: 'Média',    className: 'bg-yellow-100 text-yellow-700' },
  LOW:      { label: 'Baixa',    className: 'bg-blue-100 text-blue-700' },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  OPEN:        { label: 'Aberto',        className: 'bg-red-100 text-red-700' },
  IN_PROGRESS: { label: 'Em andamento',  className: 'bg-yellow-100 text-yellow-700' },
  RESOLVED:    { label: 'Resolvido',     className: 'bg-green-100 text-green-700' },
  CLOSED:      { label: 'Fechado',       className: 'bg-gray-100 text-gray-600' },
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function MaintenancePage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [updateTarget, setUpdateTarget] = useState<Ticket | null>(null);
  const [updateForm, setUpdateForm] = useState({ status: '', assignedTo: '', resolutionNotes: '' });

  const { data: tickets = [], isLoading, isError, error } = useQuery<Ticket[]>({
    queryKey: ['maintenance', statusFilter],
    queryFn: () =>
      api.get(`/maintenance?status=${statusFilter}&size=100`)
         .then(r => r.data?.content ?? []),
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manutenção</h1>
        <p className="text-sm text-gray-500 mt-1">Chamados de manutenção de máquinas</p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        {Object.entries(STATUS_META).map(([s, m]) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all
              ${statusFilter === s ? m.className + ' ring-2 ring-offset-1 ring-blue-400' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            aria-pressed={statusFilter === s}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-500">{tickets.length} chamado(s)</span>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar chamados: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando chamados...</div>
      ) : (
        <div className="space-y-3">
          {tickets.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <p className="text-green-700 font-semibold">Nenhum chamado {STATUS_META[statusFilter]?.label.toLowerCase()}</p>
            </div>
          ) : (
            tickets.map(ticket => {
              const pMeta = PRIORITY_META[ticket.priority] || PRIORITY_META.LOW;
              const sMeta = STATUS_META[ticket.status] || STATUS_META.OPEN;
              return (
                <div
                  key={ticket.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                  role="article"
                  aria-label={`Chamado: ${ticket.title}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${pMeta.className}`}>
                          {pMeta.label}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${sMeta.className}`}>
                          {sMeta.label}
                        </span>
                        <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">
                          {ticket.machineAssetNumber || ticket.machineId.slice(0, 8)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-gray-900 mt-2">{ticket.title}</h3>
                      {ticket.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{ticket.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span>Criado: {fmt(ticket.createdAt)}</span>
                        {ticket.assignedTo && <span>Atribuído: {ticket.assignedTo}</span>}
                        {ticket.resolvedAt && <span>Resolvido: {fmt(ticket.resolvedAt)}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => openUpdate(ticket)}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                      aria-label={`Atualizar chamado ${ticket.title}`}
                    >
                      Atualizar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Update modal */}
      {updateTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Atualizar chamado de manutenção"
        >
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Atualizar Chamado</h2>
            <p className="text-sm text-gray-600 mb-4 font-medium">{updateTarget.title}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={updateForm.status}
                  onChange={e => setUpdateForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  aria-label="Novo status do chamado"
                >
                  {Object.entries(STATUS_META).map(([s, m]) => (
                    <option key={s} value={s}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Atribuído a</label>
                <input
                  type="text"
                  value={updateForm.assignedTo}
                  onChange={e => setUpdateForm(f => ({ ...f, assignedTo: e.target.value }))}
                  placeholder="Nome do técnico"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  aria-label="Nome do técnico responsável"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas de Resolução</label>
                <textarea
                  value={updateForm.resolutionNotes}
                  onChange={e => setUpdateForm(f => ({ ...f, resolutionNotes: e.target.value }))}
                  placeholder="Descreva o que foi feito..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20 resize-none"
                  aria-label="Notas de resolução"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setUpdateTarget(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => updateTicket.mutate({ id: updateTarget.id, body: updateForm })}
                disabled={updateTicket.isPending}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {updateTicket.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
