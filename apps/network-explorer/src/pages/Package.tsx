import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPackageModules } from '../lib/sui-client';
import { Card } from '../components/ui/Card';
import { SectionBox } from '../components/ui/SectionBox';
import CopyableId from '../components/CopyableId';
import ModuleItem from '../components/package/ModuleItem';

export default function Package() {
  const { id } = useParams<{ id: string }>();
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const { data: modules, isLoading, error } = useQuery({
    queryKey: ['package', id],
    queryFn: () => getPackageModules(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Loading package...</div>;
  }

  if (error || !modules) {
    return (
      <>
        <div className="mb-6">
          <Link to="/" className="text-primary hover:underline">
            &larr; Back to Home
          </Link>
        </div>
        <Card variant="default" className="p-6 border-destructive/50">
          <h2 className="text-lg font-semibold text-destructive">Package Not Found</h2>
          <p className="text-muted-foreground mt-2">
            Could not load package: {id}
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            This may not be a valid package ID, or the package may not exist on this network.
          </p>
        </Card>
      </>
    );
  }

  const moduleNames = Object.keys(modules);
  const totalFunctions = moduleNames.reduce(
    (sum, name) => sum + Object.keys(modules[name].exposedFunctions).length,
    0
  );
  const totalStructs = moduleNames.reduce(
    (sum, name) => sum + Object.keys(modules[name].structs).length,
    0
  );

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-primary hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      {/* Package Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Package</h1>
        <CopyableId value={id!} shorten={0} />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Modules</div>
          <div className="text-2xl font-mono text-foreground">{moduleNames.length}</div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Functions</div>
          <div className="text-2xl font-mono text-green-600 dark:text-green-400">{totalFunctions}</div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Structs</div>
          <div className="text-2xl font-mono text-foreground">{totalStructs}</div>
        </Card>
      </div>

      {/* Modules List */}
      <SectionBox title="Modules" rightTitle={`${moduleNames.length} modules`} color="c4">
        <div className="space-y-2">
          {moduleNames.sort().map((name) => (
            <ModuleItem
              key={name}
              name={name}
              module={modules[name]}
              isExpanded={expandedModule === name}
              onToggle={() => setExpandedModule(expandedModule === name ? null : name)}
            />
          ))}
        </div>
      </SectionBox>
    </>
  );
}
