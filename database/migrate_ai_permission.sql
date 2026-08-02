-- Tambahkan akses Asisten AI kepada role operasional bawaan yang sudah ada.
-- JSON_ARRAY_APPEND dipakai hanya jika ai:view belum tersimpan.
UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(
  COALESCE(`permissions`, JSON_ARRAY()),
  '$',
  'ai:view'
)
WHERE `code` IN ('ADM', 'SPV', 'KSR', 'TKN')
  AND JSON_CONTAINS(COALESCE(`permissions`, JSON_ARRAY()), JSON_QUOTE('ai:view')) = 0;
