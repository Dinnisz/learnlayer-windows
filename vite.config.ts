import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The web interface lives in ui/. `dist/` is kept for the installer, so the bundle goes to dist-ui/.
export default defineConfig({
  root: here("./ui"),
  plugins: [react()],
  resolve: { alias: { "@core": here("./core") } },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**", "**/referencia-mac/**"] } },
  build: {
    outDir: here("./dist-ui"),
    emptyOutDir: true,
    target: "chrome120",
    rollupOptions: {
      input: {
        main: here("./ui/index.html"),
      },
    },
  },
});
