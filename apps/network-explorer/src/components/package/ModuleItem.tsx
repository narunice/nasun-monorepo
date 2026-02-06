import type { SuiMoveNormalizedModule } from '@mysten/sui/client';
import { formatMoveType, type MoveParam } from '../../lib/move-utils';

interface ModuleItemProps {
  name: string;
  module: SuiMoveNormalizedModule;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function ModuleItem({ name, module, isExpanded, onToggle }: ModuleItemProps) {
  const functionCount = Object.keys(module.exposedFunctions).length;
  const structCount = Object.keys(module.structs).length;

  return (
    <div className="border border-border/20 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between bg-card hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-foreground font-mono font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">
            {functionCount} functions, {structCount} structs
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-4 bg-muted/30 space-y-4">
          {/* Functions */}
          {functionCount > 0 && (
            <div>
              <h4 className="text-sm font-medium text-primary mb-2">Functions</h4>
              <div className="space-y-2">
                {Object.entries(module.exposedFunctions).map(([fnName, fn]) => (
                  <div key={fnName} className="bg-card border border-border/20 rounded p-2">
                    <div className="flex items-start gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        fn.visibility === 'Public' ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                      }`}>
                        {fn.visibility}
                      </span>
                      {fn.isEntry && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
                          entry
                        </span>
                      )}
                      <code className="text-foreground font-mono text-sm">{fnName}</code>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground font-mono">
                      ({fn.parameters.map((p, i) => (
                        <span key={i}>
                          {i > 0 && ', '}
                          {formatMoveType(p as MoveParam)}
                        </span>
                      ))})
                      {fn.return.length > 0 && (
                        <span className="text-muted-foreground">
                          {' → '}
                          {fn.return.map((r, i) => (
                            <span key={i}>
                              {i > 0 && ', '}
                              {formatMoveType(r as MoveParam)}
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
              <h4 className="text-sm font-medium text-primary mb-2">Structs</h4>
              <div className="space-y-2">
                {Object.entries(module.structs).map(([structName, struct]) => (
                  <div key={structName} className="bg-card border border-border/20 rounded p-2">
                    <div className="flex items-center gap-2">
                      <code className="text-foreground font-mono text-sm">{structName}</code>
                      {struct.abilities.abilities.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          has {struct.abilities.abilities.join(', ')}
                        </span>
                      )}
                    </div>
                    {struct.fields.length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground font-mono pl-2">
                        {struct.fields.map((field, i) => (
                          <div key={i}>
                            {field.name}: {formatMoveType(field.type as MoveParam)}
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
