// Replays an Alt-click saved by a development build (`anywhere-debug.json`) against a screenshot of the same window,
// to see why a click opened the region it did. Off unless REPLAY_DEBUG and REPLAY_SHOT name the two files:
//   REPLAY_DEBUG=…/anywhere-debug.json REPLAY_SHOT=…/window.png npx vitest run scripts/replay-click.test.ts
// The screenshot is of the whole monitor at its physical pixels; the window's frame (in points) is cut from it.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "vitest";
import { readClick } from "../core/anywhere/clickReading";
import { greyImage, type LocatorLine } from "../core/anywhere/questionRegion";
import { QuestionBand } from "../core/anywhere/questionBand";

const debugFile = process.env.REPLAY_DEBUG ?? "";
const shotFile = process.env.REPLAY_SHOT ?? "";

it.skipIf(!existsSync(debugFile) || !existsSync(shotFile))("replays a saved Alt-click", async () => {
  const require = createRequire(import.meta.url);
  const { createCanvas, loadImage } = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
  const debug = JSON.parse(readFileSync(debugFile, "utf8")) as {
    point: { x: number; y: number };
    scale: number;
    app: string;
    window: { frame: { x: number; y: number; width: number; height: number }; lines: LocatorLine[] };
  };
  const shot = await loadImage(readFileSync(shotFile));
  const { frame } = debug.window;
  const scale = debug.scale;
  const width = Math.round(frame.width * scale);
  const height = Math.round(frame.height * scale);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(shot, frame.x * scale, frame.y * scale, width, height, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  // BGRA, as the native picture comes.
  const bgra = new Uint8Array(rgba.length);
  for (let index = 0; index < rgba.length; index += 4) {
    bgra[index] = rgba[index + 2]!;
    bgra[index + 1] = rgba[index + 1]!;
    bgra[index + 2] = rgba[index]!;
    bgra[index + 3] = 255;
  }
  const outcome = readClick({
    point: debug.point,
    appName: debug.app,
    found: null,
    window: { frame, image: greyImage(bgra, width, height, frame.width, frame.height), lines: debug.window.lines },
    pdf: null,
  });
  if (outcome.kind !== "screen") {
    writeFileSync(`${debugFile}.replay.json`, JSON.stringify({ kind: outcome.kind }));
    return;
  }
  writeFileSync(
    `${debugFile}.replay.json`,
    JSON.stringify(
      {
        band: QuestionBand.select(debug.window.lines, {
          x: debug.point.x - debug.window.frame.x,
          y: debug.point.y - debug.window.frame.y,
        }),
        labels: debug.window.lines.map((line) => QuestionBand.label(line.text)).filter(Boolean),
        region: outcome.region?.frame,
        text: outcome.found.text.slice(0, 200),
      },
      null,
      2,
    ),
  );
});
