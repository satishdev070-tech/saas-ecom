import { defineConfig } from "vitest/config";

// Database tests: run against a disposable Postgres loaded by scripts/db/test-db.sh
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
