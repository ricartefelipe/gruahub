'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

function publicApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').trim();
  if (configured === '/api/gh' || configured.startsWith('/api/gh/')) {
    return '/api/gh';
  }
  if (configured.startsWith('/')) {
    return configured.replace(/\/$/, '');
  }
  return `${configured.replace(/\/$/, '')}/api/v1`;
}

interface PublicMachine {
  machineId: string;
  name: string | null;
  assetNumber: string;
  qrCode: string | null;
  playPriceCents: number;
  currency: string;
  status: string;
  playerPath?: string;
  sandboxEnabled?: boolean;
}

interface InitiateResult {
  paymentId: string;
  providerTransactionId: string;
  provider: string;
  amountCents: number;
  currency: string;
  status: string;
  qrCodeBase64: string | null;
  copyPaste: string | null;
  ticketUrl: string | null;
}

function fmtMoney(cents: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}

async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${publicApiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = `Erro ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || body.title || body.error || detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export default function PlayerPlayPage() {
  const params = useParams<{ token: string }>();
  const token = useMemo(() => decodeURIComponent(params.token || ''), [params.token]);

  const [machine, setMachine] = useState<PublicMachine | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initiating, setInitiating] = useState(false);
  const [payment, setPayment] = useState<InitiateResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    publicFetch<PublicMachine>(`/public/machines/${encodeURIComponent(token)}`)
      .then((data) => {
        if (!cancelled) setMachine(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message || 'Máquina não encontrada');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!payment?.paymentId || status === 'CONFIRMED' || status === 'FAILED') {
      return;
    }
    const id = window.setInterval(() => {
      publicFetch<{ status: string }>(`/public/payments/${payment.paymentId}/status`)
        .then((data) => setStatus(data.status))
        .catch(() => {});
    }, 2500);
    return () => window.clearInterval(id);
  }, [payment?.paymentId, status]);

  const startPayment = useCallback(async () => {
    if (!machine) return;
    setInitiating(true);
    setActionError(null);
    setCopied(false);
    try {
      const result = await publicFetch<InitiateResult>('/public/payments/initiate', {
        method: 'POST',
        body: JSON.stringify({ machineToken: token }),
      });
      setPayment(result);
      setStatus(result.status);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao iniciar pagamento');
    } finally {
      setInitiating(false);
    }
  }, [machine, token]);

  const copyPix = useCallback(async () => {
    if (!payment?.copyPaste) return;
    try {
      await navigator.clipboard.writeText(payment.copyPaste);
      setCopied(true);
    } catch {
      setActionError('Não foi possível copiar o código Pix');
    }
  }, [payment?.copyPaste]);

  const confirmSandbox = useCallback(async () => {
    if (!payment?.paymentId) return;
    setConfirming(true);
    setActionError(null);
    try {
      const result = await publicFetch<{ status: string }>(
        `/public/payments/${payment.paymentId}/sandbox-confirm`,
        { method: 'POST' }
      );
      setStatus(result.status || 'CONFIRMED');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao confirmar sandbox');
    } finally {
      setConfirming(false);
    }
  }, [payment?.paymentId]);

  const canSandboxConfirm =
    Boolean(machine?.sandboxEnabled) &&
    payment?.provider === 'SANDBOX' &&
    status !== 'CONFIRMED' &&
    status !== 'FAILED';

  const shellStyle = {
    background:
      'radial-gradient(1200px 500px at 10% -10%, rgba(13, 148, 136, 0.18), transparent 55%), linear-gradient(180deg, #f8faf9 0%, #e7efec 100%)',
  } as const;

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={shellStyle}>
        <p className="text-stone-600">Carregando máquina...</p>
      </main>
    );
  }

  if (loadError || !machine) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={shellStyle}>
        <div className="max-w-md text-center space-y-3">
          <p className="text-sm font-semibold tracking-wide text-teal-800">GruaHub</p>
          <h1 className="text-2xl font-semibold text-stone-900">Máquina indisponível</h1>
          <p className="text-stone-600">{loadError || 'Não encontramos esta máquina.'}</p>
        </div>
      </main>
    );
  }

  const confirmed = status === 'CONFIRMED';

  return (
    <main className="min-h-screen" style={shellStyle}>
      <div className="mx-auto max-w-md px-4 py-10 space-y-8">
        <header className="space-y-3">
          <p className="text-3xl font-black tracking-tight text-teal-900">GruaHub</p>
          <h1 className="text-xl font-medium text-stone-800">
            {machine.name || machine.assetNumber}
          </h1>
          <p className="text-sm text-stone-500">
            {machine.assetNumber}
            {machine.qrCode ? ` · ${machine.qrCode}` : ''}
          </p>
        </header>

        <section className="space-y-2">
          <p className="text-sm text-stone-600">Valor da jogada</p>
          <p className="text-4xl font-bold text-stone-900">
            {fmtMoney(machine.playPriceCents, machine.currency)}
          </p>
          <p className="text-sm text-stone-500 max-w-sm">
            Pague com Pix. Assim que confirmar, a máquina recebe o crédito.
          </p>
        </section>

        {!payment && (
          <button
            type="button"
            disabled={initiating}
            onClick={startPayment}
            className="w-full rounded-lg bg-teal-800 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60"
          >
            {initiating ? 'Gerando Pix...' : 'Pagar e jogar'}
          </button>
        )}

        {actionError && (
          <p className="text-sm text-red-700">{actionError}</p>
        )}

        {payment && (
          <section className="space-y-4 border-t border-teal-900/10 pt-6">
            {confirmed ? (
              <div className="space-y-2">
                <p className="text-2xl font-semibold text-teal-900">Pagamento confirmado</p>
                <p className="text-stone-600 text-sm">
                  Crédito enviado para a máquina. Boa sorte!
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm text-stone-500">Status</p>
                    <p className="font-semibold text-stone-900">{status || payment.status}</p>
                  </div>
                  <p className="text-xs text-stone-500">{payment.provider}</p>
                </div>

                {payment.qrCodeBase64 ? (
                  <img
                    src={`data:image/png;base64,${payment.qrCodeBase64}`}
                    alt="QR Code Pix"
                    className="mx-auto h-52 w-52 rounded-lg bg-white p-3 shadow-sm"
                  />
                ) : null}

                {payment.copyPaste && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-stone-500">Pix copia e cola</p>
                    <p className="break-all rounded-lg bg-white/80 p-3 text-xs text-stone-700 border border-stone-200">
                      {payment.copyPaste}
                    </p>
                    <button
                      type="button"
                      onClick={copyPix}
                      className="w-full rounded-lg border border-teal-900/20 px-3 py-2 text-sm text-teal-900"
                    >
                      {copied ? 'Copiado!' : 'Copiar código Pix'}
                    </button>
                  </div>
                )}

                {canSandboxConfirm && (
                  <button
                    type="button"
                    disabled={confirming}
                    onClick={confirmSandbox}
                    className="w-full rounded-lg bg-amber-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {confirming ? 'Confirmando...' : 'Simular confirmação (sandbox)'}
                  </button>
                )}

                <p className="text-center text-xs text-stone-500">
                  Aguardando confirmação do pagamento…
                </p>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
