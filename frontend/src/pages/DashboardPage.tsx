import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Activity,
  ArrowRight,
  TrendingUp,
  Cpu,
  Database,
  ExternalLink,
  Lock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { ScanHistoryItem, StatsResponse } from '../types';
import { ThreatBadge, ThreatLevelPill } from '../components/common/ThreatBadge';
import { DetailModal } from '../components/history/DetailModal';

interface DashboardPageProps {
  stats: StatsResponse;
  recentScans: ScanHistoryItem[];
  onNavigateToAnalyze: (initialUrl?: string) => void;
  onNavigateToHistory: () => void;
  onNavigateToAnalytics: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  stats,
  recentScans,
  onNavigateToAnalyze,
  onNavigateToHistory,
  onNavigateToAnalytics,
}) => {
  const [quickUrl, setQuickUrl] = useState('');
  const [selectedScan, setSelectedScan] = useState<ScanHistoryItem | null>(null);

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    onNavigateToAnalyze(quickUrl.trim());
  };

  const maliciousPercentage = stats.total_scans > 0
    ? Math.round((stats.malicious_detected / stats.total_scans) * 100)
    : 0;
  const modelMetrics = stats.model_info?.metrics;
  const predictionTime = stats.model_info?.prediction_time;
  const formattedPredictionTime = predictionTime === undefined
    ? 'Not available'
    : `${(predictionTime * 1000).toPrecision(3)} ms / test row`;

  const sampleUrls = [
    { label: 'Phishing Brand Mimic', url: 'http://paypal-security-update.account-verification-alert.top/login.php' },
    { label: 'Raw IP Threat', url: 'http://192.168.12.84:8080/secure-banking-portal/auth' },
    { label: 'Legitimate Site', url: 'https://github.com/features/actions' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Welcome / Headline banner */}
      <div className="rounded-xl bg-gradient-to-r from-[#141b2b] via-[#111827] to-[#0c1322] border border-[#1F2937] p-6 lg:p-8 relative overflow-hidden">
        {/* Subtle decorative grid overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(#3B82F6_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.07] pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 mb-2 text-[#06B6D4] text-xs font-mono tracking-wider uppercase">
            <span className="w-2 h-2 rounded-full bg-[#06B6D4] animate-pulse" />
            Locally Trained ML-Powered URL Classification
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#F9FAFB] tracking-tight">
            PhishGuard Threat Intelligence
          </h1>
          <p className="mt-2 text-sm text-[#9CA3AF] leading-relaxed">
            URL feature extraction and machine learning classification for legitimate, phishing, defacement, and malware categories.
          </p>

          {/* Quick URL input form */}
          <form onSubmit={handleQuickSubmit} className="mt-6">
            <div className="flex flex-col sm:flex-row items-stretch gap-2.5 bg-[#0B0F19] p-1.5 rounded-lg border border-[#374151] focus-within:border-[#3B82F6] transition-all shadow-inner">
              <div className="flex items-center gap-2 px-3 flex-1 min-w-0">
                <Search className="w-4 h-4 text-[#6B7280] shrink-0" />
                <span className="font-mono text-xs text-[#06B6D4] select-none hidden sm:inline">
                  url:
                </span>
                <input
                  type="text"
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                  placeholder="Enter suspicious URL or domain (e.g. https://...)"
                  className="bg-transparent text-sm text-[#F9FAFB] placeholder-[#6B7280] w-full focus:outline-none font-mono"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] active:bg-[#1D4ED8] rounded-md transition-colors whitespace-nowrap flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Analyze URL</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick test buttons */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#6B7280]">Quick Test Samples:</span>
              {sampleUrls.map((sample, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onNavigateToAnalyze(sample.url)}
                  className="px-2 py-1 rounded text-[11px] font-mono text-[#9CA3AF] hover:text-[#F9FAFB] bg-[#111827] hover:bg-[#1F2937] border border-[#1F2937] transition-colors"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>

      {/* Key Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Scans */}
        <div className="p-5 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#374151] transition-colors">
          <div className="flex items-center justify-between text-[#9CA3AF]">
            <span className="text-xs font-medium uppercase font-mono tracking-wider">Total Scans</span>
            <Activity className="w-4 h-4 text-[#3B82F6]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono tracking-tight text-[#F9FAFB] tabular-nums">
              {stats.total_scans}
            </span>
            <span className="text-xs text-[#10B981] font-mono flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> Stored
            </span>
          </div>
          <p className="mt-2 text-xs text-[#6B7280]">URL scans in history</p>
        </div>

        {/* Metric 2: Malicious Detected */}
        <div className="p-5 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#374151] transition-colors">
          <div className="flex items-center justify-between text-[#9CA3AF]">
            <span className="text-xs font-medium uppercase font-mono tracking-wider">Malicious Detected</span>
            <ShieldAlert className="w-4 h-4 text-[#EF4444]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono tracking-tight text-[#F87171] tabular-nums">
              {stats.malicious_detected}
            </span>
            <span className="text-xs font-mono text-[#F87171] bg-[#EF4444]/10 px-1.5 py-0.5 rounded border border-[#EF4444]/20">
              {maliciousPercentage}% rate
            </span>
          </div>
          <p className="mt-2 text-xs text-[#6B7280]">Phishing, defacement, and malware predictions</p>
        </div>

        {/* Metric 3: Safe URLs */}
        <div className="p-5 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#374151] transition-colors">
          <div className="flex items-center justify-between text-[#9CA3AF]">
            <span className="text-xs font-medium uppercase font-mono tracking-wider">Safe URLs</span>
            <ShieldCheck className="w-4 h-4 text-[#10B981]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono tracking-tight text-[#34D399] tabular-nums">
              {stats.safe_urls}
            </span>
            <span className="text-xs font-mono text-[#10B981]">
              Predicted
            </span>
          </div>
          <p className="mt-2 text-xs text-[#6B7280]">Benign legitimate domains</p>
        </div>

        {/* Metric 4: Detection Accuracy */}
        <div className="p-5 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#374151] transition-colors">
          <div className="flex items-center justify-between text-[#9CA3AF]">
            <span className="text-xs font-medium uppercase font-mono tracking-wider">Detection Accuracy</span>
            <Cpu className="w-4 h-4 text-[#06B6D4]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono tracking-tight text-[#22D3EE] tabular-nums">
              {stats.detection_accuracy > 0 ? `${stats.detection_accuracy.toFixed(1)}%` : 'N/A'}
            </span>
            <span className="text-xs font-mono text-[#06B6D4]">
              Model
            </span>
          </div>
          <p className="mt-2 text-xs text-[#6B7280]">Held-out evaluation accuracy</p>
        </div>
      </div>

      {/* Middle Section: Risk Distribution + ML Model Specs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Distribution Card */}
        <div className="lg:col-span-2 p-5 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="flex items-center justify-between border-b border-[#1F2937] pb-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#F9FAFB]">Threat Risk Distribution</h2>
              <p className="text-xs text-[#6B7280]">Breakdown of classified threat levels</p>
            </div>
            <button
              onClick={onNavigateToAnalytics}
              className="text-xs font-medium text-[#3B82F6] hover:text-blue-400 flex items-center gap-1 transition-colors"
            >
              Full Analytics <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Critical */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
                <span className="text-[#F87171] font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#EF4444]" /> Critical Risk (80–100)
                </span>
                <span className="text-[#F9FAFB]">
                  {stats.threat_distribution.critical} scans (
                  {stats.total_scans > 0 ? Math.round((stats.threat_distribution.critical / stats.total_scans) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 bg-[#0B0F19] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#EF4444] rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.total_scans > 0 ? (stats.threat_distribution.critical / stats.total_scans) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* High */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
                <span className="text-[#F87171] font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#EF4444]/80" /> High Risk (60–79)
                </span>
                <span className="text-[#F9FAFB]">
                  {stats.threat_distribution.high} scans (
                  {stats.total_scans > 0 ? Math.round((stats.threat_distribution.high / stats.total_scans) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 bg-[#0B0F19] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#EF4444]/80 rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.total_scans > 0 ? (stats.threat_distribution.high / stats.total_scans) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Medium / Warning */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
                <span className="text-[#FBBF24] font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B]" /> Medium Suspicious (30–59)
                </span>
                <span className="text-[#F9FAFB]">
                  {stats.threat_distribution.medium} scans (
                  {stats.total_scans > 0 ? Math.round((stats.threat_distribution.medium / stats.total_scans) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 bg-[#0B0F19] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#F59E0B] rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.total_scans > 0 ? (stats.threat_distribution.medium / stats.total_scans) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Low / Safe */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
                <span className="text-[#34D399] font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" /> Low Risk / Legitimate (0–29)
                </span>
                <span className="text-[#F9FAFB]">
                  {stats.threat_distribution.low} scans (
                  {stats.total_scans > 0 ? Math.round((stats.threat_distribution.low / stats.total_scans) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 bg-[#0B0F19] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#10B981] rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.total_scans > 0 ? (stats.threat_distribution.low / stats.total_scans) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Model Architecture & Defense Intel Card */}
        <div className="p-5 rounded-lg bg-[#111827] border border-[#1F2937] flex flex-col justify-between">
          <div>
            <div className="border-b border-[#1F2937] pb-3 mb-4">
              <h2 className="text-sm font-semibold text-[#F9FAFB] flex items-center gap-2">
                <Database className="w-4 h-4 text-[#06B6D4]" />
                Inference Engine
              </h2>
              <p className="text-xs text-[#6B7280]">Model pipeline & telemetry specifications</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2 rounded bg-[#0B0F19] border border-[#1F2937]">
                <span className="text-[#9CA3AF]">Core Classifier:</span>
                <span className="font-mono text-[#F9FAFB] font-semibold">
                  {stats.model_info?.name || 'Not available'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-[#0B0F19] border border-[#1F2937]">
                <span className="text-[#9CA3AF]">Extracted Features:</span>
                <span className="font-mono text-[#22D3EE] font-semibold">
                  {stats.model_info?.feature_count ?? 0} URL features
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-[#0B0F19] border border-[#1F2937]">
                <span className="text-[#9CA3AF]">Test prediction time:</span>
                <span className="font-mono text-[#10B981] font-semibold">
                  {formattedPredictionTime}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-[#0B0F19] border border-[#1F2937]">
                <span className="text-[#9CA3AF]">F1-Score:</span>
                <span className="font-mono text-[#F9FAFB] font-semibold">
                  {modelMetrics?.F1 === undefined ? 'Not available' : modelMetrics.F1.toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1F2937]">
            <button
              onClick={() => onNavigateToAnalyze()}
              className="w-full py-2 px-3 text-xs font-semibold text-[#F9FAFB] bg-[#1F2937] hover:bg-[#374151] rounded border border-[#374151] transition-colors flex items-center justify-center gap-2"
            >
              <span>Launch Full Analyzer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Scans Table Section */}
      <div className="rounded-lg bg-[#111827] border border-[#1F2937] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#1F2937] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#F9FAFB]">Recent URL Scans</h2>
            <p className="text-xs text-[#6B7280]">Latest URL telemetry and verdicts</p>
          </div>
          <button
            onClick={onNavigateToHistory}
            className="text-xs font-medium text-[#3B82F6] hover:text-blue-400 flex items-center gap-1 transition-colors"
          >
            View All History <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentScans.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#6B7280]">
            No recent scans recorded yet. Enter a URL above to perform the first analysis.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F19] border-b border-[#1F2937] font-mono text-[10px] uppercase text-[#6B7280]">
                <tr>
                  <th className="py-3 px-4">Scanned URL</th>
                  <th className="py-3 px-4">Prediction</th>
                  <th className="py-3 px-4 text-center">Risk Score</th>
                  <th className="py-3 px-4">Threat Level</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {recentScans.slice(0, 5).map((scan) => {
                  const dateStr = new Date(scan.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr
                      key={scan.id}
                      onClick={() => setSelectedScan(scan)}
                      className="hover:bg-[#141b2b] transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 max-w-xs sm:max-w-md truncate font-mono text-[#DCE2F7]">
                        <span className="group-hover:text-[#22D3EE] transition-colors">
                          {scan.url}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <ThreatBadge prediction={scan.prediction} />
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold tabular-nums">
                        <span
                          className={
                            scan.risk_score > 70
                              ? 'text-[#F87171]'
                              : scan.risk_score > 30
                              ? 'text-[#FBBF24]'
                              : 'text-[#34D399]'
                          }
                        >
                          {scan.risk_score}/100
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <ThreatLevelPill level={scan.threat_level || 'LOW'} />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[#6B7280]">
                        {dateStr}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedScan(scan);
                          }}
                          className="px-2.5 py-1 text-[11px] font-mono text-[#9CA3AF] hover:text-[#F9FAFB] bg-[#1F2937] hover:bg-[#374151] rounded border border-[#374151] transition-colors"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail inspection modal */}
      <DetailModal
        scan={selectedScan}
        onClose={() => setSelectedScan(null)}
        onReScan={(url) => onNavigateToAnalyze(url)}
      />
    </div>
  );
};
