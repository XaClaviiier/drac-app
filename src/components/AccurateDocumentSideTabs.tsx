import { Calculator, CreditCard, FileText, Info } from 'lucide-react';

export type AccurateDocumentTab = 'details' | 'info' | 'estimate' | 'payment';

type AccurateDocumentSideTabsProps = {
  active: AccurateDocumentTab;
  onChange: (tab: AccurateDocumentTab) => void;
};

const tabs: Array<{ id: AccurateDocumentTab; label: string; icon: typeof FileText }> = [
  { id: 'details', label: 'Rincian', icon: FileText },
  { id: 'info', label: 'Info lainnya', icon: Info },
  { id: 'estimate', label: 'Biaya / Estimasi', icon: Calculator },
  { id: 'payment', label: 'Pembayaran', icon: CreditCard },
];

export default function AccurateDocumentSideTabs({ active, onChange }: AccurateDocumentSideTabsProps) {
  return (
    <div className="flex border-b border-gray-300 bg-gray-100 lg:absolute lg:right-full lg:top-0 lg:z-10 lg:block lg:border-b-0" aria-label="Bagian dokumen Work Order">
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
            className={`relative grid h-10 w-10 place-items-center border border-gray-300 text-gray-800 lg:-mb-px lg:h-[42px] lg:w-10 ${
              selected
                ? 'z-10 border-r-white bg-white text-rose-500 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-rose-500 lg:-mr-px'
                : 'bg-[#dedede] hover:bg-gray-100'
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
          </button>
        );
      })}
    </div>
  );
}
