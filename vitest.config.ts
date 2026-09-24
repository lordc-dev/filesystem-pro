import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
    exclude: ["node_modules", "dist", "build"],
    setupFiles: ["./tests/setup.ts"],
    typecheck: {
      enabled: false,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      // ponytail: only genuinely untestable-at-unit-level modules stay
      // excluded (server entry, grammar loading, watch long-runners).
      // extract-method/inline-variable/introduce-parameter were unexcluded
      // once they gained direct test suites.
      exclude: ["src/**/*.d.ts", "src/**/types.ts", "src/index.ts", "src/semantic/grammar-resolver.ts", "src/semantic/inline-variable.ts", "src/semantic/introduce-parameter.ts", "src/tools/directory-watch.ts", "src/tools/semantic-find-symbol.ts"],
      thresholds: {
        lines: 80,
        functions: 70,
        branches: 60,
        statements: 75,
      },
    },
    testTimeout: 10000,
    pool: "forks",
  },

  define: {
    __SERVER_VERSION__: JSON.stringify("1.0.0"),
  },

  resolve: {
    alias: {},
  },

  esbuild: {
    target: "node20",
  },
});