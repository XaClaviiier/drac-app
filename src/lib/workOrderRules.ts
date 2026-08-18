export const DEFAULT_COMPLAINT_TEMPLATES = [
  'AC tidak dingin',
  'Berisik',
  'Berbau',
  'Freon habis',
  'Pengecekan rutin',
  'Lainnya',
];

export const DEFAULT_LOST_SALES_REASONS = [
  { id: 'customer-cancel', label: 'Pelanggan membatalkan', isActive: true, requiresNote: false },
  { id: 'price-rejected', label: 'Harga tidak disetujui', isActive: true, requiresNote: false },
  { id: 'customer-delay', label: 'Pelanggan menunda', isActive: true, requiresNote: false },
  { id: 'parts-unavailable', label: 'Suku cadang tidak tersedia', isActive: true, requiresNote: false },
  { id: 'other-workshop', label: 'Kendaraan dibawa ke bengkel lain', isActive: true, requiresNote: false },
  { id: 'unreachable', label: 'Tidak dapat dihubungi', isActive: true, requiresNote: false },
  { id: 'other', label: 'Lainnya', isActive: true, requiresNote: true },
];
