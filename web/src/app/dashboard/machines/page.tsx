'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { machinesApi, Machine } from '@/lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';

function StatusBadge({ status }: { status: Machine['status'] }) {
  const labels: Record<Machine['status'], string> = {
    ACTIVE: 'Online', OFFLINE: 'Offline', MAINTENANCE: 'Manutenção',
    DRAFT: 'Rascunho', DISABLED: 'Desabilitada', RETIRED: 'Aposentada',
  };
  const classes: Record<Machine['status'], string> = {
    ACTIVE: 'badge-online', OFFLINE: 'badge-offline',
    MAINTENANCE: 'badge-maintenance', DRAFT: 'badge-draft',
    DISABLED: 'badge-draft', RETIRED: 'badge-draft',
  };
  return <span className={classes[status]}>{labels[status]}</span>;
}

export default function MachinesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['machines', page],
    queryFn: () => machinesApi.list(page, 20).then(r => r.data),
    refetchInterval: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      machinesApi.changeStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines'] });
      toast.success('Status atualizado');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao atualizar status'),
  });

  if (isError) {
    return (
      <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        Erro ao carregar máquinas. Verifique sua conexão ou as permissões.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Máquinas</h1>
        <Link
          href="/dashboard/machines/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors focus:outline-none
                     focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          + Nova Máquina
        </Link>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
          Carregando...
        </div>
      ) : data?.content.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <p className="text-gray-400">Nenhuma máquina cadastrada.</p>
          <Link href="/dashboard/machines/new" className="text-blue-600 text-sm mt-2 inline-block">
            Cadastrar primeira máquina →
          </Link>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Patrimônio', 'Nome', 'Status', 'Preço / Jogada', 'Último Sinal', 'Ações'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {data?.content.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">{m.assetNumber}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <Link href={`/dashboard/machines/${m.id}`} className="hover:text-blue-600">
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: m.currency })
                        .format(m.playPriceCents / 100)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {m.lastSeenAt
                        ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                            .format(new Date(m.lastSeenAt))
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        aria-label={`Alterar status de ${m.name}`}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2
                                   focus:ring-blue-500 focus:outline-none"
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value) {
                            if (confirm(`Confirmar: alterar status para ${e.target.value}?`)) {
                              statusMutation.mutate({ id: m.id, status: e.target.value });
                            }
                            e.target.value = '';
                          }
                        }}
                      >
                        <option value="">Ação…</option>
                        <option value="ACTIVE">Ativar</option>
                        <option value="OFFLINE">Marcar Offline</option>
                        <option value="MAINTENANCE">Manutenção</option>
                        <option value="DISABLED">Desabilitar</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                {data.totalElements} máquinas | Página {page + 1} de {data.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={data.first}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-40
                             hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Página anterior"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={data.last}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-40
                             hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Próxima página"
                >
                  Próxima →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
