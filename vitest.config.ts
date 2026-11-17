import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Tests never call the paid API: they use mocks and recorded answers (CLAUDE.md, section 8).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@core": here("./core") } },
  test: {
    include: ["core/**/*.test.ts", "ui/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,mjs}"],
    environment: "node",
    restoreMocks: true,
    // The PDF and figure tests take a second or two alone; with the whole suite in parallel on a laptop they can pass
    // 5 s. A budget for time only: no check changes.
    testTimeout: 20_000,
  },
});
