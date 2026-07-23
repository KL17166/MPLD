import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx, defineManifest } from '@crxjs/vite-plugin';

const manifest = defineManifest({
  manifest_version: 3,
  name: 'MPLD — Manipulador de Texto & Rede',
  version: '2.0.0',
  description: 'Manipulador de textos DOM em tempo real e interceptador de requisições de rede (XHR/Fetch/WebSocket & MITM Proxy)',
  permissions: [
    'activeTab',
    'storage',
    'scripting',
    'tabs',
    'proxy'
  ],
  host_permissions: [
    '<all_urls>'
  ],
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png'
    }
  },
  icons: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png'
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_start',
      all_frames: true
    }
  ],
  web_accessible_resources: [
    {
      resources: ['src/interceptor/index.ts'],
      matches: ['<all_urls>']
    }
  ]
});

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest })
  ],
  build: {
    emptyOutDir: true,
    outDir: 'dist',
    rollupOptions: {
      input: {
        panel: 'src/panel/index.html',
        interceptor: 'src/interceptor/index.ts'
      }
    }
  }
});
