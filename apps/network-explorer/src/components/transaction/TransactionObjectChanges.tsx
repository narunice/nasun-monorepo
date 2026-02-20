import { Link } from 'react-router-dom';
import { SectionBox } from '../ui/SectionBox';
import { Badge } from '../ui/Badge';
import { formatObjectType } from '../../lib/format';
import type { SuiObjectChange } from '@mysten/sui/client';

interface TransactionObjectChangesProps {
  objectChanges: SuiObjectChange[] | null | undefined;
}

export default function TransactionObjectChanges({ objectChanges }: TransactionObjectChangesProps) {
  if (!objectChanges || objectChanges.length === 0) return null;

  return (
    <SectionBox title={`Object Changes (${objectChanges.length})`} color="c6">
      <div className="space-y-2">
        {objectChanges.map((change, idx) => (
          <div
            key={idx}
            className="bg-muted/30 border border-border rounded-lg p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Badge variant={change.type as Parameters<typeof Badge>[0]['variant']}>
                {change.type}
              </Badge>
              {'objectId' in change && (
                <Link
                  to={`/object/${change.objectId}`}
                  className="font-mono text-sm text-foreground hover:text-primary hover:underline"
                >
                  {change.objectId}
                </Link>
              )}
            </div>
            {'objectType' in change && (
              <span className="text-muted-foreground text-sm truncate max-w-xs">
                {formatObjectType(change.objectType)}
              </span>
            )}
          </div>
        ))}
      </div>
    </SectionBox>
  );
}

