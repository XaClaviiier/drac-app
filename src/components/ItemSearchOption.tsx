type ItemSearchOptionProps = {
  name: string;
  code: string;
  selected?: boolean;
};

export default function ItemSearchOption({ name, code, selected = false }: ItemSearchOptionProps) {
  return (
    <span className="block min-w-0">
      <span className={`block truncate text-[13px] font-medium leading-5 ${selected ? "text-blue-900" : "text-slate-900"}`}>
        {name}
      </span>
      <span className="block truncate font-mono text-[11px] leading-4 text-blue-700">
        {code}
      </span>
    </span>
  );
}
