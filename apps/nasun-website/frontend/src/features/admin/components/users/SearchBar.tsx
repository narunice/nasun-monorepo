import type { SearchField } from '../../types';

interface Props {
  q: string;
  field: SearchField;
  onQChange: (q: string) => void;
  onFieldChange: (field: SearchField) => void;
  onClear: () => void;
}

const FIELD_OPTIONS: { value: SearchField; label: string; placeholder: string }[] = [
  { value: 'auto',      label: 'Auto',       placeholder: 'X handle / email / wallet / Telegram ID / identityId' },
  { value: 'twitter',   label: 'Twitter',    placeholder: '@handle or handle' },
  { value: 'google',    label: 'Google',     placeholder: 'email@example.com' },
  { value: 'telegram',  label: 'Telegram',   placeholder: '@username or numeric ID' },
  { value: 'wallet',      label: 'Wallet',       placeholder: '0x...' },
  { value: 'identityid',  label: 'Identity ID',  placeholder: 'us-east-1:uuid-...' },
  { value: 'displayname', label: 'Display Name', placeholder: 'custom display name' },
];

export function SearchBar({ q, field, onQChange, onFieldChange, onClear }: Props) {
  const current = FIELD_OPTIONS.find((o) => o.value === field) ?? FIELD_OPTIONS[0];

  return (
    <div className="flex gap-2 items-center mb-4">
      <select
        value={field}
        onChange={(e) => onFieldChange(e.target.value as SearchField)}
        className="bg-neutral-800 text-neutral-200 text-sm border border-neutral-700 rounded px-2 py-2 min-w-[120px] focus:outline-none focus:border-neutral-500"
      >
        {FIELD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <div className="relative flex-1">
        <input
          type="text"
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder={current.placeholder}
          className="w-full bg-neutral-800 text-neutral-200 text-sm border border-neutral-700 rounded px-3 py-2 focus:outline-none focus:border-neutral-500 pr-8"
        />
        {q && (
          <button
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 text-lg leading-none"
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}
