import { Link } from 'react-router-dom';
import { SectionBox } from '../ui/SectionBox';
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
            <div>
              <span className={`px-2 py-1 rounded text-xs mr-2 ${getChangeTypeColor(change.type)}`}>
                {change.type}
              </span>
              {'objectId' in change && (
                <Link
                  to={`/object/${change.objectId}`}
                  className="font-mono text-sm text-primary hover:underline"
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

function getChangeTypeColor(type: string) {
  switch (type) {
    case 'created':
      return 'bg-green-500/20 text-green-600 dark:text-green-400';
    case 'mutated':
      return 'bg-primary/20 text-primary';
    case 'deleted':
      return 'bg-destructive/20 text-destructive';
    case 'wrapped':
      return 'bg-secondary/20 text-secondary';
    case 'published':
      return 'bg-blue-500/20 text-blue-600 dark:text-blue-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}
