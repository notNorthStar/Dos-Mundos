import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5190 },
  build: { target: 'es2022' },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
