import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@seafood-pos/utils": fileURLToPath(new URL("../../packages/utils/src/index.ts", import.meta.url)),
    },
  },
  clearScreen: false,
  define: {
    __POS_API_BASE_URL__: JSON.stringify(mode === "development" ? "http://localhost:3000" : "https://api.pos.lan"),
    __POS_PRODUCTION__: JSON.stringify(mode === "production"),
  },
  server: { port: 1420, strictPort: true },
  build: { outDir: "dist", target: "es2020" },
}));
