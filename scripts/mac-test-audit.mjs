// Lists the Mac's test files (referencia-mac/LearnLayerTests) whose name the port never mentions, most tests first:
// the ones still to port, or to mark as not applying. Run with: node scripts/mac-test-audit.mjs
import fs from "fs";
import path from "path";
const root = process.cwd();
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
};
const sources = [...walk(path.join(root, "core")), ...walk(path.join(root, "ui")), ...walk(path.join(root, "scripts"))]
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
const tests = fs
  .readdirSync(path.join(root, "referencia-mac/LearnLayerTests"))
  .filter((name) => name.endsWith(".swift"));
const missing = [];
for (const name of tests) {
  const base = name.replace(/\.swift$/, "");
  if (sources.includes(base)) continue;
  const lines = fs.readFileSync(path.join(root, "referencia-mac/LearnLayerTests", name), "utf8").split("\n").length;
  const count = (fs.readFileSync(path.join(root, "referencia-mac/LearnLayerTests", name), "utf8").match(/@Test/g) ?? [])
    .length;
  missing.push([count, lines, base]);
}
missing.sort((a, b) => b[0] - a[0]);
console.log(tests.length, "test files;", missing.length, "never named in the port");
for (const [count, lines, base] of missing.slice(0, 45))
  console.log(String(count).padStart(4), String(lines).padStart(5), base);
