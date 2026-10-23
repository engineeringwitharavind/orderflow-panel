import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    // `vite build --mode profile`: production React, but with <Profiler> timings kept.
    alias: mode === 'profile' ? [{ find: /^react-dom\/client$/, replacement: 'react-dom/profiling' }] : [],
  },
  // Readable function names in CPU profiles of the profiling build.
  build: mode === 'profile' ? { minify: false } : {},
  test: {
    environment: 'jsdom',
  },
}));
