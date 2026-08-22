import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;
globalThis.Path2D = Path2D;

const input = process.argv[2];
const outputDir = process.argv[3];
const data = new Uint8Array(fs.readFileSync(input));
const pdf = await pdfjsLib.getDocument({ data }).promise;
const summary = { pages: pdf.numPages, metadata: await pdf.getMetadata(), pageDetails: [] };

for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport }).promise;
  const filename = path.join(outputDir, `page-${String(pageNumber).padStart(3, '0')}.png`);
  fs.writeFileSync(filename, canvas.toBuffer('image/png'));
  const text = await page.getTextContent();
  summary.pageDetails.push({
    pageNumber,
    width: viewport.width / 1.5,
    height: viewport.height / 1.5,
    text: text.items.map(item => item.str).join(' '),
  });
}

fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pages: pdf.numPages, outputDir }));
