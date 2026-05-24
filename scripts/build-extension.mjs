import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "extension", "src");
const dist = path.join(root, "extension", "dist");

await rm(dist, { force: true, recursive: true });
await mkdir(dist, { recursive: true });

await Promise.all([
  cp(path.join(src, "manifest.json"), path.join(dist, "manifest.json")),
  cp(path.join(src, "popup.html"), path.join(dist, "popup.html")),
  cp(path.join(src, "options.html"), path.join(dist, "options.html")),
  cp(path.join(src, "icon.svg"), path.join(dist, "icon.svg")),
]);

await build({
  entryPoints: [
    path.join(src, "background.ts"),
    path.join(src, "content-script.ts"),
    path.join(src, "popup.tsx"),
    path.join(src, "options.tsx"),
  ],
  bundle: true,
  outdir: dist,
  entryNames: "[name]",
  format: "iife",
  platform: "browser",
  target: ["chrome116"],
  jsx: "automatic",
  sourcemap: true,
});

console.log(`Extension built at ${dist}`);
