import React, { useState, useEffect } from 'react';
import {
  Search,
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Cpu,
  Lock,
  Unlock,
  Hash,
  Globe,
  Share2,
  Layers,
  Sparkles,
} from 'lucide-react';
import { AnalysisResponse, ScanHistoryItem } from '../types';
import { analyzeUrl, ApiConnectionError, API_BASE_URL } from '../services/api';
import { RiskGauge } from '../components/common/RiskGauge';
import { ThreatBadge, ThreatLevelPill } from '../components/common/ThreatBadge';
import { ApiErrorBanner } from '../components/common/ApiErrorBanner';
import { UncertaintyAssessment } from '../components/common/UncertaintyAssessment';
import { BrandAssessment } from '../components/common/BrandAssessment';

interface AnalyzePageProps {
  initialUrl?: string;
  onScanCompleted: (result: ScanHistoryItem) => void;
  onBackToDashboard: () => void;
  onNavigateToHistory: () => void;
}

export const AnalyzePage: React.FC<AnalyzePageProps> = ({
  initialUrl = '',
  onScanCompleted,
  onBackToDashboard,
  onNavigateToHistory,
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);

  // If initialUrl is passed from quick scan, trigger scan automatically if clean
  useEffect(() => {
    if (initialUrl && initialUrl.trim()) {
      setUrl(initialUrl);
      handleExecuteScan(initialUrl);
    }
  }, [initialUrl]);

  const handleExecuteScan = async (targetUrl: string) => {
    const cleanUrl = targetUrl.trim();
    if (!cleanUrl) return;

    setIsLoading(true);
    setApiError(null);
    setLoadingStep('Contacting PhishGuard FastAPI backend...');

    try {
      const response = await analyzeUrl(cleanUrl);
      setResult(response);
      onScanCompleted({
        ...response,
        id: response.id || 'scan_' + Date.now(),
        timestamp: response.timestamp || new Date().toISOString(),
      });
    } catch (err: unknown) {
      console.error('Scan execution error:', err);
      if (err instanceof ApiConnectionError) {
        setApiError(err.message);
      } else {
        setApiError((err as Error)?.message || 'Unable to connect to PhishGuard API');
      }
      setResult(null);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    handleExecuteScan(url);
  };

  const handleCopyReport = () => {
    if (!result) return;
    const report = `PHISHGUARD THREAT AUDIT REPORT
Target URL: ${result.url}
Verdict: ${result.prediction.toUpperCase()}
Risk Score: ${result.risk_score}/100
Threat Level: ${result.threat_level}
Confidence: ${Math.round(result.confidence > 1 ? result.confidence : result.confidence * 100)}%
Audit Date: ${result.timestamp || new Date().toISOString()}

Diagnostic Findings:
${result.reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}
`;
    navigator.clipboard.writeText(report);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const samplePresets = [
    {
      label: 'PayPal Impersonation',
      url: 'http://paypal-verification-account-security-update.suspicious-domain.xyz/login',
      category: 'phishing',
    },
    {
      label: 'Banking IP Trap',
      url: 'http://123.45.67.89:8080/secure-banking-portal/auth',
      category: 'phishing',
    },
    {
      label: 'Microsoft Auth Mimic',
      url: 'http://login.microsoftonline.com.account-update.info/auth',
      category: 'phishing',
    },
    {
      label: 'Legitimate GitHub',
      url: 'https://github.com/security',
      category: 'legitimate',
    },
    {
      label: 'Legitimate Google',
      url: 'https://support.google.com/accounts',
      category: 'legitimate',
    },
  ];

  const isMaliciousVerdict = result !== null && result.prediction !== 'legitimate';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToDashboard}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9CA3AF] hover:text-[#F9FAFB] transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Dashboard</span>
        </button>

        <span className="text-xs font-mono text-[#6B7280]">
          Target API: <span className="text-[#22D3EE]">{API_BASE_URL}</span>
        </span>
      </div>

      {/* URL Input Box */}
      <div className="rounded-xl bg-[#111827] border border-[#1F2937] p-5 sm:p-6 shadow-md">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-[#F9FAFB] tracking-tight">
            Analyze URL for Phishing Threats
          </h1>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Submit a suspected phishing URL to execute lexical parsing, domain structural analysis, and machine learning classification.
          </p>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch gap-2.5 bg-[#0B0F19] p-1.5 rounded-lg border border-[#374151] focus-within:border-[#3B82F6] transition-all">
            <div className="flex items-center gap-2 px-3 flex-1 min-w-0">
              <Globe className="w-4 h-4 text-[#06B6D4] shrink-0" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/login or suspicious web address"
                className="bg-transparent text-sm text-[#F9FAFB] placeholder-[#6B7280] w-full focus:outline-none font-mono py-1"
                disabled={isLoading}
              />
              {url && (
                <button
                  type="button"
                  onClick={() => setUrl('')}
                  className="text-xs text-[#6B7280] hover:text-[#F9FAFB] px-1"
                >
                  Clear
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="px-6 py-2.5 text-xs font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] active:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap flex items-center justify-center gap-2 shadow-sm"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Analyze URL</span>
                </>
              )}
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            <span className="text-[#6B7280] text-[11px] font-mono mr-1">Load Preset:</span>
            {samplePresets.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setUrl(sample.url);
                  handleExecuteScan(sample.url);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                  sample.category === 'phishing'
                    ? 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#F87171] hover:bg-[#EF4444]/20'
                    : 'bg-[#10B981]/10 border-[#10B981]/30 text-[#34D399] hover:bg-[#10B981]/20'
                }`}
              >
                {sample.label}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Loading State Animation */}
      {isLoading && (
        <div className="rounded-xl bg-[#111827] border border-[#1F2937] p-8 text-center space-y-4">
          <div className="inline-flex p-3 rounded-full bg-[#3B82F6]/10 border border-[#3B82F6]/30 text-[#3B82F6] animate-pulse">
            <Cpu className="w-8 h-8 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#F9FAFB]">
              Inspecting Target URL Telemetry
            </h3>
            <p className="text-xs text-[#22D3EE] font-mono mt-1">
              {loadingStep || 'Executing feature extraction pipeline...'}
            </p>
          </div>
          <div className="max-w-md mx-auto w-full h-1.5 bg-[#0B0F19] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#3B82F6] via-[#06B6D4] to-[#3B82F6] rounded-full animate-pulse w-full" />
          </div>
          <p className="text-[11px] text-[#6B7280]">
            Extracting URL features & evaluating the trained classifier
          </p>
        </div>
      )}

      {/* Error State: "Unable to connect to PhishGuard API" with Retry Button */}
      {apiError && !isLoading && (
        <ApiErrorBanner
          onRetry={() => handleExecuteScan(url)}
          detail={apiError}
        />
      )}

      {/* Comprehensive Result Card */}
      {result && !isLoading && (
        <div className="rounded-xl bg-[#111827] border border-[#1F2937] shadow-xl overflow-hidden animate-in fade-in duration-200">
          {/* Verdict Banner Header */}
          <div
            className={`p-6 border-b flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
              isMaliciousVerdict
                ? 'bg-gradient-to-r from-[#93000a]/30 via-[#111827] to-[#111827] border-[#EF4444]/30'
                : 'bg-gradient-to-r from-[#003640]/30 via-[#111827] to-[#111827] border-[#10B981]/30'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-lg border shrink-0 ${
                  isMaliciousVerdict
                    ? 'bg-[#EF4444]/15 border-[#EF4444]/40 text-[#EF4444]'
                    : 'bg-[#10B981]/15 border-[#10B981]/40 text-[#10B981]'
                }`}
              >
                {isMaliciousVerdict ? (
                  <ShieldAlert className="w-8 h-8" />
                ) : (
                  <ShieldCheck className="w-8 h-8" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${
                      isMaliciousVerdict ? 'text-[#F87171]' : 'text-[#34D399]'
                    }`}
                  >
                    {isMaliciousVerdict
                      ? `${result.prediction.toUpperCase()} DETECTED`
                      : 'LEGITIMATE URL'}
                  </span>
                  <ThreatLevelPill level={result.threat_level} />
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-[#9CA3AF]">
                  <span>Target:</span>
                  <span className="font-mono text-[#DCE2F7] break-all">
                    {result.url}
                  </span>
                </div>
              </div>
            </div>

            {/* Gauge inside banner */}
            <div className="shrink-0 self-center md:self-auto">
              <RiskGauge
                score={result.risk_score}
                confidence={result.confidence}
                size={120}
                showConfidence={true}
              />
            </div>
          </div>

          {/* Diagnostic Sections */}
          <div className="p-6 space-y-6">
            <BrandAssessment assessment={result.brand_assessment} />
            <UncertaintyAssessment assessment={result.uncertainty} />

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-[#0B0F19] rounded-lg border border-[#1F2937]">
                <div className="text-[10px] uppercase font-mono text-[#6B7280]">
                  Verdict
                </div>
                <div className="mt-1 font-mono text-sm font-semibold capitalize text-[#F9FAFB]">
                  {result.prediction}
                </div>
              </div>
              <div className="p-3 bg-[#0B0F19] rounded-lg border border-[#1F2937]">
                <div className="text-[10px] uppercase font-mono text-[#6B7280]">
                  Risk Score
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-[#F9FAFB]">
                  {result.risk_score} / 100
                </div>
              </div>
              <div className="p-3 bg-[#0B0F19] rounded-lg border border-[#1F2937]">
                <div className="text-[10px] uppercase font-mono text-[#6B7280]">
                  Threat Level
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-[#F9FAFB]">
                  {result.threat_level}
                </div>
              </div>
              <div className="p-3 bg-[#0B0F19] rounded-lg border border-[#1F2937]">
                <div className="text-[10px] uppercase font-mono text-[#6B7280]">
                  Model Confidence
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-[#22D3EE]">
                  {Math.round(result.confidence > 1 ? result.confidence : result.confidence * 100)}%
                </div>
              </div>
            </div>

            {/* Suspicious Reasons / Explanations */}
            <div>
              <h2 className="text-sm font-semibold text-[#F9FAFB] flex items-center gap-2 mb-3">
                <AlertTriangle
                  className={`w-4 h-4 ${isMaliciousVerdict ? 'text-[#EF4444]' : 'text-[#10B981]'}`}
                />
                Explanation of Suspicious URL Features
              </h2>

              {result.reasons && result.reasons.length > 0 ? (
                <div className="space-y-2">
                  {result.reasons.map((reason, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs flex items-start gap-3 ${
                        isMaliciousVerdict
                          ? 'bg-[#141b2b] border-[#1F2937] text-[#DCE2F7]'
                          : 'bg-[#141b2b] border-[#1F2937] text-[#DCE2F7]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                          isMaliciousVerdict ? 'bg-[#EF4444]' : 'bg-[#10B981]'
                        }`}
                      />
                      <span className="leading-relaxed">{reason}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[#0B0F19] border border-[#1F2937] text-xs text-[#9CA3AF]">
                  No feature contributions were returned for this scan.
                </div>
              )}
            </div>

            {/* Extracted Feature Indicators Grid */}
            {result.features && (
              <div>
                <h2 className="text-sm font-semibold text-[#F9FAFB] flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-[#06B6D4]" />
                  Model Input Features
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {Object.entries(result.features).map(([feature, value]) => (
                    <div key={feature} className="p-3 bg-[#0B0F19] rounded-lg border border-[#1F2937]">
                      <div className="text-[10px] text-[#6B7280]">
                        {feature.replaceAll('_', ' ')}
                      </div>
                      <div className="font-mono text-sm font-bold text-[#F9FAFB] mt-1">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Actions Toolbar */}
            <div className="pt-4 border-t border-[#1F2937] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={onBackToDashboard}
                  className="px-4 py-2 text-xs font-medium text-[#9CA3AF] hover:text-[#F9FAFB] bg-[#0B0F19] hover:bg-[#1F2937] rounded border border-[#374151] transition-colors"
                >
                  Back to Dashboard
                </button>
                <button
                  onClick={onNavigateToHistory}
                  className="px-4 py-2 text-xs font-medium text-[#9CA3AF] hover:text-[#F9FAFB] bg-[#0B0F19] hover:bg-[#1F2937] rounded border border-[#374151] transition-colors"
                >
                  View Scan History
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyReport}
                  className="px-4 py-2 text-xs font-mono text-[#DCE2F7] hover:text-white bg-[#1F2937] hover:bg-[#374151] rounded border border-[#374151] transition-colors flex items-center gap-1.5"
                >
                  {copiedReport ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedReport ? 'Report Copied' : 'Copy Audit Report'}</span>
                </button>
                <button
                  onClick={() => {
                    setUrl('');
                    setResult(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] rounded transition-colors"
                >
                  Scan Another URL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
