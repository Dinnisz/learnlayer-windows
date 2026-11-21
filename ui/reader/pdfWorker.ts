// pdf.js's worker, with the methods it calls that Safari's engine lacks (`engineGaps.ts`) defined first.

import "./engineGaps";
import "pdfjs-dist/build/pdf.worker.min.mjs";
