'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface FiscalDocument {
  id: string;
  documentType: string;
  status: string;
  paymentTransactionId: string | null;
  settlementId: string | null;
  amountCents: number;
  currency: string;
  issuerDocument: string | null;
  issuerName: string | null;
  issuedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  DRAFT:       { label: 'Rascunho',  className: 'bg-gray-100 text-gray-700' },
  ISSUED_STUB: { label: 'Emitido*',  className: 'bg-teal-100 text-teal-800' },
  CANCELLED:   { label: 'Cancelado', className: 'bg-red-100 text-red-700' },
};

function fmtMoney(cents: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function FiscalPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const listPath = statusFilter
    ? `/fiscal/documents?status=${statusFilter}`
    : '/fiscal/documents';

  const { data: documents = [], isLoading, isError } = useQuery<FiscalDocument[]>({
    queryKey: ['fiscal-documents', statusFilter],
    queryFn: () => api.get(listPath).then(r => r.data?.content ?? []),
  });

  const issue = useMutation({
    mutationFn: (id: string) => api.post(`/fiscal/documents/${id}/issue-stub`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal-documents'] });
      toast.success('Stub emitido');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao emitir'),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/fiscal/documents/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal-documents'] });
      toast.success('Documento cancelado');
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Falha ao cancelar'),
  });

  const downloadPdf = async (id: string) => {
    try {
      const res = await api.get(`/fiscal/documents/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiscal-stub-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Falha ao baixar PDF');
    }
  };

  let body;
  if (isLoading) {
    body = <p className="p-6 text-gray-400 text-sm">Carregando...</p>;
  } else if (isError) {
    body = <p className="p-6 text-red-500 text-sm">Falha ao carregar documentos.</p>;
  } else if (documents.length === 0) {
    body = (
      <p className="p-6 text-gray-400 text-sm text-center">
        Nenhum documento. Confirme um pagamento para gerar rascunho automático.
      </p>
    );
  } else {
    body = (
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 uppercase border-b bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left">Tipo</th>
            <th className="px-4 py-3 text-left">Valor</th>
            <th className="px-4 py-3 text-left">Emitente</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Criado</th>
            <th className="px-4 py-3 text-left">Ações</th>
          </tr>
        </thead>
        <tbody>
          {documents.map(doc => {
            const meta = STATUS_META[doc.status] ?? STATUS_META.DRAFT;
            return (
              <tr key={doc.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{doc.documentType}</div>
                  <div className="text-xs text-gray-400 font-mono">{doc.id.slice(0, 8)}…</div>
                </td>
                <td className="px-4 py-3">{fmtMoney(doc.amountCents, doc.currency)}</td>
                <td className="px-4 py-3 text-gray-700">
                  {doc.issuerName || '—'}
                  {doc.issuerDocument ? (
                    <div className="text-xs text-gray-400">{doc.issuerDocument}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}>
                    {meta.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(doc.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {doc.status === 'DRAFT' && (
                      <button
                        type="button"
                        className="text-xs text-teal-700 hover:underline"
                        onClick={() => issue.mutate(doc.id)}
                      >
                        Emitir stub
                      </button>
                    )}
                    {doc.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => cancel.mutate(doc.id)}
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs text-blue-700 hover:underline"
                      onClick={() => downloadPdf(doc.id)}
                    >
                      PDF
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fiscal</h1>
        <p className="text-sm text-gray-500 mt-1">
          Documentos stub (não fiscais). Sem transmissão SEFAZ.
        </p>
      </div>

      <div className="flex gap-2 items-center">
        <label htmlFor="fiscal-status-filter" className="text-sm text-gray-600">Status</label>
        <select
          id="fiscal-status-filter"
          className="border rounded-lg px-3 py-1.5 text-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="DRAFT">Rascunho</option>
          <option value="ISSUED_STUB">Emitido stub</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {body}
      </div>
    </div>
  );
}
