ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS brand_id VARCHAR(64) NULL AFTER model,
  ADD COLUMN IF NOT EXISTS model_id VARCHAR(64) NULL AFTER brand_id;

UPDATE vehicles v
JOIN vehicle_brands b ON LOWER(TRIM(b.name))=LOWER(TRIM(v.brand))
JOIN vehicle_models m ON m.brand_id=b.id AND LOWER(TRIM(m.name))=LOWER(TRIM(v.model))
SET v.brand_id=b.id,
    v.model_id=m.id,
    v.brand=b.name,
    v.model=m.name
WHERE v.brand_id IS NULL
   OR v.model_id IS NULL
   OR v.brand<>b.name
   OR v.model<>m.name;
