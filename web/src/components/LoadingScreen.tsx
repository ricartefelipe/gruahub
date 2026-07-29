import { BrandMark } from '@/components/BrandMark';

export function LoadingScreen({ label = 'Carregando sessão…' }: { label?: string }) {
  return (
    <div className="min-h-screen gh-atmosphere-ink relative overflow-hidden flex items-center justify-center px-6">
      <div className="absolute inset-0 gh-grid opacity-60" aria-hidden="true" />
      <div className="absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-cyan-400/20 blur-3xl gh-glow" aria-hidden="true" />
      <div className="relative gh-fade-up text-center">
        <BrandMark size="md" light className="justify-center" />
        <p className="mt-6 text-sm text-slate-300">{label}</p>
        <div className="mx-auto mt-4 h-1 w-28 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 rounded-full bg-cyan-300/90 animate-[gh-fade-up_1.2s_ease-in-out_infinite_alternate]" />
        </div>
      </div>
    </div>
  );
}
