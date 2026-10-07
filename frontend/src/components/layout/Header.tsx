import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Cpu, ExternalLink, Activity } from 'lucide-react';
import { ActiveTab } from '../../types';
import { checkBackendHealth, API_BASE_URL } from '../../services/api';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onQuickScanClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onQuickScanClick,
}) => {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const checkStatus = async () => {
    setIsChecking(true);
    try {
      const res = await checkBackendHealth();
      setBackendOnline(res.isOnline);
    } catch {
      setBackendOnline(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const navLinks: { tab: ActiveTab; label: string }[] = [
    { tab: 'dashboard', label: 'Dashboard' },
    { tab: 'analyze', label: 'Analyze URL' },
    { tab: 'history', label: 'Scan History' },
    { tab: 'analytics', label: 'Analytics' },
    { tab: 'about', label: 'About Project' },
  ];

  return (
    <header className="h-16 border-b border-[#1F2937] bg-[#0B0F19]/95 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 flex items-center justify-between">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <div className="w-8 h-8 rounded bg-gradient-to-br from-[#3B82F6] to-[#06B6D4] flex items-center justify-center shadow-md shadow-blue-500/10">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-[#F9FAFB] group-hover:text-blue-400 transition-colors">
              PhishGuard
            </span>
          </div>
        </button>
      </div>

      {/* Zone 2: Clean 4-6 text navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
        {navLinks.map(({ tab, label }) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`transition-colors relative py-1 focus:outline-none whitespace-nowrap ${
                isActive
                  ? 'text-[#F9FAFB] font-semibold'
                  : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
              }`}
            >
              {label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B82F6] rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1-2 primary actions */}
      <div className="flex items-center gap-3">
        {/* Backend health status badge */}
        <button
          onClick={checkStatus}
          title={`FastAPI endpoint: ${API_BASE_URL} (Click to re-ping)`}
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono bg-[#111827] border border-[#1F2937] text-[#9CA3AF] hover:border-[#374151] transition-colors"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              backendOnline === true
                ? 'bg-[#10B981]'
                : backendOnline === false
                ? 'bg-[#EF4444]'
                : 'bg-[#F59E0B]'
            } ${isChecking ? 'animate-ping' : ''}`}
          />
          <span>API:</span>
          <span
            className={
              backendOnline === true
                ? 'text-[#34D399]'
                : backendOnline === false
                ? 'text-[#F87171]'
                : 'text-[#FBBF24]'
            }
          >
            {backendOnline === true ? 'ONLINE' : backendOnline === false ? ':8000 (STANDBY)' : 'CONNECTING'}
          </span>
        </button>

        {/* Primary CTA */}
        <button
          onClick={() => {
            if (onQuickScanClick) onQuickScanClick();
            else setActiveTab('analyze');
          }}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] active:bg-[#1D4ED8] rounded transition-colors shadow-sm whitespace-nowrap flex items-center gap-1.5"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>New Scan</span>
        </button>
      </div>
    </header>
  );
};
