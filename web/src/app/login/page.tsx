'use client';

import { signIn, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.replace('/dashboard');
    }
  }, [session, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">GruaHub</h1>
          <p className="text-gray-500 mt-2">Plataforma de Gestão de Máquinas</p>
        </div>

        <button
          onClick={() => signIn('keycloak', { callbackUrl: '/dashboard' })}
          className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700
                     text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Entrar com Keycloak SSO"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Entrar com SSO
        </button>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-2">Credenciais de demonstração:</p>
          <div className="space-y-1">
            <p><strong>Admin:</strong> admin@gruahub.local</p>
            <p><strong>Operador:</strong> operador@diversao.demo</p>
            <p><strong>Parceiro:</strong> parceiro@shoppingbv.demo</p>
            <p className="mt-1 text-gray-500">Senha: gruahub@2025</p>
          </div>
        </div>
      </div>
    </div>
  );
}
