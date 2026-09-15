import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// canonical, og:url, og:image and the JSON-LD url in index.html come from VITE_SITE_URL. A build uses the
// production origin unless it is set (set it to an empty string for root-relative URLs on a tunnel or a
// staging host); the dev server leaves them root-relative. Without a value Vite would ship the literal
// %VITE_SITE_URL% placeholder.
export default defineConfig(({ command }) => {
  process.env.VITE_SITE_URL ??= command === 'build' ? 'https://etch.vibe-coding.fans' : '';
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 8765,
      strictPort: true,
      host: true,
      // Vite rejects requests whose Host header it does not recognise, which is
      // what otherwise turns a tunnelled dev server into a blank "Blocked
      // request" page. Development only: the production build is static files
      // and has no dev server to protect.
      allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.trycloudflare.com', 'localhost'],
    },
    preview: {
      port: 8765,
      strictPort: true,
      host: true,
      allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.trycloudflare.com', 'localhost'],
    },
    // The verification worker loads its decoder with a dynamic import, which
    // rules out Vite's default IIFE worker format because that cannot code-split.
    // Module workers are supported everywhere current; verifyClient.js falls back
    // to running on the main thread where they are not.
    worker: { format: 'es' },
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
  };
});
