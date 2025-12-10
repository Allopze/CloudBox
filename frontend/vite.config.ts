import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Increase warning limit (default 500kb)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React ecosystem
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // State management and data fetching
          'vendor-state': ['zustand', '@tanstack/react-query'],
          // UI libraries
          'vendor-ui': ['framer-motion', 'lucide-react'],
          // i18n
          'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          // Utilities
          'vendor-utils': ['axios', 'date-fns', 'socket.io-client', 'clsx', 'tailwind-merge'],
          // PDF rendering (heavy)
          'vendor-pdf': ['pdfjs-dist', 'react-pdf'],
          // Document rendering (heavy)
          'vendor-docs': ['mammoth', 'xlsx', 'react-markdown', 'rehype-raw', 'remark-gfm'],
          // Dropzone
          'vendor-dropzone': ['react-dropzone'],
        },
      },
    },
  },
  server: {
    port: 5000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
