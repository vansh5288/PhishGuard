import React, { useState, useEffect } from 'react';
import { ActiveTab, ScanHistoryItem, StatsResponse } from './types';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { AnalyzePage } from './pages/AnalyzePage';
import { HistoryPage } from './pages/HistoryPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AboutPage } from './pages/AboutPage';
import {
  getLocalScans,
  saveLocalScan,
  clearLocalScans,
  computeStatsFromScans,
} from './services/storage';
import { fetchStats, fetchHistory, deleteScan } from './services/api';
import {
  LayoutDashboard,
  Search,
  History,
  BarChart3,
  BookOpen,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [stats, setStats] = useState<StatsResponse>(() => computeStatsFromScans([]));
  const [initialUrlForAnalyze, setInitialUrlForAnalyze] = useState<string>('');

  // Initialize scans on mount
  useEffect(() => {
    const loaded = getLocalScans();
    setScans(loaded);
    setStats(computeStatsFromScans(loaded));

    // Also attempt fetching from backend if backend is running
    fetchHistory()
      .then((serverHistory) => {
        if (serverHistory && serverHistory.length > 0) {
          setScans(serverHistory);
          setStats((current) => ({
            ...computeStatsFromScans(serverHistory),
            detection_accuracy: current.detection_accuracy,
            model_info: current.model_info,
          }));
        }
      })
      .catch(() => {
        // Backend not online yet, gracefully use local scans
      });

    fetchStats()
      .then((serverStats) => {
        if (serverStats) {
          setStats(serverStats);
        }
      })
      .catch(() => {
        // Backend not online yet, gracefully use computed stats
      });
  }, []);

  const handleScanCompleted = (newScan: ScanHistoryItem) => {
    const updated = saveLocalScan(newScan);
    setScans(updated);
    setStats((current) => ({
      ...computeStatsFromScans(updated),
      detection_accuracy: current.detection_accuracy,
      model_info: current.model_info,
    }));
  };

  const handleClearHistory = () => {
    clearLocalScans();
    setScans([]);
    setStats((current) => ({
      ...computeStatsFromScans([]),
      detection_accuracy: current.detection_accuracy,
      model_info: current.model_info,
    }));
  };

  const handleDeleteScan = async (scanId: string) => {
    const updated = scans.filter((item) => item.id !== scanId);
    setScans(updated);
    try {
      localStorage.setItem('phishguard_scan_history_v1', JSON.stringify(updated));
    } catch {
      // ignore
    }
    try {
      await deleteScan(scanId);
      const serverStats = await fetchStats();
      if (serverStats) {
        setStats(serverStats);
        return;
      }
    } catch {
      // fallback
    }
    setStats((current) => ({
      ...computeStatsFromScans(updated),
      detection_accuracy: current.detection_accuracy,
      model_info: current.model_info,
    }));
  };

  const handleRefreshHistory = async () => {
    try {
      const serverHistory = await fetchHistory();
      if (serverHistory) {
        setScans(serverHistory);
        setStats((current) => ({
          ...computeStatsFromScans(serverHistory),
          detection_accuracy: current.detection_accuracy,
          model_info: current.model_info,
        }));
        return;
      }
    } catch {
      // Backend unavailable, reload from local storage
      const local = getLocalScans();
      setScans(local);
      setStats((current) => ({
        ...computeStatsFromScans(local),
        detection_accuracy: current.detection_accuracy,
        model_info: current.model_info,
      }));
    }
  };

  const handleNavigateToAnalyzeWithUrl = (urlToAnalyze?: string) => {
    if (urlToAnalyze) {
      setInitialUrlForAnalyze(urlToAnalyze);
    }
    setActiveTab('analyze');
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-[#F9FAFB] flex flex-col">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onQuickScanClick={() => handleNavigateToAnalyzeWithUrl('')}
      />

      {/* Main Workspace with Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 pb-20 lg:pb-8">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardPage
                stats={stats}
                recentScans={scans}
                onNavigateToAnalyze={handleNavigateToAnalyzeWithUrl}
                onNavigateToHistory={() => setActiveTab('history')}
                onNavigateToAnalytics={() => setActiveTab('analytics')}
              />
            )}

            {activeTab === 'analyze' && (
              <AnalyzePage
                initialUrl={initialUrlForAnalyze}
                onScanCompleted={handleScanCompleted}
                onBackToDashboard={() => setActiveTab('dashboard')}
                onNavigateToHistory={() => setActiveTab('history')}
              />
            )}

            {activeTab === 'history' && (
              <HistoryPage
                scans={scans}
                onClearHistory={handleClearHistory}
                onNavigateToAnalyze={handleNavigateToAnalyzeWithUrl}
                onRefreshHistory={handleRefreshHistory}
                onDeleteScan={handleDeleteScan}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsPage stats={stats} scans={scans} />
            )}

            {activeTab === 'about' && <AboutPage />}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (< 1024px) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0c1322] border-t border-[#1F2937] px-2 py-1.5 flex items-center justify-around">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center py-1 px-2 text-[10px] font-mono transition-colors ${
            activeTab === 'dashboard' ? 'text-[#3B82F6] font-semibold' : 'text-[#9CA3AF]'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 mb-0.5" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => {
            setInitialUrlForAnalyze('');
            setActiveTab('analyze');
          }}
          className={`flex flex-col items-center py-1 px-2 text-[10px] font-mono transition-colors ${
            activeTab === 'analyze' ? 'text-[#3B82F6] font-semibold' : 'text-[#9CA3AF]'
          }`}
        >
          <Search className="w-4 h-4 mb-0.5" />
          <span>Analyze</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center py-1 px-2 text-[10px] font-mono transition-colors ${
            activeTab === 'history' ? 'text-[#3B82F6] font-semibold' : 'text-[#9CA3AF]'
          }`}
        >
          <History className="w-4 h-4 mb-0.5" />
          <span>History</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex flex-col items-center py-1 px-2 text-[10px] font-mono transition-colors ${
            activeTab === 'analytics' ? 'text-[#3B82F6] font-semibold' : 'text-[#9CA3AF]'
          }`}
        >
          <BarChart3 className="w-4 h-4 mb-0.5" />
          <span>Analytics</span>
        </button>

        <button
          onClick={() => setActiveTab('about')}
          className={`flex flex-col items-center py-1 px-2 text-[10px] font-mono transition-colors ${
            activeTab === 'about' ? 'text-[#3B82F6] font-semibold' : 'text-[#9CA3AF]'
          }`}
        >
          <BookOpen className="w-4 h-4 mb-0.5" />
          <span>About</span>
        </button>
      </nav>
    </div>
  );
}
