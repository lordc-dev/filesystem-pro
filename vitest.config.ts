import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Enable globals for describe, it, expect without imports
    globals: true,

    // Use Node environment for MCP server testing
    environment: "node",

    // Include patterns for test files
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],

    // Exclude patterns
    exclude: ["node_modules", "dist", "build"],

    // Setup files to run before tests
    setupFiles: ["./tests/setup.ts"],

    // TypeScript configuration
    typecheck: {
      enabled: false, // Disable type checking during tests for speed
    },

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/types.ts"],
      thresholds: {
        lines: 60,
        functions: 55,
        branches: 50,
        statements: 60,
      },
    },

    // Timeout for tests (useful for async operations)
    testTimeout: 10000,

    // Pool configuration for parallel tests
    pool: "forks",
  },

  // Resolve configuration for TypeScript paths
  resolve: {
    alias: {
      // Allow tests to import from src directly
    },
  },

  // ESBuild configuration for TypeScript
  esbuild: {
    target: "node20",
  },
});
