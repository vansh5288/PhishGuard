import React, { useState, useEffect } from 'react';
import { Search, X, Radar, ArrowRight } from 'lucide-react';
import { NavTab } from './Sidebar';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: NavTab) => void;
  onAnalyzeUrl: (url: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onAnalyzeUrl
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isUrlQuery = /^(https?:\/\/)?[^\s/]+\.[^\s/]+(?:\/[^\s]*)?$/i.test(query.trim());

  const navShortcuts: Array<{ id: NavTab; label: string }> = [
    { id: 'analyze', label: 'URL Analysis Studio' },
    { id: 'overview', label: 'Threat Operations Overview' },
    { id: 'threat-intel', label: 'Threat Intelligence · local scans' },
    { id: 'brand-protection', label: 'Brand Protection · registry' },
    { id: 'scan-history', label: 'Persisted Scan History' },
    { id: 'analytics', label: 'Analytics · stored scans' },
    { id: 'model-eval', label: 'Offline Model Evaluation' },
    { id: 'robustness-lab', label: 'Offline Robustness Results' },
    { id: 'settings', label: 'Settings · backend and theme' },
  ];

  const filteredNav = navShortcuts.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-xs flex items-start justify-center pt-20 px-4">
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 rounded-lg max-w-xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 transition-colors">
        {/* Search Input Bar */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Search className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a URL to analyze or search SecOps module..."
            className="flex-1 bg-transparent border-0 text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isUrlQuery) {
                onAnalyzeUrl(query.trim());
                onClose();
              }
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Action List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-xs">
          {isUrlQuery && (
            <div className="p-2">
              <button
                onClick={() => {
                  onAnalyzeUrl(query.trim());
                  onClose();
                }}
                className="w-full flex items-center justify-between p-2 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-left transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  <Radar className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="truncate">Execute Diagnostic On: {query}</span>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          )}

          {/* Core Modules navigation */}
          <div className="p-2 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500 font-semibold px-2 block">
              Core Operations Views
            </span>
            {filteredNav.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onClose();
                }}
                className="w-full flex items-center justify-between p-2 rounded hover:bg-slate-100 dark:hover:bg-[#162032] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors text-left"
              >
                <span>{item.label}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
