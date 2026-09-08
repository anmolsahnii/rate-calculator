import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  base: "./",
  plugins: [react()],
  build: { outDir: path.resolve(root, "../outputs/email-assistant-web"), emptyOutDir: true, rollupOptions: { output: { inlineDynamicImports: true } } },
});
