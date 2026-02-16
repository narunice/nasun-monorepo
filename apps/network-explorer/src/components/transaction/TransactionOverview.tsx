import InfoRow from '../InfoRow';
import { SectionBox } from '../ui/SectionBox';
import { formatTimestamp } from '../../lib/format';

interface TransactionOverviewProps {
  digest: string;
  status: string | undefined;
  timestampMs: string | number | null | undefined;
  checkpoint: string | null | undefined;
  sender: string | undefined;
}

export default function TransactionOverview({
  digest,
  status,
  timestampMs,
  checkpoint,
  sender,
}: TransactionOverviewProps) {
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
      </div>
    </SectionBox>
  );
}
