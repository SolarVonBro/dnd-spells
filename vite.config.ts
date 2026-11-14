import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Static site (GitHub Pages): relative base so it works under /<repo>/.
// The data is an encrypted file (src/data/spells.bin) imported with ?url.
export default defineConfig({
  base: './',
  plugins: [preact()],
  // pdfmake (~800 KB) is a separate chunk, loaded only when a spell list is exported to PDF.
  build: { target: 'es2020', outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 1000 },
});
