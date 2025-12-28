import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPackageModules } from '../lib/sui-client';
import { Card } from '../components/ui/Card';
import { SectionBox } from '../components/ui/SectionBox';
import CopyableId from '../components/CopyableId';
import type { SuiMoveNormalizedModule } from '@mysten/sui/client';

// Type for function parameter
interface FunctionParam {
  MutableReference?: { Struct?: { address: string; module: string; name: string } };
  Reference?: { Struct?: { address: string; module: string; name: string } };
  Struct?: { address: string; module: string; name: string };
  TypeParameter?: number;
  Vector?: unknown;
  U8?: boolean;
  U64?: boolean;
  U128?: boolean;
  Bool?: boolean;
  Address?: boolean;
}

function formatType(param: FunctionParam | string): string {
  if (typeof param === 'string') return param;

  if (param.MutableReference) {
    const inner = param.MutableReference.Struct;
    if (inner) return `&mut ${inner.module}::${inner.name}`;
    return '&mut ???';
  }
  if (param.Reference) {
    const inner = param.Reference.Struct;
    if (inner) return `&${inner.module}::${inner.name}`;
    return '&???';
  }
  if (param.Struct) {
    return `${param.Struct.module}::${param.Struct.name}`;
  }
  if (param.TypeParameter !== undefined) return `T${param.TypeParameter}`;
  if (param.Vector) return `vector<...>`;
  if (param.U8) return 'u8';
  if (param.U64) return 'u64';
  if (param.U128) return 'u128';
  if (param.Bool) return 'bool';
  if (param.Address) return 'address';

  return JSON.stringify(param);
}

interface ModuleItemProps {
  name: string;
  module: SuiMoveNormalizedModule;
  isExpanded: boolean;
  onToggle: () => void;
}

function ModuleItem({ name, module, isExpanded, onToggle }: ModuleItemProps) {
  const functionCount = Object.keys(module.exposedFunctions).length;
  const structCount = Object.keys(module.structs).length;

  return (
    <div className="border border-nasun-c5/30 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between bg-nasun-c6/30 hover:bg-nasun-c6/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-nasun-c4 font-mono font-medium">{name}</span>
          <span className="text-xs text-nasun-white/40">
            {functionCount} functions, {structCount} structs
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-nasun-white/60 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-4 bg-nasun-black/50 space-y-4">
          {/* Functions */}
          {functionCount > 0 && (
            <div>
              <h4 className="text-sm font-medium text-nasun-c3 mb-2">Functions</h4>
              <div className="space-y-2">
                {Object.entries(module.exposedFunctions).map(([fnName, fn]) => (
                  <div key={fnName} className="bg-nasun-c6/20 rounded p-2">
                    <div className="flex items-start gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        fn.visibility === 'Public' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {fn.visibility}
                      </span>
                      {fn.isEntry && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                          entry
                        </span>
                      )}
                      <code className="text-nasun-white font-mono text-sm">{fnName}</code>
                    </div>
                    <div className="mt-1 text-xs text-nasun-white/60 font-mono">
                      ({fn.parameters.map((p, i) => (
                        <span key={i}>
                          {i > 0 && ', '}
                          {formatType(p as FunctionParam)}
                        </span>
                      ))})
                      {fn.return.length > 0 && (
                        <span className="text-nasun-c3">
                          {' → '}
                          {fn.return.map((r, i) => (
                            <span key={i}>
                              {i > 0 && ', '}
                              {formatType(r as FunctionParam)}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Structs */}
          {structCount > 0 && (
            <div>
              <h4 className="text-sm font-medium text-nasun-c4 mb-2">Structs</h4>
              <div className="space-y-2">
                {Object.entries(module.structs).map(([structName, struct]) => (
                  <div key={structName} className="bg-nasun-c6/20 rounded p-2">
                    <div className="flex items-center gap-2">
                      <code className="text-nasun-white font-mono text-sm">{structName}</code>
                      {struct.abilities.abilities.length > 0 && (
                        <span className="text-xs text-nasun-white/40">
                          has {struct.abilities.abilities.join(', ')}
                        </span>
                      )}
                    </div>
                    {struct.fields.length > 0 && (
                      <div className="mt-1 text-xs text-nasun-white/60 font-mono pl-2">
                        {struct.fields.map((field, i) => (
                          <div key={i}>
                            {field.name}: {formatType(field.type as FunctionParam)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Package() {
  const { id } = useParams<{ id: string }>();
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const { data: modules, isLoading, error } = useQuery({
    queryKey: ['package', id],
    queryFn: () => getPackageModules(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="text-nasun-white/60">Loading package...</div>;
  }

  if (error || !modules) {
    return (
      <>
        <div className="mb-6">
          <Link to="/" className="text-nasun-c4 hover:underline">
            &larr; Back to Home
          </Link>
        </div>
        <Card variant="c3" className="p-6">
          <h2 className="text-lg font-semibold text-red-400">Package Not Found</h2>
          <p className="text-nasun-white/60 mt-2">
            Could not load package: {id}
          </p>
          <p className="text-nasun-white/40 text-sm mt-1">
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
        <Link to="/" className="text-nasun-c4 hover:underline">
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
        <Card variant="c4" className="p-4">
          <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Modules</div>
          <div className="text-2xl font-mono text-nasun-white">{moduleNames.length}</div>
        </Card>
        <Card variant="c3" className="p-4">
          <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Functions</div>
          <div className="text-2xl font-mono text-nasun-c3">{totalFunctions}</div>
        </Card>
        <Card variant="c5" className="p-4">
          <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Structs</div>
          <div className="text-2xl font-mono text-nasun-white">{totalStructs}</div>
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
