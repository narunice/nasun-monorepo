import { Link } from 'react-router-dom';

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  status?: string;
  link?: string;
}

export default function InfoRow({ label, value, mono, copyable, status, link }: InfoRowProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center py-2 border-b border-slate-700 last:border-b-0">
      <div className="w-32 text-slate-400 text-sm flex-shrink-0">{label}</div>
      <div className={`flex-1 break-all ${mono ? 'font-mono text-sm' : ''}`}>
        {status ? (
          <span className={`px-2 py-1 rounded text-xs ${status === 'success' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
            {value}
          </span>
        ) : link ? (
          <Link to={link} className="text-nasun-c4 hover:underline">{value}</Link>
        ) : (
          value
        )}
        {copyable && (
          <button onClick={handleCopy} className="ml-2 text-slate-500 hover:text-nasun-white text-xs">
            [Copy]
          </button>
        )}
      </div>
    </div>
  );
}
