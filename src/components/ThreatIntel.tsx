import React, { useEffect, useMemo, useState } from 'react';
import { Globe, RefreshCw, Search } from 'lucide-react';
import { fetchHistory, Prediction, ScanRecord } from '../services/api';

interface ThreatIntelProps {
  onAnalyzeUrl: (url: string) => void;
}

const CATEGORIES = ['all', 'PHISHING', 'DEFACEMENT', 'MALWARE', 'LEGITIMATE'] as const;

export const ThreatIntel: React.FC<ThreatIntelProps> = ({ onAnalyzeUrl }) => {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setScans((await fetchHistory({ limit: 100 })).scans);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Local scan records are unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  const filtered = useMemo(() => scans.filter((scan) => {
    const matchesCategory = category === 'all' || scan.prediction === category as Prediction;
    const needle = search.trim().toLowerCase();
    return matchesCategory && (!needle || `${scan.url} ${scan.prediction} ${scan.brand_assessment?.matched_brand ?? ''}`.toLowerCase().includes(needle));
  }), [scans, category, search]);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-600 dark:text-cyan-400 mb-1.5"><Globe className="w-4 h-4" /><span>LOCAL SCAN HISTORY ONLY</span></div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">Threat Intelligence</h1>
          <p className="mt-1 text-xs md:text-sm text-slate-500 dark:text-slate-400">No external threat-intelligence provider or feed is configured. This view does not claim IP, ASN, malware hash, or reputation data.</p>
        </div>
        <button onClick={() => void refresh()} className="flex items-center gap-2 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-200"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white dark:bg-[#121824] p-3 rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 max-w-md"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search local URL or brand assessment…" className="w-full pl-9 pr-3 py-2 rounded bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-200" /></div>
        <div className="flex flex-wrap gap-1.5">{CATEGORIES.map((filter) => <button key={filter} onClick={() => setCategory(filter)} className={`px-3 py-1.5 rounded text-xs font-mono uppercase ${filter === category ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300' : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'}`}>{filter}</button>)}</div>
      </div>

      {error && <div role="alert" className="rounded border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      <div className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 dark:bg-[#0B0F19] text-slate-500 uppercase text-[10px] border-b border-slate-200 dark:border-slate-800"><tr><th className="p-3">Scanned URL</th><th className="p-3">Local model class</th><th className="p-3">Non-legitimate probability</th><th className="p-3">Brand signal</th><th className="p-3 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading local records…</td></tr> : filtered.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">{scans.length ? 'No scan records match the selected filters.' : 'No locally scanned URLs are available.'}</td></tr> : filtered.map((scan) => (
                <tr key={scan.id}>
                  <td className="p-3 max-w-sm truncate text-slate-800 dark:text-slate-200" title={scan.url}>{scan.url}</td>
                  <td className="p-3">{scan.prediction}</td>
                  <td className="p-3">{(scan.malicious_probability * 100).toFixed(1)}%</td>
                  <td className="p-3">{scan.brand_assessment?.status ?? 'Not recorded'}</td>
                  <td className="p-3 text-right"><button onClick={() => onAnalyzeUrl(scan.url)} className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">Re-analyze</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">Showing up to 100 most recent local scan records. This is not an external intelligence feed.</div>
      </div>
    </div>
  );
};
