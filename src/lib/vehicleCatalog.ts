export const vehicleModels: Record<string, string[]> = {
  Toyota: ['Agya', 'Avanza', 'Calya', 'Camry', 'Fortuner', 'Innova', 'Raize', 'Rush', 'Veloz', 'Yaris'],
  Honda: ['Brio', 'BR-V', 'City', 'Civic', 'CR-V', 'HR-V', 'Jazz', 'Mobilio'],
  Suzuki: ['APV', 'Baleno', 'Carry', 'Ertiga', 'Grand Vitara', 'Ignis', 'Jimny', 'S-Presso', 'XL7'],
  Daihatsu: ['Ayla', 'Gran Max', 'Luxio', 'Rocky', 'Sigra', 'Sirion', 'Terios', 'Xenia'],
  Mitsubishi: ['Colt L300', 'Outlander', 'Pajero Sport', 'Triton', 'Xpander', 'Xpander Cross'],
  Nissan: ['Almera', 'Grand Livina', 'Kicks', 'Livina', 'Magnite', 'Navara', 'Serena', 'X-Trail'],
  Hyundai: ['Creta', 'H-1', 'Ioniq', 'Kona', 'Palisade', 'Santa Fe', 'Stargazer', 'Tucson'],
  Kia: ['Carens', 'Carnival', 'Picanto', 'Rio', 'Seltos', 'Sonet', 'Sportage'],
  Wuling: ['Air ev', 'Almaz', 'BinguoEV', 'Cloud EV', 'Confero', 'Cortez', 'Formo'],
  DFSK: ['Gelora', 'Glory 560', 'Glory i-Auto', 'Super Cab'],
  Isuzu: ['D-Max', 'MU-X', 'Panther', 'Traga'],
  Mazda: ['CX-3', 'CX-5', 'CX-8', 'CX-9', 'Mazda2', 'Mazda3', 'Mazda6'],
  Lexus: ['ES', 'LM', 'LS', 'LX', 'NX', 'RX', 'UX'],
  BMW: ['Seri 2', 'Seri 3', 'Seri 5', 'Seri 7', 'X1', 'X3', 'X5', 'X7'],
  'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'GLA', 'GLC', 'GLE', 'S-Class'],
};

export const vehicleBrands = [...Object.keys(vehicleModels), 'Lainnya'];

export const vehicleColors = [
  'Hitam', 'Putih', 'Silver', 'Abu-abu', 'Merah', 'Biru',
  'Cokelat', 'Hijau', 'Kuning', 'Oranye', 'Ungu', 'Emas',
];

export const vehicleYears = Array.from(
  { length: new Date().getFullYear() + 2 - 1980 },
  (_, index) => new Date().getFullYear() + 1 - index,
);
