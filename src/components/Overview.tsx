import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { fetchHistory, fetchStats, ScanRecord, StatsResponse } from '../services/api';

interface OverviewProps {
  onAnalyzeUrl: (url: string) => void;
}

export const Overview: React.FC<OverviewProps> = ({ onAnalyzeUrl }) => {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [recentScans, setRecentScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextStats, nextHistory] = await Promise.all([
        fetchStats(),
        fetchHistory({ limit: 8 }),
      ]);
      setStats(nextStats);
      setRecentScans(nextHistory.scans);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Dashboard data is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const cards = stats ? [
    { label: 'Persisted URL scans', value: stats.total_scans.toLocaleString(), note: 'SQLite scan records' },
    { label: 'Non-legitimate predictions', value: stats.malicious_scans.toLocaleString(), note: 'Phishing, defacement, and malware classes' },
    { label: 'Suspicious risk-band scans', value: stats.suspicious_scans.toLocaleString(), note: 'Malicious probability between 0.30 and 0.70' },
    { label: 'Classifier', value: stats.model_info.name, note: `${stats.model_info.feature_count} model features` },
  ] : [];

  const trend = stats?.recent_trend ?? [];
  const maxDailyScans = Math.max(1, ...trend.map((day) => day.total));

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>LOCAL SQLITE TELEMETRY • MODEL METADATA FROM BACKEND</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Threat Operations Center</h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">Counts and trends below reflect stored local scans; no external threat feed is connected.</p>
        </div>
        <button onClick={() => void refresh()} className="flex items-center gap-2 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-200">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div role="alert" className="rounded border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      {loading && !stats && <p className="text-sm text-slate-500">Loading backend analytics…</p>}
      {!loading && !error && stats?.total_scans === 0 && (
        <div className="rounded-lg border border-cyan-200 dark:border-cyan-900 bg-cyan-50 dark:bg-cyan-950/20 p-4 text-xs text-cyan-800 dark:text-cyan-200">
          No scans have been recorded yet. Analyze a URL to begin building local history and analytics.
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => (
              <div key={card.label} className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{card.label}</div>
                <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{card.value}</div>
                <div className="text-[11px] text-slate-500">{card.note}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent scan records</h2>
              </div>
              {recentScans.length ? recentScans.map((scan) => (
                <div key={scan.id} className="py-2 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/60">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">{scan.prediction} · risk {(scan.risk_score * 100).toFixed(1)}%</div>
                    <div className="truncate text-[11px] font-mono text-slate-500" title={scan.url}>{scan.url}</div>
                    <div className="text-[10px] text-slate-500">{scan.created_at ? new Date(scan.created_at).toLocaleString() : 'Timestamp unavailable'}</div>
                  </div>
                  <button onClick={() => onAnalyzeUrl(scan.url)} className="shrink-0 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300">Re-analyze</button>
                </div>
              )) : <p className="text-xs text-slate-500">No persisted scans are available.</p>}
            </section>

            <section className="lg:col-span-5 bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Class distribution</h2>
              </div>
              {Object.entries({
                LEGITIMATE: stats.legitimate_scans,
                PHISHING: stats.phishing_scans,
                DEFACEMENT: stats.defacement_scans,
                MALWARE: stats.malware_scans,
              }).map(([label, count]) => (
                <div key={label}>
                  <div className="flex justify-between text-xs font-mono text-slate-600 dark:text-slate-300"><span>{label}</span><span>{count}</span></div>
                  <div className="mt-1 h-2 rounded bg-slate-100 dark:bg-slate-900 overflow-hidden">
                    <div className="h-full bg-cyan-500" style={{ width: `${stats.total_scans ? count / stats.total_scans * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
              <div className="pt-2 text-[11px] text-slate-500">Model evaluation accuracy is measured offline on a held-out dataset; it is not an accuracy estimate derived from these unlabeled scan records.</div>
            </section>
          </div>

          <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /><h2 className="text-sm font-bold text-slate-900 dark:text-white">Daily recorded scans</h2></div>
            {trend.length ? (
              <div className="flex items-end gap-2 h-36">
                {trend.map((day) => (
                  <div key={day.date} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${day.date}: ${day.total} scans`}>
                    <span className="text-[9px] font-mono text-slate-500">{day.total}</span>
                    <div className="w-full bg-cyan-500 rounded-t min-h-1" style={{ height: `${Math.max(2, day.total / maxDailyScans * 100)}%` }} />
                    <span className="text-[9px] text-slate-500">{day.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-slate-500">No date-grouped scan records yet.</p>}
          </section>
        </>
      )}
    </div>
  );
};
