import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDynamicFields } from '../../lib/sui-client';
import { truncateId } from '../../lib/format';

interface ObjectDynamicFieldsProps {
  objectId: string;
}

function formatFieldName(name: { type: string; value: unknown }): string {
  if (typeof name.value === 'string') return name.value;
  if (typeof name.value === 'number' || typeof name.value === 'bigint') return String(name.value);
  try {
    return JSON.stringify(name.value);
  } catch {
    return String(name.value);
  }
}

export default function ObjectDynamicFields({ objectId }: ObjectDynamicFieldsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['dynamic-fields', objectId],
    queryFn: () => getDynamicFields(objectId),
  });

  if (isLoading) {
    return <div className="text-muted-foreground py-4">Loading dynamic fields...</div>;
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="text-muted-foreground text-sm py-4 text-center">
        No dynamic fields found for this object.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-border/20 bg-card/60 backdrop-blur-md">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border/20">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Name Type
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Object Type
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Object ID
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {data.data.map((field) => (
              <tr key={field.objectId} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 font-mono text-sm text-foreground">
                  {formatFieldName(field.name)}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                  {truncateId(field.name.type, 8, 4)}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                  {truncateId(field.objectType, 8, 4)}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/object/${field.objectId}`}
                    className="font-mono text-sm text-foreground hover:text-primary hover:underline"
                  >
                    {truncateId(field.objectId, 6, 4)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.hasNextPage && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          Showing first {data.data.length} fields — full pagination requires indexer.
        </p>
      )}
    </div>
  );
}
