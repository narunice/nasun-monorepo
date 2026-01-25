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
    <div className="flex flex-col sm:flex-row sm:items-center py-2 border-b border-border last:border-b-0">
      <div className="w-32 text-muted-foreground text-sm flex-shrink-0">{label}</div>
      <div className={`flex-1 break-all ${mono ? 'font-mono text-sm' : ''}`}>
        {status ? (
          <span className={`px-2 py-1 rounded text-xs ${status === 'success' ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-destructive/20 text-destructive'}`}>
            {value}
          </span>
        ) : link ? (
          <Link to={link} className="text-primary hover:underline">{value}</Link>
        ) : (
          <span className="text-foreground">{value}</span>
        )}
        {copyable && (
          <button onClick={handleCopy} className="ml-2 text-muted-foreground hover:text-foreground text-xs">
            [Copy]
          </button>
        )}
      </div>
    </div>
  );
}
