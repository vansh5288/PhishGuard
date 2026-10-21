import React from 'react';
import { Search, Moon, Sun, Shield, Menu } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  onOpenSearch: () => void;
  onToggleMobileMenu?: () => void;
  breadcrumb?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSearch,
  onToggleMobileMenu,
  breadcrumb = 'Core Operations'
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-14 bg-white dark:bg-[#090D14] border-b border-slate-200 dark:border-slate-800/80 px-4 md:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 transition-colors">
      {/* Left breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            aria-label="Toggle navigation menu"
            className="md:hidden text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="w-5 h-5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Shield className="w-3 h-3" />
          </div>
          <span className="font-semibold text-slate-900 dark:text-slate-200">PhishGuard</span>
          <span className="text-slate-400 dark:text-slate-600">/</span>
          <span className="text-slate-600 dark:text-slate-400 truncate">{breadcrumb}</span>
        </div>
      </div>

      {/* Middle search input / ⌘K trigger */}
      <div className="flex-1 max-w-xl mx-2 hidden sm:block">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 dark:bg-[#0F172A] dark:hover:bg-[#131D33] border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700/80 rounded px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 transition-all text-left group"
        >
          <div className="flex items-center gap-2.5 truncate">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
            <span className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
              Analyze suspicious link [Press ⌘K]...
            </span>
          </div>
          <kbd className="hidden lg:inline-flex items-center font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded px-1.5 py-0.5 shadow-2xs">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right control cluster */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
        {/* Functional Theme Toggle (Sun / Moon) */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 transition-all flex items-center justify-center"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform duration-200" />
          ) : (
            <Moon className="w-4 h-4 text-slate-700 hover:-rotate-12 transition-transform duration-200" />
          )}
        </button>
      </div>
    </header>
  );
};
