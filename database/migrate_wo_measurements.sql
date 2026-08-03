-- Pengukuran AC terstruktur pada tahap diagnosa dan penyelesaian WO.
ALTER TABLE `work_orders`
  ADD COLUMN IF NOT EXISTS `diagnosis_temperature` DECIMAL(6,2) NULL AFTER `findings`,
  ADD COLUMN IF NOT EXISTS `diagnosis_lp` DECIMAL(8,2) NULL AFTER `diagnosis_temperature`,
  ADD COLUMN IF NOT EXISTS `diagnosis_hp` DECIMAL(8,2) NULL AFTER `diagnosis_lp`,
  ADD COLUMN IF NOT EXISTS `final_temperature` DECIMAL(6,2) NULL AFTER `diagnosis_hp`,
  ADD COLUMN IF NOT EXISTS `final_lp` DECIMAL(8,2) NULL AFTER `final_temperature`,
  ADD COLUMN IF NOT EXISTS `final_hp` DECIMAL(8,2) NULL AFTER `final_lp`;
