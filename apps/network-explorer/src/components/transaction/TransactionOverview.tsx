import { Link } from 'react-router-dom';
import InfoRow from '../InfoRow';
import { SectionBox } from '../ui/SectionBox';
import { formatTimestamp, truncateId } from '../../lib/format';
import type { SuiTransaction } from '@mysten/sui/client';

interface MoveCallSummary {
  package: string;
  module: string;
  function: string;
  argCount: number;
}

function parseMoveCall(tx: SuiTransaction): MoveCallSummary | null {
  if ('MoveCall' in tx) {
    return {
      package: tx.MoveCall.package,
      module: tx.MoveCall.module,
      function: tx.MoveCall.function,
      argCount: tx.MoveCall.arguments?.length ?? 0,
    };
  }
  return null;
}

interface TransactionOverviewProps {
  digest: string;
  status: string | undefined;
  timestampMs: string | number | null | undefined;
  checkpoint: string | null | undefined;
  sender: string | undefined;
  transactions?: readonly SuiTransaction[] | null;
}

export default function TransactionOverview({
  digest,
  status,
  timestampMs,
  checkpoint,
  sender,
  transactions,
}: TransactionOverviewProps) {
  // Extract Move Calls from PTB transactions array
  const moveCalls = transactions
    ? transactions.map(parseMoveCall).filter((mc): mc is MoveCallSummary => mc !== null)
    : [];

  return (
    <SectionBox title="Overview" color="c4">
      <div className="grid grid-cols-1 gap-4">
        <InfoRow label="Digest" value={digest} mono copyable />
        <InfoRow label="Status" value={status || '-'} status={status} />
        <InfoRow label="Timestamp" value={formatTimestamp(timestampMs)} />
        <InfoRow label="Checkpoint" value={checkpoint || '-'} />
        <InfoRow
          label="Sender"
          value={sender || '-'}
          mono
          link={sender ? `/address/${sender}` : undefined}
        />
        {moveCalls.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-start py-3 border-b border-border last:border-b-0">
            <div className="w-40 text-muted-foreground text-sm font-medium flex-shrink-0 mb-1 sm:mb-0 sm:pt-0.5">
              Move Calls
            </div>
            <div className="flex-1 flex flex-col gap-1">
              {moveCalls.map((mc, idx) => (
                <div key={idx} className="flex items-center gap-1 flex-wrap text-sm">
                  <Link
                    to={`/package/${mc.package}`}
                    className="font-mono text-foreground hover:text-primary hover:underline"
                  >
                    {truncateId(mc.package, 6, 4)}
                  </Link>
                  <span className="text-muted-foreground">::</span>
                  <span className="font-mono text-foreground">{mc.module}</span>
                  <span className="text-muted-foreground">::</span>
                  <span className="font-mono text-primary">{mc.function}</span>
                  {mc.argCount > 0 && (
                    <span className="text-muted-foreground text-xs">
                      ({mc.argCount} arg{mc.argCount !== 1 ? 's' : ''})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionBox>
  );
}
