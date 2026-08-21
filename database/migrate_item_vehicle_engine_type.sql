ALTER TABLE item_vehicle_compatibilities
    ADD COLUMN IF NOT EXISTS engine_type VARCHAR(20) NULL AFTER engine_cc;
