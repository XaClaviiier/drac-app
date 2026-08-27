import { Calculator, CreditCard, FileText, Info } from 'lucide-react';

export type AccurateDocumentTab = 'details' | 'info' | 'estimate' | 'payment';

type AccurateDocumentSideTabsProps = {
  active: AccurateDocumentTab;
  onChange: (tab: AccurateDocumentTab) => void;
  ariaLabel?: string;
  showMobileLabels?: boolean;
};

const tabs: Array<{ id: AccurateDocumentTab; label: string; icon: typeof FileText }> = [
  { id: 'details', label: 'Rincian', icon: FileText },
  { id: 'info', label: 'Info lainnya', icon: Info },
  { id: 'estimate', label: 'Biaya / Estimasi', icon: Calculator },
  { id: 'payment', label: 'Pembayaran', icon: CreditCard },
];

export default function AccurateDocumentSideTabs({ active, onChange, ariaLabel = 'Bagian dokumen', showMobileLabels = false }: AccurateDocumentSideTabsProps) {
  return (
    <div className="flex border-b border-gray-300 bg-gray-100 lg:absolute lg:right-full lg:top-0 lg:z-10 lg:block lg:border-b-0 lg:bg-transparent" aria-label={ariaLabel}>
      {tabs.map(tab => {
        const Icon = tab.icon;
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            title={tab.label}
            aria-label={tab.label}
            aria-pressed={selected}
            onClick={() => onChange(tab.id)}
            className={`relative ${showMobileLabels ? 'flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px]' : 'grid h-10 w-10 place-items-center'} border border-gray-300 text-gray-800 lg:-mb-px lg:grid lg:h-[42px] lg:w-10 lg:flex-none lg:place-items-center ${
              selected
                ? 'z-10 border-r-white bg-white text-rose-500 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-rose-500 lg:-mr-px lg:shadow-[-2px_1px_3px_rgba(15,23,42,0.08)]'
                : 'bg-[#dedede] hover:bg-gray-100'
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            {showMobileLabels && <span className="max-w-full truncate px-1 lg:hidden">{tab.id === 'details' ? 'Detail' : tab.id === 'info' ? 'Catatan' : tab.id === 'estimate' ? 'Estimasi' : 'Faktur'}</span>}
          </button>
        );
      })}
    </div>
  );
}
