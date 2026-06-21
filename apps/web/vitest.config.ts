import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          include: ['src/lib/**/*.test.ts', 'auth.test.ts'],
        },
      },
      {
        plugins: [react(), tsconfigPaths()],
        test: {
          name: 'browser',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
          include: ['src/components/**/*.test.tsx'],
        },
      },
    ],
  },
});
