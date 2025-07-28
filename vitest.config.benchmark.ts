import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/benchmarks/**/*.bench.ts'],
    benchmark: {
      // Benchmark specific options
      include: ['tests/benchmarks/**/*.bench.ts'],
      reporters: process.env.CI 
        ? ['default', ['./scripts/vitest-benchmark-json-reporter.js', {}]] 
        : ['default'],
      outputFile: './benchmark-results.json',
    },
    setupFiles: [],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Increase timeout for benchmarks
    testTimeout: 120000,
    hookTimeout: 120000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});