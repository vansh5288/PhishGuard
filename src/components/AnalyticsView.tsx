import React, { useEffect, useState } from 'react';
import { Activity, BarChart3, RefreshCw } from 'lucide-react';
import { fetchModelEvaluation, fetchStats, JsonArtifact, StatsResponse } from '../services/api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function metricValue(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'Unavailable';
}

function metricNumber(record: Record<string, unknown> | null, name: string): unknown {
  if (!record) return undefined;
  return record[name] ?? record[name.toLowerCase()];
}

export const AnalyticsView: React.FC<{ variant?: 'analytics' | 'evaluation' }> = ({ variant = 'analytics' }) => {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [evaluation, setEvaluation] = useState<JsonArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextStats, nextEvaluation] = await Promise.all([fetchStats(), fetchModelEvaluation()]);
      setStats(nextStats);
      setEvaluation(nextEvaluation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Analytics artifacts are unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const testMetrics = evaluation && isRecord(evaluation.test_metrics) ? evaluation.test_metrics : null;
  const rawLabels = evaluation?.confusion_matrix_labels ?? testMetrics?.confusion_matrix_labels;
  const labels = Array.isArray(rawLabels)
    ? rawLabels.filter((label): label is string => typeof label === 'string')
    : [];
  const rawMatrix = testMetrics?.confusion_matrix ?? evaluation?.confusion_matrix;
  const confusionMatrix = Array.isArray(rawMatrix)
    ? rawMatrix.filter((row): row is number[] =>
      Array.isArray(row) && row.every((cell) => typeof cell === 'number' && Number.isFinite(cell)))
    : [];
  const trend = stats?.recent_trend ?? [];
  const maxDailyScans = Math.max(1, ...trend.map((day) => day.total));

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-600 dark:text-cyan-400 mb-1.5"><BarChart3 className="w-4 h-4" /><span>REAL SQLITE TELEMETRY &amp; OFFLINE MODEL ARTIFACTS</span></div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">{variant === 'evaluation' ? 'Model Evaluation' : 'Analytics'}</h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">Operational statistics come from saved scans; model metrics come from the checked-in offline evaluation report.</p>
        </div>
        <button onClick={() => void refresh()} className="flex items-center gap-2 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-200"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      {error && <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{error}</div>}
      {loading && <p className="text-sm text-slate-500">Loading analytics…</p>}
      {stats && evaluation && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['Stored scans', stats.total_scans.toLocaleString()],
              ['Offline test accuracy', metricValue(metricNumber(testMetrics, 'accuracy'))],
              ['Offline macro F1', metricValue(metricNumber(testMetrics, 'f1_macro'))],
              ['Offline macro precision', metricValue(metricNumber(testMetrics, 'precision_macro'))],
            ].map(([label, value]) => (
              <div key={label} className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
                <div className="text-[10px] uppercase font-mono text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white">{value}</div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3"><Activity className="w-4 h-4 text-cyan-600" /><h2 className="text-sm font-bold text-slate-900 dark:text-white">Offline evaluation confusion matrix</h2></div>
              {confusionMatrix.length && labels.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-center text-xs font-mono">
                    <thead><tr><th className="p-2 text-left text-slate-500">ACTUAL / PREDICTED</th>{labels.map((label) => <th key={label} className="p-2 text-slate-500">{label}</th>)}</tr></thead>
                    <tbody>{confusionMatrix.map((row, index) => (
                      <tr key={index} className="border-t border-slate-100 dark:border-slate-800">
                        <th className="p-2 text-left text-slate-700 dark:text-slate-300">{labels[index] ?? `Class ${index}`}</th>
                        {row.map((count, cell) => <td key={cell} className={`p-2 ${index === cell ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>{count.toLocaleString()}</td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="text-xs text-slate-500">The evaluation artifact does not include a usable confusion matrix.</p>}
              <p className="text-[11px] text-slate-500">Rows are actual labels; columns are model predictions. These values are offline held-out results, not measurements of unlabeled live scans.</p>
            </section>

            <section className="lg:col-span-5 bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Persisted scans by day</h2>
              {trend.length ? (
                <div className="flex items-end gap-2 h-40">
                  {trend.map((day) => <div key={day.date} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${day.date}: ${day.total} scans`}>
                    <span className="text-[9px] font-mono text-slate-500">{day.total}</span>
                    <div className="w-full min-h-1 bg-cyan-500 rounded-t" style={{ height: `${Math.max(2, day.total / maxDailyScans * 100)}%` }} />
                    <span className="text-[9px] text-slate-500">{day.date.slice(5)}</span>
                  </div>)}
                </div>
              ) : <p className="text-xs text-slate-500">No scans have been recorded.</p>}
            </section>
          </div>

          <section className="bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-1">
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300">Metric definitions and caveats</h2>
            <p className="text-[11px] text-slate-500">Accuracy, macro precision, and macro F1 are read from the held-out test section in the offline report. Macro metrics average across the four classes equally. Live scan data has no ground-truth labels, so the application does not claim live detection accuracy.</p>
            {evaluation.status === 'experimental' && <p className="text-[11px] text-amber-700 dark:text-amber-300">The related domain-generalization experiment is marked experimental; see Robustness Lab for its recorded results and limitations.</p>}
            <p className="text-[11px] text-slate-500">Global SHAP importance is not published as structured API data. Per-scan SHAP attributions are available in Analyze URL and saved scan details.</p>
          </section>
        </>
      )}
    </div>
  );
};
