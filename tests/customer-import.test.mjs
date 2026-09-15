import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
await build({entryPoints:['src/lib/customerImport.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.codex-tmp/customer-import-test-parser.mjs'});
const { parseCustomerCsv, customerTable, mapCustomerRows, guessCustomerMapping, readCustomerFile } = await import('../.codex-tmp/customer-import-test-parser.mjs');
const php = process.env.PHP_BINARY || 'php';
function classify(rows, existing = []) {
  const p = spawnSync(php, ['tests/fixtures/customer-import-classify.php'], { input: JSON.stringify({ rows, existing }), encoding: 'utf8' });
  assert.ifError(p.error); assert.equal(p.status, 0, p.stderr); assert.equal(p.stderr, ''); return JSON.parse(p.stdout);
}
const row = (rowNumber, name, phone, extra={}) => ({ rowNumber, name, phone, ...extra });
test('CSV quoted commas, newlines, escaped quotes, BOM and semicolon', () => {
  assert.deepEqual(parseCustomerCsv('\uFEFFname,phone\r\n"A, B\nC ""D""",081234567890\r\n'), [['name','phone'], ['A, B\nC "D"','081234567890']]);
  assert.deepEqual(parseCustomerCsv('name;phone\nA;081234567890'), [['name','phone'], ['A','081234567890']]);
  assert.throws(() => parseCustomerCsv('name,phone\n"unterminated'), /kutip/);
});
test('mapping preserves sparse columns, raw rows, bracketed names and extra sources', () => {
  const table = customerTable([['Export'], ['No.','Nama','Handphone','Kategori','ID Pelanggan'], ['1','Ali (PT ABC)','081234567890','Umum','REF'], [], ['2','Budi','081234567891','Hertasning']]);
  const rows = mapCustomerRows(table, guessCustomerMapping(table.headers));
  assert.equal(rows[0].rowNumber, 3); assert.equal(rows[1].rowNumber, 5); assert.equal(rows[0].accurateId, 'REF'); assert.equal(rows[0].name,'Ali (PT ABC)');
  assert.throws(() => customerTable([['name','name'],['a','b']]), /duplikat/);
  assert.throws(() => customerTable([['name','phone'],['a','b','unexpected']]), /kolom/);
});
test('XLSX ignores false A1 dimension and preserves sparse/shared/inline cell positions', async () => {
  for (const useSharedStrings of [true,false]) {
    const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Daftar Pelanggan');
    sheet.getCell('A1').value='Nama';sheet.getCell('G1').value='Handphone';sheet.getCell('J1').value='Kategori';
    sheet.getCell('A2').value='ALI (PT ABC)';sheet.getCell('G2').value='081234567890';sheet.getCell('J2').value='Hertasning';
    sheet.getCell('A4').value='BUDI';sheet.getCell('G4').value='081234567891';
    const zip=await JSZip.loadAsync(await book.xlsx.writeBuffer({useSharedStrings}));
    const xml=await zip.file('xl/worksheets/sheet1.xml').async('string');
    zip.file('xl/worksheets/sheet1.xml',xml.replace(/<dimension[^>]*\/>/,'<dimension ref="A1"/>'));
    const table=await readCustomerFile(new File([await zip.generateAsync({type:'uint8array'})],'fixture.xlsx'));
    const rows=mapCustomerRows(table,guessCustomerMapping(table.headers));
    assert.equal(rows.length,2);assert.equal(rows[0].phone,'081234567890');assert.equal(rows[0].category,'Hertasning');assert.equal(rows[1].rowNumber,4);
  }
});
test('XLSX formula, unsupported file and oversized input are rejected',async()=>{
  const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Daftar Pelanggan');sheet.addRow(['name','phone']);sheet.addRow([{formula:'1+1'},'081234567890']);
  await assert.rejects(readCustomerFile(new File([await book.xlsx.writeBuffer()],'formula.xlsx')),/formula/);
  await assert.rejects(readCustomerFile(new File(['data'],'legacy.xls')),/XLS/);
  await assert.rejects(readCustomerFile(new File([new Uint8Array(8*1024*1024+1)],'large.csv')),/8 MB/);
});
test('same normalized phone merges identical names, retaining every row and category', () => {
  const result = classify([row(2,'ALI','+62 812-3456-7890',{category:'Cakalang',accurateId:'A'}),row(3,'Ali','081234567890',{category:'Hertasning',accurateId:'B'})]);
  assert.deepEqual(result.rows.map(r => r.status), ['new','duplicate']); assert.equal(result.rows[1].duplicateOf,2);
  assert.deepEqual(result.rows[0].categories,['Cakalang','Hertasning']); assert.equal(result.rows[1].accurateId,'B');
});
test('same name different phones stays separate; different names same phone block whole group', () => {
  assert.deepEqual(classify([row(2,'ALI','081234567890'),row(3,'ALI','081234567891')]).rows.map(r=>r.status),['new','new']);
  assert.deepEqual(classify([row(2,'ALI','081234567890'),row(3,'BUDI','081234567890')]).rows.map(r=>r.status),['conflict','conflict']);
});
test('placeholder, missing, multi-number, missing prefix and bad length are invalid', () => {
  for (const phone of ['0800000000','','081234567890/081234567891','81234567890','123','081234567890123456','081111111111']) assert.equal(classify([row(2,'ALI',phone)]).rows[0].status,'invalid',phone);
});
test('phone in name conflict is preserved, valid suffix removed conservatively', () => {
  const result=classify([row(2,'ABDIL 081207533379','081287533379'),row(3,'ALI (PT ABC) 081234567890','081234567890')]);
  assert.equal(result.rows[0].status,'conflict'); assert.equal(result.rows[0].name,'ABDIL 081207533379'); assert.equal(result.rows[1].cleanName,'ALI (PT ABC)');
});
test('business phone conflicts and poisoned duplicate groups require review', () => {
  const result=classify([row(2,'ALI','081234567890',{businessPhone:'0411123456'}),row(3,'ALI','081234567890')]);
  assert.deepEqual(result.rows.map(r=>r.status),['conflict','conflict']);
});
test('existing global match skips; ambiguous existing names or duplicate masters require review', () => {
  const rows=[row(2,'ALI 081234567890','081234567890',{category:'New'})];
  const existing=[{id:'existing',name:'ALI',phone:'+6281234567890',branch_id:'other',categories:['Keep']}];
  assert.equal(classify(rows,existing).rows[0].status,'existing');
  assert.equal(classify(rows,[{...existing[0],name:'ALDI'}]).rows[0].status,'conflict');
  assert.equal(classify(rows,[...existing,...existing]).rows[0].status,'conflict');
});
test('server rejects oversized rows, duplicate row numbers and non-string values', () => {
  assert.match(classify([]).error,/1–5000/);
  assert.ok(classify([row(2,'ALI','081234567890'),row(2,'BUDI','081234567891')]).error);
  assert.ok(classify([row(2,'A'.repeat(501),'081234567890')]).error);
  assert.ok(classify([row(2,'ALI',81234567890)]).error);
});
