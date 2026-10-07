import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  Trash2,
  ExternalLink,
  Calendar,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ArrowUpDown,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { Prediction, ScanHistoryItem } from '../types';
import { ThreatBadge, ThreatLevelPill } from '../components/common/ThreatBadge';
import { DetailModal } from '../components/history/DetailModal';

interface HistoryPageProps {
  scans: ScanHistoryItem[];
  onClearHistory: () => void;
  onNavigateToAnalyze: (url?: string) => void;
  onRefreshHistory: () => void;
  onDeleteScan?: (scanId: string) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  scans,
  onClearHistory,
  onNavigateToAnalyze,
  onRefreshHistory,
  onDeleteScan,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [predictionFilter, setPredictionFilter] = useState<'all' | Prediction>('all');
  const [threatFilter, setThreatFilter] = useState<'all' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('all');
  const [selectedScan, setSelectedScan] = useState<ScanHistoryItem | null>(null);
  const [sortField, setSortField] = useState<'timestamp' | 'risk_score' | 'confidence'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filtered and sorted data
  const filteredScans = useMemo(() => {
    return scans
      .filter((item) => {
        const matchesSearch =
          searchTerm.trim() === '' ||
          item.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.id && item.id.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesPrediction =
          predictionFilter === 'all' ||
          item.prediction.toLowerCase() === predictionFilter.toLowerCase();

        const matchesThreat =
          threatFilter === 'all' ||
          (item.threat_level || '').toUpperCase() === threatFilter;

        return matchesSearch && matchesPrediction && matchesThreat;
      })
      .sort((a, b) => {
        if (sortField === 'timestamp') {
          const dateA = new Date(a.timestamp).getTime();
          const dateB = new Date(b.timestamp).getTime();
          return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        }
        if (sortField === 'risk_score') {
          return sortOrder === 'desc' ? b.risk_score - a.risk_score : a.risk_score - b.risk_score;
        }
        if (sortField === 'confidence') {
          return sortOrder === 'desc' ? b.confidence - a.confidence : a.confidence - b.confidence;
        }
        return 0;
      });
  }, [scans, searchTerm, predictionFilter, threatFilter, sortField, sortOrder]);

