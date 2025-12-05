import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingIn: boolean; // Separate flag for login process
  isRegistering: boolean; // Separate flag for register process
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (token: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: (signal?: AbortSignal) => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      isLoggingIn: false,
      isRegistering: false,

      login: async (email, password) => {
        set({ isLoggingIn: true });
        try {
          const response = await api.post('/auth/login', { email, password });
          const { user, accessToken } = response.data;
          
          localStorage.setItem('accessToken', accessToken);
          // Note: refreshToken is now stored in httpOnly cookie by the server
          
          set({ user, isAuthenticated: true, isLoading: false, isLoggingIn: false });
        } catch (error) {
          set({ isLoggingIn: false });
          throw error;
        }
      },

      loginWithGoogle: async (token) => {
        set({ isLoggingIn: true });
        try {
          const response = await api.post('/auth/google', { token });
          const { user, accessToken } = response.data;
          
          localStorage.setItem('accessToken', accessToken);
          // Note: refreshToken is now stored in httpOnly cookie by the server
          
          set({ user, isAuthenticated: true, isLoggingIn: false });
        } catch (error) {
          set({ isLoggingIn: false });
          throw error;
        }
      },

      register: async (name, email, password) => {
        set({ isRegistering: true });
        try {
          const response = await api.post('/auth/register', { email, password, name });
          const { user, accessToken } = response.data;
          
          localStorage.setItem('accessToken', accessToken);
          // Note: refreshToken is now stored in httpOnly cookie by the server
          
          set({ user, isAuthenticated: true, isRegistering: false });
        } catch (error) {
          set({ isRegistering: false });
          throw error;
        }
      },

      logout: async () => {
        // Security: Refresh token is sent via httpOnly cookie automatically
        try {
          await api.post('/auth/logout', {});
        } catch {
          // Ignore errors
        }
        
        localStorage.removeItem('accessToken');
        // Note: refreshToken cookie is cleared by the server
        
        set({ user: null, isAuthenticated: false });
      },

      checkAuth: async (signal?: AbortSignal) => {
        const token = localStorage.getItem('accessToken');
        
        if (!token) {
          set({ isLoading: false, isAuthenticated: false, user: null });
          return;
        }

        try {
          const response = await api.get('/users/me', { signal });
          if (signal?.aborted) return;
          set({ user: response.data, isAuthenticated: true, isLoading: false });
        } catch (error) {
          if (signal?.aborted) return;
          localStorage.removeItem('accessToken');
          // Note: refreshToken cookie is cleared by the server on logout
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      updateUser: (userData) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...userData } });
        }
      },

      refreshUser: async () => {
        try {
          const response = await api.get('/users/me');
          set({ user: response.data });
        } catch {
          // Silently fail - user data will be stale but app continues working
        }
      },
    }),
    {
      name: 'auth-storage',
      // Only persist user data, NOT authentication state
      // Authentication is always verified via checkAuth on app load
      partialize: (state) => ({ user: state.user }),
      // On rehydrate, don't trust persisted isAuthenticated
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Reset auth state - will be verified by checkAuth
          state.isAuthenticated = false;
          state.isLoading = true;
        }
      },
    }
  )
);
