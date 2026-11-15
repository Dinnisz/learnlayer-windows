// `overlay.html?demo=anywhere` in a browser: a made-up Alt-click on a made-up exam window, drawn here, with the lines
// an OCR would read. It runs the whole reading (region, crop, stage) without the native side and without any cost.

import type { NativeClickRead } from "../../native";
import type { WindowPicture } from "../../ai/pictures";

const questions = [
  [
    "I.1) Um carro parte do repouso e atinge 20 m/s em 5 s.",
    "Qual é a sua aceleração média?",
    "A. 2 m/s²",
    "B. 4 m/s²",
    "C. 5 m/s²",
    "D. 100 m/s²",
  ],
  [
    "I.2) Considere o circuito da figura, com R1 = 2 kΩ e R2 = 3 kΩ.",
    "Qual é a resistência equivalente entre a e b?",
    "A. 1,2 kΩ",
    "B. 5 kΩ",
    "C. 6 kΩ",
    "D. Nenhuma das respostas",
  ],
  [
    "I.3) Uma bola é lançada na vertical com 12 m/s.",
    "Que altura máxima atinge? (g = 10 m/s²)",
    "A. 6,0 m",
    "B. 7,2 m",
    "C. 12 m",
    "D. 14,4 m",
  ],
];

export async function demoClick(): Promise<{ read: NativeClickRead; picture: WindowPicture }> {
  const scale = window.devicePixelRatio || 1;
  const width = 1000;
  const height = 720;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d")!;
  context.scale(scale, scale);
  context.fillStyle = "#3a3a3a";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#fff";
  context.fillRect(200, 0, 600, height);
  context.fillStyle = "#111";
  context.textBaseline = "top";
  const lines: NativeClickRead["lines"] = [];
  const write = (text: string, x: number, y: number, bold: boolean) => {
    context.font = `${bold ? "600 " : ""}15px "Segoe UI", sans-serif`;
    context.fillText(text, x, y);
    const measured = context.measureText(text).width;
    lines.push({ text, rect: { x: x * scale, y: (y - 1) * scale, width: measured * scale, height: 18 * scale } });
  };
  questions.forEach((question, index) => {
    const top = 40 + index * 220;
    write(question[0]!, 230, top, true);
    write(question[1]!, 230, top + 22, true);
    question.slice(2).forEach((option, row) => write(option, 240, top + 52 + row * 24, false));
  });
  // The circuit of question 2: a box with a resistor zig-zag, right of its options.
  context.strokeStyle = "#111";
  context.lineWidth = 2;
  context.strokeRect(520, 300, 180, 100);
  context.beginPath();
  context.moveTo(550, 350);
  for (let step = 0; step < 6; step += 1) context.lineTo(550 + (step + 1) * 14, 350 + (step % 2 === 0 ? -14 : 14));
  context.stroke();
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const bgra = new Uint8Array(rgba.length);
  for (let at = 0; at < rgba.length; at += 4) {
    bgra[at] = rgba[at + 2]!;
    bgra[at + 1] = rgba[at + 1]!;
    bgra[at + 2] = rgba[at]!;
    bgra[at + 3] = 255;
  }
  const frame = { x: 0, y: 0, width: width * scale, height: height * scale };
  return {
    read: {
      id: 1,
      point: { x: 300 * scale, y: 330 * scale },
      monitor: { x: 0, y: 0, width: window.innerWidth * scale, height: window.innerHeight * scale },
      scale,
      appName: "Demo",
      refused: null,
      found: null,
      selection: null,
      window: { ...frame, pixelWidth: canvas.width, pixelHeight: canvas.height },
      lines,
      pdfPath: null,
    },
    picture: { width: canvas.width, height: canvas.height, bgra },
  };
}
