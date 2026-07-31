'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';

type ReportType = 'VISIT_RECEIPT' | 'SETTLEMENT' | 'CASH_COLLECTION' | 'FLEET_STATUS';

const REPORT_TYPES: Array<{ type: ReportType; label: string; description: string; params: string[] }> = [
  {
    type: 'FLEET_STATUS',
    label: 'Status da Frota',
    description: 'Relatório geral de máquinas: status, uptime e alertas abertos.',
    params: [],
  },
  {
    type: 'CASH_COLLECTION',
    label: 'Sangrias do Período',
    description: 'Relatório de sangrias coletadas por ponto de operação.',
    params: ['startDate', 'endDate'],
  },
  {
    type: 'VISIT_RECEIPT',
    label: 'Comprovante de Visita',
    description: 'Comprovante PDF de uma visita de campo específica.',
    params: ['visitId'],
  },
  {
    type: 'SETTLEMENT',
    label: 'Liquidação Financeira',
    description: 'Relatório de liquidação de comissões por parceiro.',
    params: ['settlementId'],
  },
];

export default function ReportsPage() {
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: async () => {
      const body = { reportType: selectedType, parameters: params };
      const res = await api.post('/reports/generate', body, { responseType: 'blob' });
      return res.data as Blob;
    },
    onSuccess: (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      // Auto-trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `gruahub-${selectedType?.toLowerCase()}-${Date.now()}.pdf`;
      a.click();
    },
  });

  const selectedDef = REPORT_TYPES.find(r => r.type === selectedType);

  function handleParamChange(key: string, value: string) {
    setParams(p => ({ ...p, [key]: value }));
  }

  function paramLabel(key: string) {
    const labels: Record<string, string> = {
      startDate: 'Data inicial',
      endDate: 'Data final',
      visitId: 'ID da visita',
      settlementId: 'ID da liquidação',
    };
    return labels[key] || key;
  }

  function paramType(key: string): string {
    return key.includes('Date') ? 'date' : 'text';
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" description="Gere documentos operacionais em PDF." />

      {/* Report type cards */}
      <div className="grid grid-cols-2 gap-4">
        {REPORT_TYPES.map(r => (
          <button
            key={r.type}
            onClick={() => {
              setSelectedType(r.type);
              setParams({});
              setDownloadUrl(null);
            }}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              selectedType === r.type
                ? 'border-brand bg-brand/10'
                : 'border-[color:var(--line)] bg-[color:var(--surface)] hover:border-brand/50 hover:bg-brand/10/30'
            }`}
            aria-pressed={selectedType === r.type}
            aria-label={`Selecionar relatório: ${r.label}`}
          >
            <div className="font-semibold text-[color:var(--text)]">{r.label}</div>
            <div className="text-sm text-[color:var(--text-muted)] mt-1">{r.description}</div>
          </button>
        ))}
      </div>

      {/* Parameters form */}
      {selectedDef && (
        <div className="bg-[color:var(--surface)] border border-[color:var(--line)] rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-[color:var(--text)]">{selectedDef.label}</h2>

          {selectedDef.params.length > 0 ? (
            <div className="space-y-3">
              {selectedDef.params.map(paramKey => (
                <div key={paramKey}>
                  <label
                    className="block text-sm font-medium text-[color:var(--text-muted)] mb-1"
                    htmlFor={`param-${paramKey}`}
                  >
                    {paramLabel(paramKey)}
                  </label>
                  <input
                    id={`param-${paramKey}`}
                    type={paramType(paramKey)}
                    value={params[paramKey] || ''}
                    onChange={e => handleParamChange(paramKey, e.target.value)}
                    className="w-full border border-[color:var(--line)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    aria-label={paramLabel(paramKey)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[color:var(--text-muted)]">Este relatório não requer parâmetros adicionais.</p>
          )}

          {generate.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700"
                 role="alert">
              Erro ao gerar relatório. Verifique se o backend está rodando e tente novamente.
            </div>
          )}

          {downloadUrl && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700"
                 role="status">
              Relatório gerado.{' '}
              <a
                href={downloadUrl}
                download
                className="underline font-medium"
                aria-label="Baixar relatório PDF novamente"
              >
                Baixar novamente
              </a>
            </div>
          )}

          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="w-full bg-brand text-white rounded-lg py-2.5 font-medium hover:bg-[color:var(--brand-strong)] disabled:opacity-50 transition-colors"
            aria-label={`Gerar relatório ${selectedDef.label}`}
          >
            {generate.isPending ? 'Gerando PDF...' : 'Gerar relatório PDF'}
          </button>
        </div>
      )}

      {!selectedType && (
        <div className="bg-[color:var(--surface-muted)] border border-[color:var(--line)] rounded-xl p-6 text-center">
          <p className="text-[color:var(--text-muted)]">Selecione um tipo de relatório acima para configurar e gerar.</p>
        </div>
      )}
    </div>
  );
}
