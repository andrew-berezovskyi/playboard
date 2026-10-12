import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'apps/web',
  plugins: [react()],
  // Prebundle icon and primitive barrels to avoid thousands of module requests
  // in local browsers; production still tree-shakes the individual icon imports.
  optimizeDeps: {
    include: ['lucide-react', '@radix-ui/react-select', '@radix-ui/react-dropdown-menu'],
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false },
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true, changeOrigin: false },
    },
  },
  build: { outDir: '../../dist/web', emptyOutDir: true },
});
