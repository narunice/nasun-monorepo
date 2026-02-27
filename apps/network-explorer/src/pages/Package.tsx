import { useState, useMemo, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPackageModules } from '../lib/sui-client';
import { useDocumentTitle } from '../hooks';
import { Card } from '../components/ui/Card';
import { SectionBox } from '../components/ui/SectionBox';
import CopyableId from '../components/CopyableId';
import ModuleItem from '../components/package/ModuleItem';

const MODULES_PER_PAGE = 20;

export default function Package() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle(id ? `Package ${id.slice(0, 10)}...` : 'Package');
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    setCurrentPage(0);
    setExpandedModule(null);
  }, [id]);

  const { data: modules, isLoading, error } = useQuery({
    queryKey: ['package', id],
    queryFn: () => getPackageModules(id!),
    enabled: !!id,
  });

  const sortedModuleNames = useMemo(
    () => (modules ? Object.keys(modules).sort() : []),
    [modules]
  );

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
  const totalFunctions = sortedModuleNames.reduce(
    (sum, name) => sum + Object.keys(modules[name].exposedFunctions).length,
    0
  );
  const totalStructs = sortedModuleNames.reduce(
    (sum, name) => sum + Object.keys(modules[name].structs).length,
    0
  );

  const totalPages = Math.ceil(sortedModuleNames.length / MODULES_PER_PAGE);
  const startIndex = currentPage * MODULES_PER_PAGE;
  const endIndex = Math.min(startIndex + MODULES_PER_PAGE, sortedModuleNames.length);
  const pagedModuleNames = sortedModuleNames.slice(startIndex, endIndex);
  const showPagination = sortedModuleNames.length > MODULES_PER_PAGE;

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
          <div className="text-2xl font-mono text-foreground">{sortedModuleNames.length}</div>
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
      <SectionBox
        title="Modules"
        rightTitle={showPagination
          ? `${startIndex + 1}-${endIndex} of ${sortedModuleNames.length} modules`
          : `${sortedModuleNames.length} modules`}
        color="c4"
      >
        <div className="space-y-2">
          {pagedModuleNames.map((name) => (
            <ModuleItem
              key={name}
              name={name}
              module={modules[name]}
              isExpanded={expandedModule === name}
              onToggle={() => setExpandedModule(expandedModule === name ? null : name)}
            />
          ))}
        </div>
        {showPagination && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => { setCurrentPage((p) => p - 1); setExpandedModule(null); }}
              disabled={currentPage === 0}
              className="px-4 py-2 bg-card border border-border hover:bg-primary/10 disabled:bg-muted disabled:text-muted-foreground disabled:border-border/50 rounded-xl transition-all active:scale-[0.97] text-foreground"
            >
              &larr; Previous
            </button>
            <span className="text-muted-foreground">
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              onClick={() => { setCurrentPage((p) => p + 1); setExpandedModule(null); }}
              disabled={currentPage >= totalPages - 1}
              className="px-4 py-2 bg-card border border-border hover:bg-primary/10 disabled:bg-muted disabled:text-muted-foreground disabled:border-border/50 rounded-xl transition-all active:scale-[0.97] text-foreground"
            >
              Next &rarr;
            </button>
          </div>
        )}
      </SectionBox>
    </>
  );
}
