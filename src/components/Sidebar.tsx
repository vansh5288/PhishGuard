import React, { useEffect, useState } from 'react';
import {
  LayoutGrid,
  Radar,
  ShieldAlert,
  ShieldCheck,
  History,
  BarChart3,
  Network,
  FlaskConical,
  Settings,
  Shield
} from 'lucide-react';
import { fetchApplicationConfig } from '../services/api';

export type NavTab = 
  | 'overview'
  | 'analyze'
  | 'threat-intel'
  | 'brand-protection'
  | 'scan-history'
  | 'analytics'
  | 'model-eval'
  | 'robustness-lab'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  collapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  const [apiState, setApiState] = useState<'checking' | 'connected' | 'offline'>('checking');

  useEffect(() => {
    let mounted = true;
    fetchApplicationConfig().then(
      () => { if (mounted) setApiState('connected'); },
      () => { if (mounted) setApiState('offline'); },
    );
    return () => { mounted = false; };
  }, []);

  const navItems: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'analyze', label: 'Analyze URL', icon: Radar },
    { id: 'threat-intel', label: 'Threat Intelligence', icon: ShieldAlert },
    { id: 'brand-protection', label: 'Brand Protection', icon: ShieldCheck },
    { id: 'scan-history', label: 'Scan History', icon: History },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'model-eval', label: 'Model Evaluation', icon: Network },
    { id: 'robustness-lab', label: 'Robustness Lab', icon: FlaskConical },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      aria-label="Sidebar Navigation"
      className="w-64 bg-white dark:bg-[#0B0F19] border-r border-slate-200 dark:border-slate-800/80 flex flex-col h-screen shrink-0 select-none transition-colors"
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 stroke-[2.2]" />
          </div>
          <span className="font-semibold tracking-wider text-base text-slate-900 dark:text-white font-mono">
            PhishGuard
          </span>
        </div>
        <span className="text-[11px] font-mono font-medium text-cyan-600 dark:text-cyan-400/90 bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/50 px-1.5 py-0.5 rounded">
          v2.4-ML
        </span>
      </div>

      {/* Nav Section Label */}
      <div className="px-5 pt-5 pb-2">
        <span className="text-[10px] font-mono tracking-widest text-slate-500 dark:text-slate-500 font-semibold uppercase">
          THREAT OPS CORE
        </span>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition-all group ${
                isActive
                  ? 'bg-emerald-50 dark:bg-[#15232D] text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 shadow-2xs dark:shadow-[inset_0_0_12px_rgba(16,185,129,0.08)]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#121824]'
              }`}
            >
              <Icon
                className={`w-4 h-4 transition-colors ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                }`}
              />
              <span className="truncate">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_#10B981]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Node Diagnostics */}
      <div className="border-t border-slate-200 dark:border-slate-800/80 p-3.5 bg-slate-50/80 dark:bg-[#090D14]/70 transition-colors">
        {/* Connection status */}
        <div className="bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800/80 rounded px-2.5 py-2 flex items-center justify-between text-[11px] shadow-2xs">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${apiState === 'connected' ? 'bg-emerald-500 dark:bg-emerald-400' : apiState === 'offline' ? 'bg-rose-500' : 'bg-amber-400 animate-pulse'}`} />
            <div className="flex flex-col">
              <span className={`font-mono font-medium text-[11px] leading-tight ${apiState === 'connected' ? 'text-emerald-700 dark:text-emerald-400' : apiState === 'offline' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                API {apiState}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">FastAPI backend</span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/70 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/60">
            Local Research
          </span>
        </div>
      </div>
    </aside>
  );
};
