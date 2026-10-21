import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { FooterBar } from './components/FooterBar';
import { UrlAnalysisStudio } from './components/UrlAnalysisStudio';
import { Overview } from './components/Overview';
import { ThreatIntel } from './components/ThreatIntel';
import { BrandProtectionView } from './components/BrandProtectionView';
import { ScanHistoryView } from './components/ScanHistoryView';
import { AnalyticsView } from './components/AnalyticsView';
import { RobustnessLabView } from './components/RobustnessLabView';
import { SettingsView } from './components/SettingsView';
import { CommandPalette } from './components/CommandPalette';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('analyze');
  const [activeUrl, setActiveUrl] = useState<string>('');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleAnalyzeFromAnywhere = (url: string) => {
    setActiveUrl(url);
    setActiveTab('analyze');
    setIsMobileMenuOpen(false);
  };

  const mainRef = React.useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [activeTab]);


  // Keyboard shortcut for Command Palette (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getBreadcrumb = () => {
    switch (activeTab) {
      case 'analyze':
        return 'Core Operations';
      case 'overview':
        return 'Threat Ops / Global Telemetry';

      case 'threat-intel':
        return 'Threat Intel / IoC Repository';
      case 'brand-protection':
        return 'Brand Protection / Homoglyph Watchlist';
      case 'scan-history':
        return 'Audit Logs / Scan Forensics';
      case 'analytics':
        return 'Model Analytics / Logistic Regression Benchmark';
      case 'model-eval':
        return 'Model Evaluation / Calibration Curves';
      case 'robustness-lab':
        return 'Robustness Lab / Adversarial Sandbox';
      case 'settings':
        return 'SecOps Admin / System Configuration';
      default:
        return 'Core Operations';
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-[#090D14] text-slate-800 dark:text-[#DFE2ED] transition-colors">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-64 bg-white dark:bg-[#0B0F19] h-full shadow-2xl">

            <Sidebar
              activeTab={activeTab}
              onSelectTab={(tab) => {
                setActiveTab(tab);
                setIsMobileMenuOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <Header
          onOpenSearch={() => setIsCommandPaletteOpen(true)}
          onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
          breadcrumb={getBreadcrumb()}
        />

        {/* Scrollable View Container */}
        <main ref={mainRef} className="flex-1 overflow-y-auto pb-6">

          {activeTab === 'analyze' && (
            <UrlAnalysisStudio
              initialUrl={activeUrl}
            />
          )}
          {activeTab === 'overview' && (
            <Overview onAnalyzeUrl={handleAnalyzeFromAnywhere} />
          )}
          {activeTab === 'threat-intel' && (
            <ThreatIntel onAnalyzeUrl={handleAnalyzeFromAnywhere} />
          )}
          {activeTab === 'brand-protection' && (
            <BrandProtectionView onAnalyzeUrl={handleAnalyzeFromAnywhere} />
          )}
          {activeTab === 'scan-history' && (
            <ScanHistoryView
              onAnalyzeUrl={handleAnalyzeFromAnywhere}
            />
          )}
          {(activeTab === 'analytics' || activeTab === 'model-eval') && (
            <AnalyticsView variant={activeTab === 'model-eval' ? 'evaluation' : 'analytics'} />
          )}
          {activeTab === 'robustness-lab' && (
            <RobustnessLabView onAnalyzeUrl={handleAnalyzeFromAnywhere} />
          )}
          {activeTab === 'settings' && <SettingsView />}
        </main>

        {/* Bottom Fixed Status Footer */}
        <FooterBar />
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setIsCommandPaletteOpen(false);
        }}
        onAnalyzeUrl={handleAnalyzeFromAnywhere}
      />
    </div>
  );
}
