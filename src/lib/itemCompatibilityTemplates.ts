import type { ItemVehicleCompatibility } from '../types';

export interface ItemCompatibilityTemplate {
  id: string;
  name: string;
  oemPartNumber: string;
  alternatePartNumbers: string;
  technicalNotes: string;
  vehicleBrandId: string;
  vehicleCompatibilities: ItemVehicleCompatibility[];
}

const HONDA_BRAND_ID = 'VB-de3d5bd1e1b72410';
const JAZZ_MODEL_ID = 'VM-e2b60348634320c8';

const jazzBlower = (
  id: string,
  name: string,
  generationId: string,
  generationName: string,
  yearFrom: number,
  yearTo: number,
  oemPartNumber: string,
  alternatePartNumbers = '',
): ItemCompatibilityTemplate => ({
  id,
  name,
  oemPartNumber,
  alternatePartNumbers,
  technicalNotes: 'Cocokkan nomor part, soket, titik dudukan, diameter kipas, dan arah putaran dengan barang lama sebelum dipasang.',
  vehicleBrandId: HONDA_BRAND_ID,
  vehicleCompatibilities: [{
    brandId: HONDA_BRAND_ID,
    brandName: 'Honda',
    modelId: JAZZ_MODEL_ID,
    modelName: 'Jazz',
    generationId,
    generationName,
    yearFrom,
    yearTo,
    engineCc: 1500,
    engineType: 'Bensin',
    fitmentStatus: 'Pending',
    source: 'Katalog referensi OEM; wajib validasi fisik dan nomor rangka',
    notes: 'Belum dianggap cocok final sampai diverifikasi teknisi.',
  }],
});

export const ITEM_COMPATIBILITY_TEMPLATES: ItemCompatibilityTemplate[] = [
  jazzBlower('blower-jazz-gd3', 'MOTOR BLOWER HONDA JAZZ GD3', 'VG-JAZZ-GD3', 'GD3', 2004, 2008, '79310-SAA-003'),
  jazzBlower('blower-jazz-ge8', 'MOTOR BLOWER HONDA JAZZ GE8', 'VG-JAZZ-GE8', 'GE8', 2008, 2014, '79310-TF0-G01', '79310-TF0-003'),
  jazzBlower('blower-jazz-gk5', 'MOTOR BLOWER HONDA JAZZ GK5', 'VG-JAZZ-GK5', 'GK5', 2014, 2021, '79310-T5R-A01'),
];
