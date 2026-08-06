/** Kunci tanggal kalender lokal (bukan UTC), aman untuk zona WITA. */
export function localDateKey(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addLocalDays(days: number, value: Date = new Date()): string {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return localDateKey(result);
}
