import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PUBLIC_PRECACHE = ['/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-64.png'];

// Emits dist/sw.js with the exact list of built files, so a new build always replaces the old cache.
function serviceWorker() {
  return {
    name: 'kids-cinema-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((file) => !file.endsWith('.map') && file !== 'sw.js')
        .map((file) => `/${file}`);
      const files = [...new Set([...PUBLIC_PRECACHE, ...built])].sort();
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(files))
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5174',
      '/health': 'http://localhost:5174'
    }
  }
});
