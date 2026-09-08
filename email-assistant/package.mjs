import fs from "node:fs/promises";
import path from "node:path";

const output = path.resolve("outputs/email-assistant-web");
let html = await fs.readFile(path.join(output, "index.html"), "utf8");
for (const match of [...html.matchAll(/<link rel="stylesheet" crossorigin href="([^"]+)">|<script type="module" crossorigin src="([^"]+)"><\/script>/g)]) {
  const css = Boolean(match[1]);
  const content = await fs.readFile(path.join(output, match[1] || match[2]), "utf8");
  html = html.replace(match[0], () => css ? `<style>${content.replace(/<\/style/gi, "<\\/style")}</style>` : `<script type="module">${content.replace(/<\/script/gi, "<\\/script")}</script>`);
}
await fs.writeFile("email-assistant.html", html);
// Include the same panel when Pages is published through the Next.js export workflow.
try {
  await fs.access("out/index.html");
  await fs.writeFile("out/email-assistant.html", html);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await fs.mkdir("outputs/email-quote-assistant", { recursive: true });
for (const file of ["manifest.json", "background.js", "gmail.js", "panel.html", "panel.css", "panel.js", "INSTALL.md"]) {
  await fs.copyFile(path.join("email-assistant", file), path.join("outputs/email-quote-assistant", file));
}
console.log("Built email-assistant.html and outputs/email-quote-assistant");
