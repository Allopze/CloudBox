import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';
import { setAccessToken, clearAccessToken, hasAccessToken } from '../lib/tokenManager';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingIn: boolean; // Separate flag for login process
  isRegistering: boolean; // Separate flag for register process
  // 2FA state
  requires2FA: boolean;
  temp2FAToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (token: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: (signal?: AbortSignal) => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  refreshUser: () => Promise<void>;
  resendVerification: () => Promise<void>;
  // 2FA actions
  verify2FA: (code: string) => Promise<void>;
  verify2FARecovery: (code: string) => Promise<void>;
  cancel2FA: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      isLoggingIn: false,
      isRegistering: false,
      // 2FA state
      requires2FA: false,
      temp2FAToken: null,

      login: async (email, password) => {
        set({ isLoggingIn: true });
        try {
          const response = await api.post('/auth/login', { email, password });
          const { user, accessToken, requires2FA, tempToken } = response.data;

          // Check if 2FA is required
          if (requires2FA && tempToken) {
            set({
              requires2FA: true,
              temp2FAToken: tempToken,
              isLoggingIn: false
            });
            return;
          }

          // SECURITY FIX P0-1: Store token in memory, not localStorage
          setAccessToken(accessToken);
          // Note: refreshToken is stored in httpOnly cookie by the server

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

          // SECURITY FIX P0-1: Store token in memory, not localStorage
          setAccessToken(accessToken);

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

          // SECURITY FIX P0-1: Store token in memory, not localStorage
          setAccessToken(accessToken);

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

        // SECURITY FIX P0-1: Clear token from memory
        clearAccessToken();

        set({ user: null, isAuthenticated: false });
      },

      checkAuth: async (signal?: AbortSignal) => {
        // SECURITY FIX P0-1: Token is stored in memory, not localStorage
        // On page refresh, memory is cleared, so we need to attempt a silent refresh
        // using the httpOnly refresh token cookie

        if (!hasAccessToken()) {
          // No token in memory - try to get a new one via refresh token (cookie)
          try {
            const refreshResponse = await api.post('/auth/refresh', {}, { signal });
            if (signal?.aborted) return;

            const { accessToken } = refreshResponse.data;
            setAccessToken(accessToken);

            // Now fetch user data with the new token
            const userResponse = await api.get('/users/me', { signal });
            if (signal?.aborted) return;
            set({ user: userResponse.data, isAuthenticated: true, isLoading: false });
            return;
          } catch {
            // Refresh failed - user needs to login again
            if (signal?.aborted) return;
            set({ isLoading: false, isAuthenticated: false, user: null });
            return;
          }
        }

        // Token exists in memory - validate it
        try {
          const response = await api.get('/users/me', { signal });
          if (signal?.aborted) return;
          set({ user: response.data, isAuthenticated: true, isLoading: false });
        } catch (error) {
          if (signal?.aborted) return;
          clearAccessToken();
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

      resendVerification: async () => {
        await api.post('/auth/resend-verification');
      },

      // 2FA verification with TOTP code
      verify2FA: async (code: string) => {
        const tempToken = get().temp2FAToken;
        if (!tempToken) throw new Error('No 2FA session');

        const response = await api.post('/2fa/verify', {
          tempToken,
          code
        });
        const { user, accessToken } = response.data;

        setAccessToken(accessToken);
        set({
          user,
          isAuthenticated: true,
          requires2FA: false,
          temp2FAToken: null,
          isLoading: false
        });
      },

      // 2FA verification with recovery code
      verify2FARecovery: async (code: string) => {
        const tempToken = get().temp2FAToken;
        if (!tempToken) throw new Error('No 2FA session');

        const response = await api.post('/2fa/recovery', {
          tempToken,
          recoveryCode: code
        });
        const { user, accessToken } = response.data;

        setAccessToken(accessToken);
        set({
          user,
          isAuthenticated: true,
          requires2FA: false,
          temp2FAToken: null,
          isLoading: false
        });
      },

      // Cancel 2FA verification and go back to login
      cancel2FA: () => {
        set({
          requires2FA: false,
          temp2FAToken: null
        });
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
