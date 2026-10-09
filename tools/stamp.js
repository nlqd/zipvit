// Content-hash version tags on everything the page loads: style.css, app.js, the lib/ modules
// (through an import map) and the data files app.js fetches. GitHub Pages lets browsers cache
// files for 10 minutes; with the tags a deploy switches a visitor over all at once instead of
// mixing cached old files with new ones. Run after changing any of them: node tools/stamp.js
// Vendored libraries never change in place: their folder name (vendor/leaflet-1.9.4/) is the key.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "(?:\\?v=[0-9a-f]{10})?";

const tag = (content) => createHash("sha256").update(content).digest("hex").slice(0, 10);

export const modules = () => fs.readdirSync(path.join(ROOT, "lib")).filter((f) => f.endsWith(".js")).sort();

// read(file) returns a file's text; the result maps each rewritten file to its new text.
export function stamped(read, libFiles) {
  const app = read("app.js").replace(
    new RegExp(`fetch\\("(data/[\\w.-]+\\.json)${TAG}"\\)`, "g"),
    (_, url) => `fetch("${url}?v=${tag(read(url))}")`,
  );
  const imports = Object.fromEntries(libFiles.map((f) => [`./lib/${f}`, `./lib/${f}?v=${tag(read(`lib/${f}`))}`]));
  const importMap = `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n</script>`;
  const entry = `<script type="module" src="app.js?v=${tag(app)}"></script>`;
  const index = read("index.html")
    .replace(new RegExp(`href="style\\.css${TAG}"`), `href="style.css?v=${tag(read("style.css"))}"`)
    .replace(/<script type="importmap">[\s\S]*?<\/script>\n\s*/, "")
    .replace(new RegExp(`<script type="module" src="app\\.js${TAG}"></script>`), `${importMap}\n  ${entry}`);
  return { "app.js": app, "index.html": index };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const [file, content] of Object.entries(stamped(read, modules()))) {
    fs.writeFileSync(path.join(ROOT, file), content);
    console.log(`stamped ${file}`);
  }
}
