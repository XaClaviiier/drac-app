-- Pengaturan aplikasi dan proteksi akun Owner
CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `settings_json` JSON NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `is_owner` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`,
  ADD COLUMN IF NOT EXISTS `is_protected` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_owner`;

UPDATE `users`
SET `is_owner` = 1, `is_protected` = 1, `is_active` = 1
WHERE `id` = '1';
