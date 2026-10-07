import React from 'react';
import {
  LayoutDashboard,
  Search,
  History,
  BarChart3,
  BookOpen,
  Shield,
  Server,
  Layers,
} from 'lucide-react';
import { ActiveTab } from '../../types';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  collapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const navItems: { tab: ActiveTab; label: string; icon: React.ElementType; description: string }[] = [
    {
      tab: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      description: 'System overview & telemetry',
    },
    {
      tab: 'analyze',
      label: 'Analyze URL',
      icon: Search,
      description: 'Deep lexical & ML inspection',
    },
    {
      tab: 'history',
      label: 'Scan History',
      icon: History,
      description: 'Audit logs & past scans',
    },
    {
      tab: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
      description: 'Recharts model visualizer',
    },
    {
      tab: 'about',
      label: 'About Project',
      icon: BookOpen,
      description: 'CSE capstone architecture',
    },
  ];

  return (
    <aside className="w-64 shrink-0 bg-[#0c1322] border-r border-[#1F2937] flex flex-col justify-between hidden lg:flex">
      {/* Top section */}
      <div>
        {/* Brand identity */}
        <div className="p-5 border-b border-[#1F2937]/80 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-[#111827] border border-[#374151] flex items-center justify-center text-[#3B82F6] shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-[#F9FAFB] flex items-center gap-1.5">
              PhishGuard
              <span className="text-[10px] font-mono font-medium text-[#22D3EE] bg-[#06B6D4]/10 px-1.5 py-0.2 rounded border border-[#06B6D4]/30">
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-[#9CA3AF] tracking-tight">Threat Intelligence System</p>
          </div>
        </div>

        {/* Navigation list */}
        <div className="p-3">
          <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#6B7280]">
            Core Modules
          </div>
          <nav className="space-y-1">
            {navItems.map(({ tab, label, icon: Icon, description }) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-left transition-colors group relative ${
                    isActive
                      ? 'bg-[#191f2f] text-[#F9FAFB] border border-[#374151]/80 shadow-sm'
                      : 'text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-[#141b2b]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-[#3B82F6]' : 'text-[#6B7280] group-hover:text-[#9CA3AF]'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium tracking-tight truncate">
                      {label}
                    </div>
                    <div className="text-[10px] text-[#6B7280] truncate font-normal">
                      {description}
                    </div>
                  </div>
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] shrink-0" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Academic Project Info Box */}
      <div className="p-4 m-3 rounded-lg border border-[#1F2937] bg-[#111827]">
        <div className="flex items-center gap-2 mb-1.5">
          <Layers className="w-3.5 h-3.5 text-[#06B6D4]" />
          <span className="text-xs font-semibold text-[#F9FAFB]">B.Tech Capstone</span>
        </div>
        <p className="text-[11px] text-[#9CA3AF] leading-relaxed">
          3rd-Year CSE / Data Science Project for ML-based Phishing URL Detection.
        </p>
        <div className="mt-3 pt-2.5 border-t border-[#1F2937] flex items-center justify-between text-[10px] font-mono text-[#6B7280]">
          <span>FastAPI Target:</span>
          <span className="text-[#22D3EE]">:8000</span>
        </div>
      </div>
    </aside>
  );
};
