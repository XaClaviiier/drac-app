import { X } from 'lucide-react';

type ActiveFilterResetButtonProps = {
  active: boolean;
  onReset: () => void;
  className?: string;
};

export default function ActiveFilterResetButton({ active, onReset, className = '' }: ActiveFilterResetButtonProps) {
  if (!active) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onReset();
      }}
      className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-500 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 ${className}`}
      title="Clear Filter"
      aria-label="Clear Filter"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
