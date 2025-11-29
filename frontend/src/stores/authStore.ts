import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (token: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: (signal?: AbortSignal) => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/auth/login', { email, password });
          const { user, accessToken, refreshToken } = response.data;
          
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
          
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      loginWithGoogle: async (token) => {
        const response = await api.post('/auth/google', { token });
        const { user, accessToken, refreshToken } = response.data;
        
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        
        set({ user, isAuthenticated: true });
      },

      register: async (name, email, password) => {
        const response = await api.post('/auth/register', { email, password, name });
        const { user, accessToken, refreshToken } = response.data;
        
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        
        set({ user, isAuthenticated: true });
      },

      logout: async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        try {
          await api.post('/auth/logout', { refreshToken });
        } catch {
          // Ignore errors
        }
        
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        
        set({ user: null, isAuthenticated: false });
      },

      checkAuth: async (signal?: AbortSignal) => {
        const token = localStorage.getItem('accessToken');
        
        if (!token) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        try {
          const response = await api.get('/users/me', { signal });
          if (signal?.aborted) return;
          set({ user: response.data, isAuthenticated: true, isLoading: false });
        } catch (error) {
          if (signal?.aborted) return;
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      updateUser: (userData) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...userData } });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
