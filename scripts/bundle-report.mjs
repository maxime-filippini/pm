import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

const root = resolve("dist/client");
const manifest = JSON.parse(readFileSync(resolve(root, ".vite/manifest.json"), "utf8"));
function report(entry) {
  const keys = new Set();
  function visit(key) {
    if (keys.has(key)) return;
    keys.add(key);
    for (const dependency of manifest[key].imports ?? []) visit(dependency);
  }
  visit(entry);
  const files = [...new Set([...keys].map((key) => manifest[key].file))].filter((file) => file.endsWith(".js"));
  let bytes = 0, gzipBytes = 0;
  for (const file of files) {
    const content = readFileSync(resolve(root, file));
    bytes += content.length; gzipBytes += gzipSync(content).length;
  }
  return { bytes, gzipBytes, files, routeModules: [...keys].filter((key) => key.startsWith("src/client/routes/")) };
}
const initial = report("index.html");
if (initial.routeModules.length) throw new Error("Route modules leaked into the initial static import graph");
const routes = Object.fromEntries(Object.keys(manifest).filter((key) => key.startsWith("src/client/routes/")).map((key) => [key, report(key)]));
console.log(JSON.stringify({ initial, routes }, null, 2));
