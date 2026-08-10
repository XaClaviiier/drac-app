CREATE TABLE IF NOT EXISTS vehicle_catalog_settings (
  id TINYINT NOT NULL PRIMARY KEY,
  brand_sort_mode ENUM('manual','usage') NOT NULL DEFAULT 'manual',
  model_sort_mode ENUM('manual','usage') NOT NULL DEFAULT 'manual',
  color_sort_mode ENUM('manual') NOT NULL DEFAULT 'manual',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO vehicle_catalog_settings(id) VALUES(1);

CREATE TABLE IF NOT EXISTS vehicle_catalog_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entity VARCHAR(20) NOT NULL,
  entity_id VARCHAR(64) NULL,
  entity_name VARCHAR(100) NULL,
  action VARCHAR(30) NOT NULL,
  detail VARCHAR(500) NULL,
  user_id VARCHAR(64) NULL,
  user_name VARCHAR(150) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vehicle_catalog_audit_created(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
