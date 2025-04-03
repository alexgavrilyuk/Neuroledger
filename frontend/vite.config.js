// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path'; // Keep resolve if needed for main entry

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        // iframeLibs: resolve(__dirname, 'src/iframe-libs.js'), // REMOVE THIS ENTRY
      },
      output: {
        // You can keep default hashed names for the main app bundles
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`,
        format: 'es',
        manualChunks: (id) => { // Keep chunking for main app
            if (id.includes('node_modules')) {
                return 'vendor';
            }
        },
      }
    }
  },
  server: {
    // Keep CORS header for dev, might be needed for other things
    headers: {
      'Access-Control-Allow-Origin': '*',
    }
  }
});