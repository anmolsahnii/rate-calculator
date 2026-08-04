import fs from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("outputs/github-pages");
const htmlPath = path.join(outputDir, "index.html");
let html = await fs.readFile(htmlPath, "utf8");

const stylesheetMatch = html.match(
  /<link rel="stylesheet" crossorigin href="([^"]+)">/,
);
const scriptMatch = html.match(
  /<script type="module" crossorigin src="([^"]+)"><\/script>/,
);

if (!stylesheetMatch || !scriptMatch) {
  throw new Error("Expected Vite assets were not found");
}

const resolveAsset = (reference) =>
  path.join(outputDir, reference.replace(/^\.\//, ""));
const css = await fs.readFile(resolveAsset(stylesheetMatch[1]), "utf8");
const javascript = await fs.readFile(resolveAsset(scriptMatch[1]), "utf8");
const safeJavascript = javascript.replace(/<\/script/gi, "<\\/script");

html = html
  .replace(
    stylesheetMatch[0],
    () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
  )
  .replace(
    scriptMatch[0],
    () => `<script type="module">${safeJavascript}</script>`,
  );

await fs.writeFile(htmlPath, html, "utf8");
await fs.rm(path.join(outputDir, "assets"), { recursive: true, force: true });
