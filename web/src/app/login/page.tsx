'use client';

import { signIn, useSession } from 'next-auth/react';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandMark } from '@/components/BrandMark';
import { LoadingScreen } from '@/components/LoadingScreen';

function LoginErrorBanner() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  if (!error) return null;

  return (
    <div
      className="mb-5 rounded-xl border border-rose-300/60 bg-rose-50 px-4 py-3 text-sm text-rose-800"
      role="alert"
    >
      Não foi possível iniciar o login SSO ({error}). Tente novamente.
    </div>
  );
}

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (session) {
      router.replace('/dashboard');
    }
  }, [session, router]);

  if (status === 'loading') {
    return <LoadingScreen label="Preparando acesso…" />;
  }

  const handlePasswordLogin = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setFormError('');
    try {
      const result = await signIn('totalrecall', {
        email,
        password,
        redirect: false,
        callbackUrl: '/dashboard',
      });
      if (result?.error) {
        setFormError('Credenciais inválidas ou acesso expirado.');
        return;
      }
      router.replace('/dashboard');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden gh-atmosphere-ink text-white">
      <div className="absolute inset-0 gh-grid opacity-70" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-cyan-400/25 blur-3xl gh-glow"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 translate-x-1/4 translate-y-1/4 rounded-full bg-emerald-400/15 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-between px-6 py-8 md:px-10 lg:px-14">
        <header className="gh-fade-up flex items-center justify-between gap-4">
          <BrandMark size="sm" light />
          <p className="hidden text-xs font-medium uppercase tracking-[0.2em] text-slate-400 sm:block">
            Operação de frota · IoT
          </p>
        </header>

        <main className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="gh-fade-up max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/90">
              B2B arcade fleet
            </p>
            <h1 className="font-display mt-4 text-5xl font-bold leading-[0.95] tracking-tight text-white md:text-6xl lg:text-7xl">
              GruaHub
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-slate-300 md:text-lg">
              Telemetria, pagamentos e visitas de campo numa única operação — pronta para demo e
              escala piloto.
            </p>
            <ul className="mt-8 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <li className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">MQTT live</li>
              <li className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Multi-tenant</li>
              <li className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Sandbox Pix</li>
            </ul>
          </section>

          <section className="gh-fade-up relative">
            <div className="absolute -inset-px rounded-[1.75rem] bg-gradient-to-br from-cyan-400/40 via-transparent to-emerald-400/30 opacity-80 blur-[1px]" aria-hidden="true" />
            <div className="relative rounded-[1.7rem] border border-white/10 bg-[#0c1828]/90 p-7 shadow-soft backdrop-blur-md md:p-8">
              <p className="font-display text-xl font-semibold text-white">Entrar na operação</p>
              <p className="mt-2 text-sm text-slate-400">
                Use o e-mail e a senha do perfil TotalRecall, ou o SSO Keycloak da demo.
              </p>

              <Suspense fallback={null}>
                <div className="mt-5">
                  <LoginErrorBanner />
                </div>
              </Suspense>

              <form onSubmit={handlePasswordLogin} className="mt-4 space-y-3">
                <label className="block text-sm text-slate-300">
                  E-mail
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-white outline-none ring-cyan-400/40 focus:ring"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Senha
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-white outline-none ring-cyan-400/40 focus:ring"
                  />
                </label>
                {formError ? (
                  <p className="text-sm text-rose-300" role="alert">
                    {formError}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={pending}
                  className="gh-btn-primary w-full py-3.5 text-base"
                >
                  {pending ? 'Validando…' : 'Entrar com TotalRecall'}
                </button>
              </form>

              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setPending(true);
                  void signIn('keycloak', { callbackUrl: '/dashboard' }).finally(() => {
                    setPending(false);
                  });
                }}
                className="mt-3 w-full rounded-xl border border-white/15 bg-transparent py-3 text-sm font-medium text-slate-200 hover:bg-white/5"
                aria-label="Entrar com Keycloak SSO"
              >
                {pending ? 'Redirecionando…' : 'Entrar com SSO'}
              </button>
            </div>
          </section>
        </main>

        <footer className="gh-fade-up flex items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-slate-500">
          <span>Frota · pagamentos · campo</span>
          <span className="tabular-nums">v1 portfolio</span>
        </footer>
      </div>
    </div>
  );
}
