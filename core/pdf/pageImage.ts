// Port of LearnLayer/Problems/PageImage.swift @ ref 2026-11-04: the geometry of a picture of part of a page. The
// reader draws it with pdf.js and encodes the JPEG (quality 0.7; 0.45 for the classifier's thumbnail).

import { Rects, type Rect } from "./page";

export interface PageCrop {
  /** The part of the page drawn, in PDF points. */
  region: Rect;
  /** Pixels per point. */
  scale: number;
  width: number;
  height: number;
}

export const PageImage = {
  /** JPEG quality of the picture sent with a question. */
  quality: 0.7,
  /** The classifier's thumbnail: at most 512 pixels, quality 0.45. */
  thumbnailPixels: 512,
  thumbnailQuality: 0.45,

  /**
   * `rect` on a page (PDF points), widened to the page's width so a figure beside the text is included, and by
   * `margin` above and below. At most `maxPixels` on a side, and never more than twice the page's size.
   */
  crop(rect: Rect, mediaBox: Rect, maxPixels = 1600, margin = 12): PageCrop | null {
    const region = Rects.intersection(
      { x: mediaBox.x, y: rect.y - margin, width: mediaBox.width, height: rect.height + 2 * margin },
      mediaBox,
    );
    if (!region || !(region.width > 0) || !(region.height > 0)) return null;
    const scale = Math.min(2, maxPixels / Math.max(region.width, region.height));
    return { region, scale, width: Math.trunc(region.width * scale), height: Math.trunc(region.height * scale) };
  },

  /** The size of a picture `width` × `height` fitted to `maxPixels` on its long side; null when it already fits. */
  fitted(width: number, height: number, maxPixels: number): { width: number; height: number } | null {
    if (!(width > 0) || !(height > 0) || !(Math.max(width, height) > maxPixels)) return null;
    const scale = maxPixels / Math.max(width, height);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  },
};
