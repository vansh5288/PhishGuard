import React, { useEffect, useState } from 'react';
import { Download, Eye, History, RefreshCw, Search, X } from 'lucide-react';
import { ApiError, deleteScan, fetchHistory, fetchScanDetail, ScanRecord } from '../services/api';

const PAGE_SIZE = 20;
const FILTERS = ['all', 'PHISHING', 'LEGITIMATE', 'MALWARE', 'DEFACEMENT'] as const;

interface ScanHistoryViewProps {
  onAnalyzeUrl: (url: string) => void;
}

function csvField(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadCsv(scans: ScanRecord[]): void {
  const rows = [
    ['ID', 'URL', 'Prediction', 'Risk score (1 - P legitimate)', 'Confidence', 'Created at'],
    ...scans.map((scan) => [
      scan.id,
      scan.url,
      scan.prediction,
      scan.risk_score,
      scan.confidence ?? scan.probability,
      scan.created_at,
    ]),
  ];
  const blob = new Blob([rows.map((row) => row.map(csvField).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `phishguard-scan-history-${Date.now()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const ScanHistoryView: React.FC<ScanHistoryViewProps> = ({ onAnalyzeUrl }) => {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState<(typeof FILTERS)[number]>('all');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedScan, setSelectedScan] = useState<ScanRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const page = await fetchHistory({
        limit: PAGE_SIZE,
        offset,
        prediction: filterClass,
        search,
      });
      setScans(page.scans);
      setTotal(page.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load persisted scan history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [offset, filterClass, search]);

  const viewDetail = async (id: number) => {
    setDetailLoading(true);
    setError('');
    try {
      setSelectedScan(await fetchScanDetail(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to retrieve scan detail.');
    } finally {
      setDetailLoading(false);
    }
  };

  const removeScan = async (id: number) => {
    if (!window.confirm(`Delete scan ${id} from local history?`)) return;
    setError('');
    try {
      await deleteScan(id);
      await loadHistory();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to delete this scan.');
    }
  };

  const lastPageOffset = Math.max(0, Math.ceil(total / PAGE_SIZE - 1) * PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-600 dark:text-cyan-400 mb-1.5">
            <History className="w-4 h-4" />
            <span>PERSISTED SQLITE SCAN RECORDS</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Scan History &amp; Forensics</h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">History is stored by the backend in the local SQLite database.</p>
        </div>
        <div className="flex gap-2">
          <button disabled={!scans.length} onClick={() => downloadCsv(scans)} className="flex items-center gap-1.5 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-200 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Export current page CSV
          </button>
          <button onClick={() => void loadHistory()} className="flex items-center gap-1.5 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-200">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white dark:bg-[#121824] p-3 rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search scanned URL…" className="w-full bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded pl-9 pr-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-200" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((prediction) => (
            <button key={prediction} onClick={() => { setFilterClass(prediction); setOffset(0); }} className={`px-3 py-1.5 text-xs font-mono rounded uppercase ${filterClass === prediction ? 'bg-slate-800 text-white dark:bg-slate-700' : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'}`}>
              {prediction}
            </button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="rounded border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      <div className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-slate-50 dark:bg-[#0B0F19] text-slate-500 dark:text-slate-400 uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">URL</th><th className="py-3 px-4">Prediction</th><th className="py-3 px-4">Risk</th><th className="py-3 px-4">Confidence</th><th className="py-3 px-4">Time</th><th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-500">Loading records…</td></tr>
              ) : scans.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-500">No persisted scans match this search/filter.</td></tr>
              ) : scans.map((scan) => (
                <tr key={scan.id} className="hover:bg-slate-50 dark:hover:bg-[#162032]/50">
                  <td className="py-3 px-4 max-w-sm truncate text-slate-800 dark:text-slate-200" title={scan.url}>{scan.url}</td>
                  <td className="py-3 px-4"><span className="font-bold">{scan.prediction}</span></td>
                  <td className="py-3 px-4">{(scan.risk_score * 100).toFixed(1)}%</td>
                  <td className="py-3 px-4">{scan.confidence === null || scan.confidence === undefined ? 'Not recorded' : `${(scan.confidence * 100).toFixed(1)}%`}</td>
                  <td className="py-3 px-4 text-slate-500">{scan.created_at ? new Date(scan.created_at).toLocaleString() : 'Unknown'}</td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => void viewDetail(scan.id)} title="View persisted scan details" className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => onAnalyzeUrl(scan.url)} className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">Re-analyze</button>
                      <button onClick={() => void removeScan(scan.id)} title="Delete scan from local history" className="px-2 py-1 rounded border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-500">
          <span>{total ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}` : '0 scans'}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="px-3 py-1 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-40">Previous</button>
            <button disabled={offset >= lastPageOffset || loading} onClick={() => setOffset(Math.min(lastPageOffset, offset + PAGE_SIZE))} className="px-3 py-1 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      {(detailLoading || selectedScan) && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Scan details">
          <div className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-700 rounded-lg w-full max-w-3xl max-h-[85vh] overflow-auto p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-slate-900 dark:text-white">Persisted scan details</h2>
              <button onClick={() => setSelectedScan(null)} className="p-1 text-slate-500" aria-label="Close details"><X className="w-4 h-4" /></button>
            </div>
            {detailLoading ? <p className="text-sm text-slate-500">Loading scan details…</p> : (
              <pre className="text-xs whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">{JSON.stringify(selectedScan, null, 2)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
