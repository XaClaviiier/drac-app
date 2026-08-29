import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('API barang menyimpan metadata part dan fitment teknis lengkap', () => {
  const endpoint = source('api/endpoints/items.php');
  for (const column of ['oem_part_number', 'alternate_part_numbers', 'technical_notes']) {
    assert.match(endpoint, new RegExp(column));
  }
  for (const column of ['year_from', 'year_to', 'engine_code', 'variant', 'transmission', 'hvac_type', 'fitment_status', 'source', 'notes']) {
    assert.match(endpoint, new RegExp(`item_vehicle_compatibilities ADD COLUMN IF NOT EXISTS ${column}`));
  }
  assert.match(endpoint, /fitmentStatus/);
  assert.match(endpoint, /engineCode/);
  assert.match(endpoint, /hvacType/);
  assert.match(endpoint, /oemPartNumber/);
  assert.match(endpoint, /alternatePartNumbers/);
  assert.match(endpoint, /INSERT INTO item_vehicle_compatibilities\(item_id,brand_id,model_id,generation_id,year_from,year_to,engine_cc,engine_type,engine_code,variant,transmission,hvac_type,fitment_status,source,notes,sort_order\)/);
  assert.match(endpoint, /SELECT \?,s\.brand_id,s\.model_id,s\.generation_id,s\.year_from,s\.year_to,s\.engine_cc,s\.engine_type,s\.engine_code,s\.variant,s\.transmission,s\.hvac_type,s\.fitment_status,s\.source,s\.notes,s\.sort_order/);
});

