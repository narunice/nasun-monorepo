/**
 * DrawingToolbar - Chart drawing tool selector
 *
 * Vertical mini-toolbar on the left side of the chart.
 * Tools: Horizontal Line, Trend Line, Fibonacci, Delete All
 */

import type { ActiveTool, DrawingType } from './drawings/types';

interface DrawingToolbarProps {
  activeTool: ActiveTool;
  onToolSelect: (tool: ActiveTool) => void;
  onDeleteAll: () => void;
  drawingCount: number;
}

interface ToolButton {
  id: DrawingType;
  icon: string;
  label: string;
}

const TOOLS: ToolButton[] = [
  { id: 'horizontal-line', icon: '\u2500', label: 'Horizontal Line' },
  { id: 'trend-line', icon: '\u2572', label: 'Trend Line' },
  { id: 'fibonacci', icon: 'Fib', label: 'Fibonacci Retracement' },
];

export function DrawingToolbar({ activeTool, onToolSelect, onDeleteAll, drawingCount }: DrawingToolbarProps) {
  const handleToolClick = (tool: DrawingType) => {
    onToolSelect(activeTool === tool ? null : tool);
  };

  return (
    <div className="flex flex-col gap-0.5 p-0.5 bg-theme-bg-tertiary/50 rounded-r border-r border-t border-b border-theme-border/30">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => handleToolClick(tool.id)}
          title={tool.label}
          className={`w-7 h-7 flex items-center justify-center text-xs rounded transition-colors ${
            activeTool === tool.id
              ? 'bg-pd1/30 text-pd3 ring-1 ring-pd1/50'
              : 'text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-secondary'
          }`}
        >
          {tool.icon}
        </button>
      ))}
      {/* Separator */}
      <div className="h-px bg-theme-border/30 mx-1" />
      {/* Delete All */}
      <button
        onClick={onDeleteAll}
        disabled={drawingCount === 0}
        title={`Delete all drawings (${drawingCount})`}
        className="w-7 h-7 flex items-center justify-center text-[10px] rounded text-theme-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Del
      </button>
    </div>
  );
}
