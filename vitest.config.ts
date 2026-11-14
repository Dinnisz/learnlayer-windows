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
  },
});