test('backend menjaga otoritas verifikasi dan konsistensi transisi kompatibilitas', () => {
  const endpoint = source('api/endpoints/items.php');
  assert.match(endpoint, /bool \$canVerifyFitment/);
  assert.match(endpoint, /\$existingStatusStmt/);
  assert.match(endpoint, /\$canVerifyFitment \? \$requestedStatus : \(\$existingStatus/);
  assert.match(endpoint, /fitment_status IN \('Verified','Rejected'\)/);
  assert.match(endpoint, /foreach \(\$protectedFitments as \$protectedFitment\)/);
  assert.match(endpoint, /\$protectedFitmentCount/);
  assert.match(endpoint, /Keputusan kecocokan terverifikasi hanya dapat dihapus oleh Owner atau Administrator/);
  assert.match(endpoint, /case 'DELETE':.*\$deleteProtectedFitmentCount/s);
  assert.match(endpoint, /case 'DELETE':.*authenticatedUserIsOwnerOrAdministrator\(\$pdo,\$actor\)/s);
  assert.match(endpoint, /Item dengan keputusan kecocokan terverifikasi hanya dapat dihapus oleh Owner atau Administrator/);
  const picker = source('src/components/VehicleCompatibilityPicker.tsx');
  assert.match(picker, /canVerifyFitment\s*\|\|\s*row\.fitmentStatus==='Pending'/);
  assert.match(endpoint, /\$rows\s*=\s*\$rawRows/);
  assert.match(endpoint, /elseif\s*\(!\$primaryBrandRow\).*DELETE FROM item_vehicle_compatibilities/s);
  assert.match(endpoint, /SELECT id,name,category_id FROM item_product_types/);
  assert.match(endpoint, /Jenis barang tidak sesuai dengan kategori/);
  assert.match(endpoint, /t\.source<=>s\.source/);
  assert.match(endpoint, /t\.notes<=>s\.notes/);
  assert.match(endpoint, /product_type_id=COALESCE/);
  assert.match(endpoint, /alternate_part_numbers=\?/);
  assert.match(endpoint, /technical_notes=\?/);
  assert.match(endpoint, /Nomor part tambahan:/);
  assert.match(endpoint, /strlen\(\$candidateAlternatePartNumbers\) <= 500/);
});

test('DELETE barang mengunci item dan memeriksa keputusan tepercaya dalam satu transaksi', () => {
  const endpoint = source('api/endpoints/items.php');
  const deleteBlock = endpoint.slice(endpoint.indexOf("case 'DELETE':"), endpoint.indexOf('default: respondError'));
  const begin = deleteBlock.indexOf('$pdo->beginTransaction()');
  const lock = deleteBlock.indexOf('SELECT id FROM items WHERE id=? FOR UPDATE');
  const protectedCheck = deleteBlock.indexOf('$deleteProtectedFitmentCount');
  const referenceCheck = deleteBlock.indexOf("'work_order_services' => 'item_id'");
  const deletion = deleteBlock.indexOf('DELETE FROM item_vehicle_compatibilities WHERE item_id=?');
  const commit = deleteBlock.indexOf('$pdo->commit()');
  assert.ok(begin >= 0 && begin < lock);
  assert.ok(lock < protectedCheck);
  assert.ok(protectedCheck < referenceCheck);
  assert.ok(referenceCheck < deletion);
  assert.ok(deletion < commit);
  assert.match(deleteBlock, /catch \(DomainException \$e\).*rollBack/s);
});

test('Jasa dan Group mengabaikan jenis spare part serta seluruh kendaraan dari payload lama', () => {
  const endpoint = source('api/endpoints/items.php');
  const productTypeGuards = endpoint.match(/\$productTypeId=in_array\(\$type,\['Jasa','Group'\],true\)\?''/g) || [];
  const primaryBrandGuards = endpoint.match(/\$(?:vehicleBrandId|primaryBrandId)=in_array\(\$type,\['Jasa','Group'\],true\)\?''/g) || [];
  const vehicleBrandListGuards = endpoint.match(/\$vehicleBrandIds=in_array\(\$type,\['Jasa','Group'\],true\)\?\[\]:/g) || [];
  assert.equal(productTypeGuards.length, 2);
  assert.equal(primaryBrandGuards.length, 2);
  assert.equal(vehicleBrandListGuards.length, 2);
  assert.match(endpoint, /in_array\(\(string\)\$target\['type'\],\['Jasa','Group'\],true\)/);
  assert.match(endpoint, /DELETE FROM item_vehicle_compatibilities WHERE item_id=\?.*\$targetId/s);
  assert.match(endpoint, /DELETE FROM item_vehicle_brands WHERE item_id=\?.*\$targetId/s);
});

test('backend menolak metadata part dan fitment yang melebihi kapasitas kolom', () => {
  const endpoint = source('api/endpoints/items.php');
  assert.match(endpoint, /function assertItemTextLength/);
  assert.match(endpoint, /assertItemTextLength\(\$d\['oemPartNumber'\].*100, 'Nomor OEM'\)/);
  assert.match(endpoint, /assertItemTextLength\(\$d\['alternatePartNumbers'\].*500, 'Nomor part alternatif'\)/);
  assert.match(endpoint, /assertItemTextLength\(\$engineCode, 50, 'Kode mesin'\)/);
  assert.match(endpoint, /assertItemTextLength\(\$source, 255, 'Sumber data'\)/);
  assert.match(endpoint, /assertItemTextLength\(\$notes, 500, 'Catatan fitment'\)/);
});

test('schema dasar memuat master jenis barang dan metadata fitment lengkap', () => {
  const schema = source('database/dokterac_schema.sql');
  assert.match(schema, /CREATE TABLE(?: IF NOT EXISTS)? `item_product_types`/);
  assert.match(schema, /`product_type_id` varchar\(64\)/i);
  assert.match(schema, /`oem_part_number` varchar\(100\)/i);
  assert.match(schema, /CREATE TABLE(?: IF NOT EXISTS)? `item_vehicle_compatibilities`/);
  assert.match(schema, /`item_id` VARCHAR\(64\) NOT NULL/);
  for (const column of ['year_from','year_to','engine_code','variant','transmission','hvac_type','fitment_status','source','notes']) {
    assert.match(schema, new RegExp('`' + column + '`'));
  }
});

test('kontrak TypeScript membawa metadata barang dan detail kompatibilitas', () => {
  const types = source('src/types/index.ts');
  for (const property of ['yearFrom', 'yearTo', 'engineCode', 'variant', 'transmission', 'hvacType', 'fitmentStatus', 'source', 'notes']) {
    assert.match(types, new RegExp(`${property}\\?`));
  }
  assert.match(types, /oemPartNumber\?/);
  assert.match(types, /alternatePartNumbers\?/);
  assert.match(types, /technicalNotes\?/);
});

test('Master Barang menyediakan tab kompatibilitas dan picker teknis', () => {
  const page = source('src/pages/ItemsAndServices.tsx');
  const picker = source('src/components/VehicleCompatibilityPicker.tsx');
  assert.match(page, /VehicleCompatibilityPicker/);
  assert.match(page, /canVerifyFitment=\{canVerifyItems\}/);
  assert.match(picker, /canVerifyFitment\?:boolean/);
  assert.match(picker, /canVerifyFitment\?statuses:\['Pending'\]/);
  assert.match(picker, /resetGenerationDerivedState/);
  assert.match(page, /row\.categoryId===itemForm\.categoryId/);
  assert.match(page, /Kompatibilitas Kendaraan/);
  assert.match(page, /oemPartNumber/);
  assert.match(page, /alternatePartNumbers/);
  assert.match(page, /technicalNotes/);
  assert.match(picker, /Kode Mesin/);
  assert.match(picker, /Varian/);
  assert.match(picker, /Transmisi/);
  assert.match(picker, /Sistem AC/);
  assert.match(picker, /Status Verifikasi/);
  assert.match(picker, /Sumber Data/);
});

test('WO mengurutkan dan memberi label barang berdasarkan kendaraan aktif', () => {
  const page = source('src/pages/WorkOrders.tsx');
  const helper = source('src/lib/vehicleCompatibility.ts');
  assert.match(page, /rankItemVehicleCompatibility/);
  assert.match(page, /itemCompatibilityRank/);
  assert.match(page, /compatibilityBadgeForRank/);
  assert.match(page, /compareCompatibilityRanks/);
  assert.match(helper, /Cocok Persis/);
  assert.match(helper, /Perlu Verifikasi/);
  assert.match(helper, /Tidak Cocok/);
});

test('jenis barang Motor Blower terpisah dari sifat persediaan dan dipilih template', () => {
  const endpoint = source('api/endpoints/items.php');
  const allData = source('api/endpoints/all-data.php');
  const types = source('src/types/index.ts');
  const page = source('src/pages/ItemsAndServices.tsx');
  assert.match(endpoint, /item_product_types/);
  assert.match(endpoint, /product_type_id/);
  assert.match(allData, /itemProductTypes/);
  assert.match(types, /productTypeId/);
  assert.match(types, /ItemProductType/);
  assert.match(page, /Jenis Barang \/ Spare Part/);
  assert.match(page, /MOTOR BLOWER/);
});

test('generasi Jazz disemai setelah master Honda dan Jazz tersedia', () => {
  const endpoint = source('api/endpoints/vehicle-catalog.php');
  assert.ok(endpoint.indexOf("$jazzModel =") > endpoint.indexOf("$modelInsert->execute"));
});

test('data awal Honda Jazz mencakup GD3 GE8 GK5 dan tiga template motor blower', () => {
  const endpoint = source('api/endpoints/vehicle-catalog.php');
  const templates = source('src/lib/itemCompatibilityTemplates.ts');
  for (const generation of ['GD3', 'GE8', 'GK5']) assert.match(endpoint, new RegExp(generation));
  for (const name of ['MOTOR BLOWER HONDA JAZZ GD3', 'MOTOR BLOWER HONDA JAZZ GE8', 'MOTOR BLOWER HONDA JAZZ GK5']) assert.match(templates, new RegExp(name));
  assert.match(templates, /79310-SAA-003/);
  assert.match(templates, /79310-TF0-G01/);
  assert.match(templates, /79310-T5R-A01/);
  assert.match(templates, /fitmentStatus: 'Pending'/);
});
