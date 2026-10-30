import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Several suites are CPU heavy (200-seed layouts, 1000 s simulations). With all workers busy a normally
    // sub-second test can pass the 5 s default, so CI (which gates the Pages deploy on this run) flaked.
    // Tests that need more than this set their own timeout.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
