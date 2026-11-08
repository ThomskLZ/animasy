import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Um único index.html com tudo dentro: abre com dois cliques (file://), sem servidor.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000 },
  test: { environment: 'node' },
});
