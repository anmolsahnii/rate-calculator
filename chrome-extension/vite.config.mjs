import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  publicDir: path.resolve(root, "public"),
  build: {
    outDir: path.resolve(root, "../outputs/rate-calculator-chrome"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(root, "popup.html"),
        content: path.resolve(root, "src/content.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
