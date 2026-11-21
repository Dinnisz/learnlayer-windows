// Saves one page of a PDF as raw BGRA (`<out>.bgra`, `<out>.txt` with "width height") and a PNG to look at, for the
// Rust OCR measurement `ocr_on_a_saved_page` (src-tauri/src/platform/windows/anywhere/ocr.rs). Uses pdf.js and the
// canvas it ships with; nothing is sent anywhere.
//   node scripts/render-page.mjs <pdf> <page> <scale> <out>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("package.json"));
const { pathToFileURL } = await import("node:url");
const pdfjs = await import(pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
const { createCanvas } = require("@napi-rs/canvas");

const [file, pageNumber, scaleText, out] = process.argv.slice(2);
const data = new Uint8Array(fs.readFileSync(file));
const document = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
const page = await document.getPage(Number(pageNumber));
const viewport = page.getViewport({ scale: Number(scaleText) });
const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const context = canvas.getContext("2d");
context.fillStyle = "#fff";
context.fillRect(0, 0, canvas.width, canvas.height);
await page.render({ canvasContext: context, viewport, canvas }).promise;
const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
const bgra = Buffer.alloc(rgba.length);
for (let at = 0; at < rgba.length; at += 4) {
  bgra[at] = rgba[at + 2];
  bgra[at + 1] = rgba[at + 1];
  bgra[at + 2] = rgba[at];
  bgra[at + 3] = 255;
}
fs.writeFileSync(out + ".bgra", bgra);
fs.writeFileSync(out + ".txt", `${canvas.width} ${canvas.height}`);
fs.writeFileSync(out + ".png", canvas.toBuffer("image/png"));
console.log(canvas.width, canvas.height);
