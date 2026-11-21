// Puts a page saved by `scripts/render-page.mjs` into a made-up browser window, as Edge shows a PDF: a light toolbar,
// the page on a dark grey canvas, scrolled. Writes `<out>.bgra`, `<out>.txt` and `<out>.offset` ("dx dy": where the
// page's top-left is in the window, for `scripts/screen-labels.test.ts`), and a PNG to look at.
//   node scripts/browser-window.mjs <page> <scroll> <out> [width] [height]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("package.json"));
const { createCanvas, ImageData } = require("@napi-rs/canvas");

const [page, scrollText, out, widthText = "1600", heightText = "1000"] = process.argv.slice(2);
const [pageWidth, pageHeight] = fs.readFileSync(`${page}.txt`, "utf8").trim().split(/\s+/u).map(Number);
const source = fs.readFileSync(`${page}.bgra`);
const width = Number(widthText);
const height = Number(heightText);
const toolbar = 40;
const dx = Math.round((width - pageWidth) / 2);
const dy = toolbar + 12 - Number(scrollText);

const bgra = Buffer.alloc(width * height * 4);
const put = (x, y, [b, g, r]) => {
  const at = (y * width + x) * 4;
  bgra[at] = b;
  bgra[at + 1] = g;
  bgra[at + 2] = r;
  bgra[at + 3] = 255;
};
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (y < toolbar) put(x, y, y === toolbar - 1 ? [210, 210, 210] : [243, 243, 243]);
    else {
      const px = x - dx;
      const py = y - dy;
      if (px >= 0 && py >= 0 && px < pageWidth && py < pageHeight) {
        const from = (py * pageWidth + px) * 4;
        put(x, y, [source[from], source[from + 1], source[from + 2]]);
      } else put(x, y, [89, 86, 82]);
    }
  }
}
// The toolbar's own marks: a few dark boxes, as icons.
for (const left of [16, 52, 88, width - 120, width - 80, width - 40]) {
  for (let y = 12; y < 28; y += 1) for (let x = left; x < left + 16; x += 1) put(x, y, [60, 60, 60]);
}
fs.writeFileSync(`${out}.bgra`, bgra);
fs.writeFileSync(`${out}.txt`, `${width} ${height}`);
fs.writeFileSync(`${out}.offset`, `${dx} ${dy}`);
const canvas = createCanvas(width, height);
const rgba = new Uint8ClampedArray(bgra.length);
for (let at = 0; at < bgra.length; at += 4) {
  rgba[at] = bgra[at + 2];
  rgba[at + 1] = bgra[at + 1];
  rgba[at + 2] = bgra[at];
  rgba[at + 3] = 255;
}
canvas.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0);
fs.writeFileSync(`${out}.png`, canvas.toBuffer("image/png"));
