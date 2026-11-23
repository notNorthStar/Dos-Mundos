import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vitest/config';
import { pluginRelevo } from './tools/relevo';

// `npm run red` (modo "red") sirve por HTTPS con un certificado propio: Chrome solo da la cámara
// y el micrófono a páginas seguras, y la PC de Vista entra por la IP de la PC de Oído.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [pluginRelevo(), ...(mode === 'red' ? [basicSsl()] : [])],
  server: { port: 5190 },
  preview: { port: 5190 },
  build: { target: 'es2022' },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
}));
