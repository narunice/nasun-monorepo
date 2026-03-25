import InfoRow from '../InfoRow';
import { SectionBox } from '../ui/SectionBox';
import { formatBalance } from '../../lib/format';

interface AddressOverviewProps {
  address: string;
  totalBalance: string;
  objectCount: number;
}

export default function AddressOverview({
  address,
  totalBalance,
  objectCount,
}: AddressOverviewProps) {
  return (
    <SectionBox title="Overview" color="c4">
      <div className="grid grid-cols-1 gap-4">
        <InfoRow label="Address" value={address || '-'} mono copyable />
        <InfoRow label="Balance" value={`${formatBalance(totalBalance)} NSN`} />
        <InfoRow
          label="Owned Objects"
          value={`${objectCount} objects`}
        />
      </div>
    </SectionBox>
  );
}
