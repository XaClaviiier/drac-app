import { CircleEllipsis, Paperclip, Printer, Save, Trash2 } from 'lucide-react';
import AccurateActionRailButton from './AccurateActionRailButton';

type RailAction = {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  form?: string;
};

type AccurateFormActionRailProps = {
  save: RailAction;
  print?: RailAction;
  attachment?: RailAction;
  more?: RailAction;
  remove?: RailAction;
  className?: string;
  ariaLabel?: string;
};

/**
 * Panel aksi baku untuk form transaksi desktop.
 * Urutan dan warna tidak diubah per modul: Simpan, Cetak, Lampiran,
 * Lainnya, lalu Hapus. Aksi yang belum berlaku tetap terlihat nonaktif.
 */
export default function AccurateFormActionRail({
  save,
  print,
  attachment,
  more,
  remove,
  className = '',
  ariaLabel = 'Aksi formulir',
}: AccurateFormActionRailProps) {
  const action = (value?: RailAction) => value?.onClick || (() => undefined);
  return (
    <aside aria-label={ariaLabel} className={`flex w-[72px] flex-col items-stretch gap-3 ${className}`}>
      <AccurateActionRailButton
        title={save.title || 'Simpan'}
        disabled={save.disabled}
        onClick={action(save)}
        type={save.type}
        form={save.form}
        tone="primary"
        icon={<Save className="h-7 w-7" />}
      />
      <AccurateActionRailButton
        title={print?.title || 'Cetak'}
        disabled={!print?.onClick || print.disabled}
        onClick={action(print)}
        icon={<Printer className="h-7 w-7" />}
      />
      <AccurateActionRailButton
        title={attachment?.title || 'Lampiran'}
        disabled={!attachment?.onClick || attachment.disabled}
        onClick={action(attachment)}
        icon={<Paperclip className="h-7 w-7" />}
      />
      <AccurateActionRailButton
        title={more?.title || 'Pilihan lainnya'}
        disabled={!more?.onClick || more.disabled}
        onClick={action(more)}
        tone="success"
        icon={<CircleEllipsis className="h-8 w-8" />}
      />
      <div className="mt-3">
        <AccurateActionRailButton
          title={remove?.title || 'Hapus'}
          disabled={!remove?.onClick || remove.disabled}
          onClick={action(remove)}
          tone="danger"
          showChevron={false}
          icon={<Trash2 className="h-7 w-7" />}
        />
      </div>
    </aside>
  );
}
