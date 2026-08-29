export type CompatibilityEngineType = 'Bensin' | 'Diesel' | 'Hybrid' | 'Listrik';
export type CompatibilityTransmission = 'MT' | 'AT' | 'CVT' | 'DCT';
export type CompatibilityHvacType = 'Manual' | 'Digital' | 'Dual Zone';
export type FitmentStatus = 'Pending' | 'Verified' | 'Rejected';

export interface VehicleFitmentProfile {
  brandId?: string;
  modelId?: string;
  generationId?: string;
  engineCc?: number | null;
  engineType?: CompatibilityEngineType | null;
  engineCode?: string | null;
  variant?: string | null;
  transmission?: CompatibilityTransmission | null;
  hvacType?: CompatibilityHvacType | null;
  year?: number | null;
}

export interface VehicleFitmentRule extends Omit<VehicleFitmentProfile, 'year'> {
  brandName?: string;
  modelName?: string;
  generationName?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  fitmentStatus?: FitmentStatus;
  source?: string | null;
  notes?: string | null;
}

export type CompatibilityLevel = 'exact' | 'generation' | 'model' | 'brand' | 'universal' | 'needs-verification' | 'incompatible' | 'unknown';
export interface CompatibilityRank { level: CompatibilityLevel; score: number; rule?: VehicleFitmentRule }

const normalized = (value?: string | null) => (value || '').trim().toLocaleUpperCase('id-ID');
const differs = (expected?: string | null, actual?: string | null) => Boolean(expected && actual && normalized(expected) !== normalized(actual));
const unknownConstraint = (expected?: string | number | null, actual?: string | number | null) => expected !== null && expected !== undefined && expected !== '' && (actual === null || actual === undefined || actual === '');

const scoreRule = (vehicle: VehicleFitmentProfile, rule: VehicleFitmentRule): CompatibilityRank => {
  const status = rule.fitmentStatus || 'Pending';
  const universal = normalized(rule.brandId) === 'UNIVERSAL' || normalized(rule.brandName) === 'UNIVERSAL';
  if (!universal && differs(rule.brandId, vehicle.brandId)) return { level: 'incompatible', score: -1, rule };
  if (differs(rule.modelId, vehicle.modelId) || differs(rule.generationId, vehicle.generationId)) return { level: 'incompatible', score: -1, rule };
  if (rule.engineCc && vehicle.engineCc != null && rule.engineCc !== vehicle.engineCc) return { level: 'incompatible', score: -1, rule };
  if (differs(rule.engineType, vehicle.engineType) || differs(rule.engineCode, vehicle.engineCode)
    || differs(rule.variant, vehicle.variant) || differs(rule.transmission, vehicle.transmission)
    || differs(rule.hvacType, vehicle.hvacType)) return { level: 'incompatible', score: -1, rule };
  if (rule.yearFrom && vehicle.year != null && vehicle.year < rule.yearFrom) return { level: 'incompatible', score: -1, rule };
  if (rule.yearTo && vehicle.year != null && vehicle.year > rule.yearTo) return { level: 'incompatible', score: -1, rule };
  let score = universal ? 10 : 30;
  if (rule.modelId) score += 30;
  if (rule.generationId) score += 40;
  if (rule.engineCc) score += 8;
  if (rule.engineType) score += 5;
  if (rule.engineCode) score += 10;
  if (rule.variant) score += 4;
  if (rule.transmission) score += 4;
  if (rule.hvacType) score += 6;
  if (rule.yearFrom || rule.yearTo) score += 3;

  const hasUnknownConstraint = unknownConstraint(rule.modelId, vehicle.modelId)
    || unknownConstraint(rule.generationId, vehicle.generationId)
    || unknownConstraint(rule.engineCc, vehicle.engineCc)
    || unknownConstraint(rule.yearFrom || rule.yearTo, vehicle.year)
    || unknownConstraint(rule.engineType, vehicle.engineType)
    || unknownConstraint(rule.engineCode, vehicle.engineCode)
    || unknownConstraint(rule.variant, vehicle.variant)
    || unknownConstraint(rule.transmission, vehicle.transmission)
    || unknownConstraint(rule.hvacType, vehicle.hvacType);
  if (hasUnknownConstraint) return { level: 'needs-verification', score, rule };
  if (status === 'Rejected') return { level: 'incompatible', score, rule };
  if (status !== 'Verified') return { level: 'needs-verification', score, rule };
  if (universal) return { level: 'universal', score, rule };
  if (rule.generationId && (rule.engineCc || rule.engineType || rule.engineCode || rule.variant || rule.transmission || rule.hvacType || rule.yearFrom || rule.yearTo)) return { level: 'exact', score, rule };
  if (rule.generationId) return { level: 'generation', score, rule };
  if (rule.modelId) return { level: 'model', score, rule };
  return { level: 'brand', score, rule };
};

export const rankItemVehicleCompatibility = (vehicle: VehicleFitmentProfile, rules: VehicleFitmentRule[]): CompatibilityRank => {
  if (!rules.length) return { level: 'unknown', score: 0 };
  const ranked = rules.map(rule => scoreRule(vehicle, rule));
  const trust = (rank: CompatibilityRank) => rank.level === 'incompatible' ? 0
    : rank.level === 'unknown' ? 1
      : rank.level === 'needs-verification' ? 2 : 3;
  const bestAccepted = ranked.filter(rank => rank.level !== 'incompatible').sort((left, right) => trust(right) - trust(left) || right.score - left.score)[0];
  const mostSpecificRejection = ranked.filter(rank => rank.level === 'incompatible' && rank.score > 0).sort((left, right) => right.score - left.score)[0];
  if (mostSpecificRejection && (!bestAccepted || mostSpecificRejection.score >= bestAccepted.score)) return mostSpecificRejection;
  return bestAccepted || ranked[0];
};

const rankTrust = (rank: CompatibilityRank) => rank.level === 'incompatible' ? 0
  : rank.level === 'unknown' ? 1
    : rank.level === 'needs-verification' ? 2 : 3;

export const compareCompatibilityRanks = (left: CompatibilityRank, right: CompatibilityRank) => (
  rankTrust(right) - rankTrust(left) || right.score - left.score
);

export const compatibilityBadgeForRank = (rank: CompatibilityRank) => {
  if (rank.level === 'incompatible') return { label: 'Tidak Cocok', className: 'bg-red-100 text-red-700' };
  if (rank.level === 'needs-verification') return { label: 'Perlu Verifikasi', className: 'bg-amber-100 text-amber-800' };
  if (rank.level === 'exact') return { label: 'Cocok Persis', className: 'bg-emerald-100 text-emerald-700' };
  if (rank.score > 0) return { label: 'Cocok', className: 'bg-blue-100 text-blue-700' };
  return null;
};
