// Pictures for the model and the stage, drawn in the window with a canvas: `PageImage.fitted` (a picture scaled down
// before it is sent) and the question's region cut from a picture of another app's window
// (`QuestionLocator.jpeg`), stacked as `stackedPicture` lays it out.

import { stackedPicture } from "@core/anywhere/questionRegion";
import type { Rect } from "@core/pdf/page";

function canvasOf(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function jpegBytes(canvas: OffscreenCanvas | HTMLCanvasElement, quality: number): Promise<Uint8Array | null> {
  const blob =
    canvas instanceof HTMLCanvasElement
      ? await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
      : await canvas.convertToBlob({ type: "image/jpeg", quality });
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

const context2d = (canvas: OffscreenCanvas | HTMLCanvasElement) =>
  canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

/** Pictures larger than `maxPixels` on their long side, scaled down to it as JPEG; any other (or anything that is not
 * a picture) goes as it is. */
export async function fittedJPEGs(
  images: readonly Uint8Array[],
  maxPixels: number,
  quality: number,
): Promise<Uint8Array[]> {
  return Promise.all(
    images.map(async (image) => {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(new Blob([image as BlobPart]));
      } catch {
        return image;
      }
      const longest = Math.max(bitmap.width, bitmap.height);
      if (longest <= maxPixels) {
        bitmap.close();
        return image;
      }
      const shrink = maxPixels / longest;
      const canvas = canvasOf(Math.round(bitmap.width * shrink), Math.round(bitmap.height * shrink));
      const context = context2d(canvas);
      if (!context) return image;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return (await jpegBytes(canvas, quality)) ?? image;
    }),
  );
}

/** A picture of a window as the native side takes it: 4 bytes a pixel, blue first (BGRA). */
export interface WindowPicture {
  width: number;
  height: number;
  bgra: Uint8Array;
}

/** The picture as a bitmap the canvas can draw. */
export async function bitmapOf(picture: WindowPicture): Promise<ImageBitmap> {
  const rgba = new Uint8ClampedArray(picture.bgra.length);
  for (let at = 0; at < rgba.length; at += 4) {
    rgba[at] = picture.bgra[at + 2]!;
    rgba[at + 1] = picture.bgra[at + 1]!;
    rgba[at + 2] = picture.bgra[at]!;
    rgba[at + 3] = 255;
  }
  return createImageBitmap(new ImageData(rgba, picture.width, picture.height));
}

/** The question's crops (window points) cut from the window's picture and stacked on white, as a JPEG at 0.75. */
export async function regionJPEG(
  bitmap: ImageBitmap,
  crops: readonly Rect[],
  pixelsPerPoint: number,
): Promise<Uint8Array | null> {
  const layout = stackedPicture(crops, pixelsPerPoint);
  if (!layout) return null;
  const canvas = canvasOf(layout.width, layout.height);
  const context = context2d(canvas);
  if (!context) return null;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, layout.width, layout.height);
  context.imageSmoothingQuality = "high";
  for (const { source, target } of layout.pieces) {
    context.drawImage(
      bitmap,
      source.x,
      source.y,
      source.width,
      source.height,
      target.x,
      target.y,
      target.width,
      target.height,
    );
  }
  return jpegBytes(canvas, 0.75);
}
