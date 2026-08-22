import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const directory = process.argv[2];
const files = fs.readdirSync(directory).filter(name => /^page-\d+\.png$/.test(name)).sort();
const thumbWidth = 842;
const thumbHeight = 595;
const gap = 24;
const labelHeight = 36;
const columns = 2;
const rows = Math.ceil(files.length / columns);
const canvas = createCanvas(columns * thumbWidth + (columns + 1) * gap, rows * (thumbHeight + labelHeight) + (rows + 1) * gap);
const context = canvas.getContext('2d');
context.fillStyle = '#d8dde5';
context.fillRect(0, 0, canvas.width, canvas.height);

for (let index = 0; index < files.length; index += 1) {
  const image = await loadImage(path.join(directory, files[index]));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = gap + column * (thumbWidth + gap);
  const y = gap + row * (thumbHeight + labelHeight + gap);
  context.fillStyle = '#27364a';
  context.font = 'bold 20px Arial';
  context.fillText(`Halaman ${index + 1}`, x, y + 24);
  context.drawImage(image, x, y + labelHeight, thumbWidth, thumbHeight);
}

fs.writeFileSync(path.join(directory, 'contact-sheet.png'), canvas.toBuffer('image/png'));
