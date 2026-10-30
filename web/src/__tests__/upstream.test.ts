import { describe, expect, it } from '@jest/globals';
import { upstreamBase } from '../app/api/gh/[...path]/upstream';

describe('upstreamBase', () => {
  it('usa a origem interna quando definida, sem barra final', () => {
    expect(upstreamBase({ API_INTERNAL_URL: 'http://backend:8080/', NODE_ENV: 'production' })).toBe('http://backend:8080');
  });

  it('falha fechada em produção sem API_INTERNAL_URL', () => {
    expect(() => upstreamBase({ NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'http://api.exemplo' })).toThrow(
      /API_INTERNAL_URL/,
    );
  });

  it('em desenvolvimento aceita a URL pública absoluta e ignora caminho relativo', () => {
    expect(upstreamBase({ NODE_ENV: 'development', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:9090/' })).toBe('http://127.0.0.1:9090');
    expect(upstreamBase({ NODE_ENV: 'development', NEXT_PUBLIC_API_URL: '/api/gh' })).toBe('http://localhost:8080');
  });

  it('em desenvolvimento sem variáveis cai no backend local', () => {
    expect(upstreamBase({ NODE_ENV: 'test' })).toBe('http://localhost:8080');
  });
});
