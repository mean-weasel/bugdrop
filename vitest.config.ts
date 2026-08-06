import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'scripts/**/*.{js,mjs,ts}'],
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      exclude: ['**/*.d.ts', 'node_modules/**', 'test/**', 'e2e/**', 'dist/**', '**/*.config.ts'],
    },
  },
});
