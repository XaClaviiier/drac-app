import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibilityBadgeForRank, compareCompatibilityRanks, rankItemVehicleCompatibility } from '../src/lib/vehicleCompatibility.ts';

const vehicle = {
  brandId: 'HONDA',
  modelId: 'JAZZ',
  generationId: 'GE8',
  engineCc: 1500,
  engineType: 'Bensin',
  engineCode: 'L15A',
  variant: 'RS',
  transmission: 'AT',
  hvacType: 'Manual',
  year: 2012,
};

test('mengurutkan kompatibilitas barang dari cocok persis hingga universal', () => {
  const exact = rankItemVehicleCompatibility(vehicle, [{
    brandId: 'HONDA', modelId: 'JAZZ', generationId: 'GE8', engineCc: 1500,
    engineType: 'Bensin', engineCode: 'L15A', variant: 'RS', transmission: 'AT',
    hvacType: 'Manual', yearFrom: 2008, yearTo: 2014, fitmentStatus: 'Verified',
  }]);
  const generation = rankItemVehicleCompatibility(vehicle, [{ brandId: 'HONDA', modelId: 'JAZZ', generationId: 'GE8', fitmentStatus: 'Verified' }]);
  const brand = rankItemVehicleCompatibility(vehicle, [{ brandId: 'HONDA', fitmentStatus: 'Verified' }]);
  const universal = rankItemVehicleCompatibility(vehicle, [{ brandId: 'UNIVERSAL', fitmentStatus: 'Verified' }]);

  assert.equal(exact.level, 'exact');
  assert.ok(exact.score > generation.score);
  assert.ok(generation.score > brand.score);
  assert.ok(brand.score > universal.score);
});

test('menolak fitment yang bertentangan dan menandai data belum terverifikasi', () => {
  const wrongGeneration = rankItemVehicleCompatibility(vehicle, [{ brandId: 'HONDA', modelId: 'JAZZ', generationId: 'GD3', fitmentStatus: 'Verified' }]);
  const denied = rankItemVehicleCompatibility(vehicle, [{ brandId: 'HONDA', modelId: 'JAZZ', generationId: 'GE8', fitmentStatus: 'Rejected' }]);
  const pending = rankItemVehicleCompatibility(vehicle, [{ brandId: 'HONDA', modelId: 'JAZZ', generationId: 'GE8', fitmentStatus: 'Pending' }]);

  assert.equal(wrongGeneration.level, 'incompatible');
  assert.equal(denied.level, 'incompatible');
  assert.equal(pending.level, 'needs-verification');
  assert.ok(pending.score > 0);
});

test('rentang tahun dan atribut opsional hanya membatasi bila diisi', () => {
  const outsideYear = rankItemVehicleCompatibility(vehicle, [{ brandId: 'HONDA', modelId: 'JAZZ', generationId: 'GE8', yearFrom: 2013, fitmentStatus: 'Verified' }]);
  const allVariants = rankItemVehicleCompatibility(vehicle, [{ brandId: 'HONDA', modelId: 'JAZZ', generationId: 'GE8', fitmentStatus: 'Verified' }]);

  assert.equal(outsideYear.level, 'incompatible');
  assert.equal(allVariants.level, 'generation');
});

test('atribut kendaraan yang belum dicatat menurunkan kepastian tanpa menyatakan tidak cocok', () => {
  const sparseVehicle = { brandId: 'VB-HONDA', modelId: 'VM-JAZZ', generationId: 'VG-JAZZ-GE8', engineCc: 1500, year: 2012 };
  const seededTemplate = [{
    brandId: 'VB-HONDA', modelId: 'VM-JAZZ', generationId: 'VG-JAZZ-GE8',
    engineCc: 1500, engineType: 'Bensin', yearFrom: 2008, yearTo: 2014,
    fitmentStatus: 'Pending',
  }];
  const result = rankItemVehicleCompatibility(sparseVehicle, seededTemplate);
  assert.equal(result.level, 'needs-verification');
  assert.ok(result.score > 0);
});

test('kendaraan tanpa model atau generasi terstruktur tidak mendapat badge tepercaya', () => {
  const sparseVehicle = { brandId: 'HONDA', year: 2012 };
  const verifiedGenerationRule = [{
    brandId: 'HONDA', modelId: 'JAZZ', generationId: 'GE8', engineCc: 1500,
    fitmentStatus: 'Verified',
  }];
  const result = rankItemVehicleCompatibility(sparseVehicle, verifiedGenerationRule);
  assert.equal(result.level, 'needs-verification');
  assert.equal(compatibilityBadgeForRank(result)?.label, 'Perlu Verifikasi');
});

test('status verifikasi menentukan badge dan prioritas sebelum tingkat spesifik', () => {
  const pending = rankItemVehicleCompatibility(vehicle, [{
    brandId: 'HONDA', modelId: 'JAZZ', generationId: 'GE8', engineCc: 1500,
    fitmentStatus: 'Pending',
  }]);
  const verified = rankItemVehicleCompatibility(vehicle, [{ brandId: 'HONDA', modelId: 'JAZZ', fitmentStatus: 'Verified' }]);
  assert.equal(compatibilityBadgeForRank(pending)?.label, 'Perlu Verifikasi');
  assert.ok(compareCompatibilityRanks(verified, pending) < 0);
});

test('aturan tidak cocok menang hanya bila setidaknya sama spesifik dengan aturan cocok', () => {
  const exactRejected = { brandId: 'HONDA', modelId: 'JAZZ', generationId: 'GE8', engineCc: 1500, fitmentStatus: 'Rejected' };
  const broadVerified = { brandId: 'HONDA', fitmentStatus: 'Verified' };
  assert.equal(rankItemVehicleCompatibility(vehicle, [broadVerified, exactRejected]).level, 'incompatible');

  const exactVerified = { ...exactRejected, fitmentStatus: 'Verified' };
  const broadRejected = { brandId: 'HONDA', fitmentStatus: 'Rejected' };
  assert.equal(rankItemVehicleCompatibility(vehicle, [broadRejected, exactVerified]).level, 'exact');
});
