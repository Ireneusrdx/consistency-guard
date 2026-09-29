import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static-hosting demo build: classic <script> (no type="module"), single file.
// Used for the shareable hosted demo. The main app build is untouched.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-static',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
