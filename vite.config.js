import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 8765, strictPort: true, host: true },
  preview: { port: 8765, strictPort: true },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // pdf-lib, jszip and jsqr are only pulled in by lazy routes, so Rollup
        // already splits them. Naming the chunks makes it obvious in the build
        // output whether anything heavy leaked into the initial bundle.
        manualChunks(id) {
          if (id.includes('node_modules/pdf-lib')) return 'pdf';
          if (id.includes('node_modules/jszip')) return 'zip';
          if (id.includes('node_modules/jsqr')) return 'decode';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
