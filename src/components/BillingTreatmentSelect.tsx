import type { BillingTreatment } from '../types';

export default function BillingTreatmentSelect({ id, value = 'normal', onChange, disabled = false }: {
  id: string;
  value?: BillingTreatment;
  onChange: (value: BillingTreatment) => void;
  disabled?: boolean;
}) {
  return <div className="my-3 rounded border border-gray-200 bg-gray-50 p-3">
    <label htmlFor={id} className="mr-3 text-sm font-medium text-gray-700">Perlakuan tagihan</label>
    <select id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value as BillingTreatment)} className="mt-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100 sm:mt-0">
      <option value="normal">Normal</option>
      <option value="goodwill">Gratis / Goodwill</option>
    </select>
    {value === 'goodwill' && <p className="mt-2 text-xs text-blue-700">Pelanggan tidak ditagih. Harga seluruh barang/jasa Rp0.</p>}
  </div>;
}
