import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  tenantId: string | null;
  userEmail: string | null;
  userId: string | null;
  setAuth: (token: string, tenantId: string, userEmail: string, userId: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  tenantId: null,
  userEmail: null,
  userId: null,
  setAuth: (accessToken, tenantId, userEmail, userId) =>
    set({ accessToken, tenantId, userEmail, userId }),
  clearAuth: () => set({ accessToken: null, tenantId: null, userEmail: null, userId: null }),
}));
