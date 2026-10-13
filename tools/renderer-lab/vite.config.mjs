import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  base: './',
  server: { fs: { allow: [repoRoot] } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
});