  const handleExportCSV = () => {
    if (scans.length === 0) return;
    const headers = ['ID', 'URL', 'Prediction', 'Risk Score', 'Confidence', 'Threat Level', 'Timestamp', 'Reasons'];
    const rows = scans.map((s) => [
      `"${s.id}"`,
      `"${s.url.replace(/"/g, '""')}"`,
      `"${s.prediction}"`,
      s.risk_score,
      s.confidence,
      `"${s.threat_level}"`,
      `"${s.timestamp}"`,
      `"${(s.reasons || []).join('; ').replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `phishguard_audit_log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggleSort = (field: 'timestamp' | 'risk_score' | 'confidence') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#F9FAFB] tracking-tight">
            Scan History & Audit Logs
          </h1>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Historical telemetry logs of all evaluated URLs with classification metrics and diagnostic features.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshHistory}
            className="px-3 py-1.5 text-xs font-mono text-[#9CA3AF] hover:text-[#F9FAFB] bg-[#111827] hover:bg-[#1F2937] rounded border border-[#374151] transition-colors flex items-center gap-1.5"
            title="Refresh history"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync</span>
          </button>
          <button
            onClick={handleExportCSV}
            disabled={scans.length === 0}
            className="px-3 py-1.5 text-xs font-semibold text-[#DCE2F7] hover:text-white bg-[#111827] hover:bg-[#1F2937] disabled:opacity-50 rounded border border-[#374151] transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[#06B6D4]" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onClearHistory}
            disabled={scans.length === 0}
            className="px-3 py-1.5 text-xs font-semibold text-[#F87171] hover:bg-[#EF4444]/15 disabled:opacity-50 rounded border border-[#EF4444]/30 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="rounded-lg bg-[#111827] border border-[#1F2937] p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search input */}
          <div className="flex-1 flex items-center gap-2 bg-[#0B0F19] px-3 py-2 rounded border border-[#374151] focus-within:border-[#3B82F6]">
            <Search className="w-4 h-4 text-[#6B7280] shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by URL, domain, or scan ID..."
              className="bg-transparent text-xs text-[#F9FAFB] placeholder-[#6B7280] w-full focus:outline-none font-mono"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs text-[#6B7280] hover:text-[#F9FAFB]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Verdict Filter */}
          <div className="flex items-center gap-1 p-1 bg-[#0B0F19] rounded border border-[#1F2937] shrink-0">
            <span className="text-[10px] font-mono uppercase text-[#6B7280] px-2 select-none">
              Verdict:
            </span>
            {(['all', 'phishing', 'defacement', 'malware', 'legitimate'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setPredictionFilter(filter)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors uppercase font-mono ${
                  predictionFilter === filter
                    ? 'bg-[#1F2937] text-[#F9FAFB] border border-[#374151]'
                    : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Threat Level Filter */}
          <div className="flex items-center gap-1 p-1 bg-[#0B0F19] rounded border border-[#1F2937] shrink-0">
            <span className="text-[10px] font-mono uppercase text-[#6B7280] px-2 select-none">
              Level:
            </span>
            {(['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setThreatFilter(lvl)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors font-mono ${
                  threatFilter === lvl
                    ? 'bg-[#1F2937] text-[#F9FAFB] border border-[#374151]'
                    : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Status Count Summary */}
        <div className="flex items-center justify-between text-xs text-[#6B7280] pt-1">
          <div className="font-mono">
            Showing <span className="text-[#F9FAFB] font-semibold">{filteredScans.length}</span> of{' '}
            <span className="text-[#F9FAFB]">{scans.length}</span> historical scans
          </div>
          {(searchTerm || predictionFilter !== 'all' || threatFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setPredictionFilter('all');
                setThreatFilter('all');
              }}
              className="text-[#3B82F6] hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-lg bg-[#111827] border border-[#1F2937] overflow-hidden">
        {filteredScans.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#1F2937] text-[#6B7280] flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-[#F9FAFB]">No matching scan records found</h3>
            <p className="text-xs text-[#9CA3AF] max-w-sm mx-auto">
              Try adjusting your query or filter parameters, or analyze a new URL in the scanner.
            </p>
            <button
              onClick={() => onNavigateToAnalyze()}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] rounded transition-colors"
            >
              Analyze New URL
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F19] border-b border-[#1F2937] font-mono text-[10px] uppercase text-[#6B7280]">
                <tr>
                  <th className="py-3 px-4">Scanned URL & Host</th>
                  <th className="py-3 px-4">Prediction</th>
                  <th
                    className="py-3 px-4 text-center cursor-pointer hover:text-[#F9FAFB]"
                    onClick={() => handleToggleSort('risk_score')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Risk Score</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 text-center cursor-pointer hover:text-[#F9FAFB]"
                    onClick={() => handleToggleSort('confidence')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Confidence</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4">Threat Level</th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-[#F9FAFB]"
                    onClick={() => handleToggleSort('timestamp')}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Timestamp</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {filteredScans.map((scan) => {
                  const dateStr = new Date(scan.timestamp).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  const confidencePct = Math.round(
                    scan.confidence > 1 ? scan.confidence : scan.confidence * 100
                  );

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
                      <td className="py-3 px-4 text-center font-mono font-bold tabular-nums">
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
                      <td className="py-3 px-4 text-center font-mono text-[#22D3EE] tabular-nums">
                        {confidencePct}%
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <ThreatLevelPill level={scan.threat_level || 'LOW'} />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[#9CA3AF]">
                        {dateStr}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setSelectedScan(scan)}
                            className="px-2.5 py-1 text-[11px] font-mono text-[#9CA3AF] hover:text-[#F9FAFB] bg-[#1F2937] hover:bg-[#374151] rounded border border-[#374151] transition-colors"
                          >
                            Inspect
                          </button>
                          <button
                            onClick={() => onNavigateToAnalyze(scan.url)}
                            className="px-2.5 py-1 text-[11px] font-mono text-[#3B82F6] hover:text-white hover:bg-[#3B82F6] rounded border border-[#3B82F6]/40 transition-colors"
                          >
                            Re-Scan
                          </button>
                          {onDeleteScan && (
                            <button
                              onClick={() => onDeleteScan(scan.id)}
                              className="px-2 py-1 text-[11px] font-mono text-[#F87171] hover:bg-[#EF4444]/20 rounded border border-[#EF4444]/30 transition-colors"
                              title="Delete scan"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Detail Modal */}
      <DetailModal
        scan={selectedScan}
        onClose={() => setSelectedScan(null)}
        onReScan={(url) => onNavigateToAnalyze(url)}
        onDelete={onDeleteScan}
      />
    </div>
  );
};
