import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const source='C:/Users/axlfo/Downloads/lembar_penghitungan_stok_dokteracmobil_260816162032 gudang perintis 31 juli 26.xlsx';
const outputDir='D:/PROJECT/DRAC-APP/outputs/stock-opening-perintis-20260731';
const outputPath=`${outputDir}/saldo_awal_gudang_perintis_2026-07-31.xlsx`;
const imported=await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const sourceSheet=imported.worksheets.getItem('Lembar Penghitungan Stok');
const sourceValues=sourceSheet.getRange('A1:O238').values;
const rows=[];
for(let index=0;index<sourceValues.length;index++){
  const sourceRow=sourceValues[index]||[];
  const code=String(sourceRow[2]??'').trim();
  const name=String(sourceRow[4]??'').trim();
  const quantityValue=sourceRow[7];
  const quantity=typeof quantityValue==='number'?quantityValue:Number(quantityValue);
  if(!code||!name||!Number.isFinite(quantity)||/kode barang/i.test(code)) continue;
  rows.push([code,name,'GUDANG UTAMA CABANG PERINTIS',quantity,0,new Date(2026,6,31)]);
}

const workbook=Workbook.create();
const sheet=workbook.worksheets.add('Saldo Awal Stok');
sheet.showGridLines=false;
sheet.getRange(`A1:F${rows.length+1}`).values=[['Kode Barang','Nama Barang','Gudang','Qty Awal','Harga Pokok','Tanggal'],...rows];
sheet.getRange('A1:F1').format={fill:'#637C93',font:{bold:true,color:'#FFFFFF'},borders:{preset:'all',style:'thin',color:'#D1D5DB'},verticalAlignment:'center'};
sheet.getRange(`A2:F${rows.length+1}`).format={borders:{insideHorizontal:{style:'thin',color:'#E5E7EB'},insideVertical:{style:'thin',color:'#E5E7EB'}},verticalAlignment:'center'};
sheet.getRange(`D2:D${rows.length+1}`).format={numberFormat:'#,##0',horizontalAlignment:'right'};
sheet.getRange(`E2:E${rows.length+1}`).format={numberFormat:'#,##0',horizontalAlignment:'right'};
sheet.getRange(`F2:F${rows.length+1}`).format.numberFormat='yyyy-mm-dd';
sheet.getRange(`A1:A${rows.length+1}`).format.columnWidth=18;
sheet.getRange(`B1:B${rows.length+1}`).format.columnWidth=55;
sheet.getRange(`C1:C${rows.length+1}`).format.columnWidth=34;
sheet.getRange(`D1:E${rows.length+1}`).format.columnWidth=14;
sheet.getRange(`F1:F${rows.length+1}`).format.columnWidth=16;
sheet.getRange('A1:F1').format.rowHeight=24;
sheet.getRange(`B2:B${rows.length+1}`).format.wrapText=true;
sheet.freezePanes.freezeRows(1);
const table=sheet.tables.add(`A1:F${rows.length+1}`,true,'SaldoAwalStokTable');
table.showFilterButton=true;
table.showBandedRows=true;

await fs.mkdir(outputDir,{recursive:true});
const output=await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
const inspection=await workbook.inspect({kind:'table',sheetId:'Saldo Awal Stok',range:`A1:F${Math.min(rows.length+1,12)}`,include:'values,formulas',tableMaxRows:12,tableMaxCols:6,maxChars:8000});
console.log(inspection.ndjson);
const errors=await workbook.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',options:{useRegex:true,maxResults:100},summary:'formula error scan'});
console.log(errors.ndjson);
const preview=await workbook.render({sheetName:'Saldo Awal Stok',range:'A1:F18',scale:1.3,format:'png'});
await fs.writeFile('converted-preview.png',new Uint8Array(await preview.arrayBuffer()));
console.log(JSON.stringify({outputPath,rowCount:rows.length,totalQty:rows.reduce((sum,row)=>sum+row[3],0)}));
