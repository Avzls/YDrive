'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
    storageQuotaBytes: number;
    storageUsedBytes: number;
  } | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: AuthState['user']) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken });
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
        }
      },
      setUser: (user) => set({ user }),
      logout: () => {
        set({ accessToken: null, refreshToken: null, user: null });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
      },
      isAuthenticated: () => !!get().accessToken,
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    }
  )
);

// Clipboard store for Ctrl+C / Ctrl+V
interface ClipboardState {
  clipboard: { fileIds: string[]; folderIds: string[] } | null;
  setClipboard: (data: { fileIds: string[]; folderIds: string[] } | null) => void;
  clearClipboard: () => void;
}

export const useClipboardStore = create<ClipboardState>()((set) => ({
  clipboard: null,
  setClipboard: (data) => set({ clipboard: data }),
  clearClipboard: () => set({ clipboard: null }),
}));
