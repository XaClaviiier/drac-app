import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const source = 'C:/Users/axlfo/Downloads/lembar_penghitungan_stok_dokteracmobil_260816162032 gudang perintis 31 juli 26.xlsx';
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const sheets = await workbook.inspect({ kind: 'sheet', include: 'id,name', maxChars: 6000 });
console.log('SHEETS');
console.log(sheets.ndjson);
const summary = await workbook.inspect({ kind: 'workbook,sheet,table', maxChars: 18000, tableMaxRows: 20, tableMaxCols: 14, tableMaxCellChars: 120 });
console.log('SUMMARY');
console.log(summary.ndjson);
for (const sheet of workbook.worksheets.items) {
  const used = sheet.getUsedRange();
  console.log(`USED ${sheet.name}`, used?.address || 'none');
  if (used) {
    const preview = await workbook.render({ sheetName: sheet.name, autoCrop: 'all', scale: 1, format: 'png' });
    await fs.writeFile(`preview-${sheet.name.replace(/[^a-z0-9]/gi,'_')}.png`, new Uint8Array(await preview.arrayBuffer()));
  }
}
