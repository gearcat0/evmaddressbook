import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    testTimeout: 15000,
    // Run test files one at a time. Forking a worker per file can exhaust
    // memory on a busy machine (V8 aborts with "Zone Allocation failed"), and
    // the whole suite takes ~3s sequentially, so the parallelism buys little.
    // Forks rather than threads because several tests set process.env per-file.
    pool: 'forks',
    fileParallelism: false
  }
})
