import React, { useEffect, useState } from 'react';
import { AlertTriangle, FlaskConical, RefreshCw } from 'lucide-react';
import { fetchRobustnessResults, JsonArtifact } from '../services/api';

interface RobustnessLabViewProps {
  onAnalyzeUrl: (url: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function percent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'Unavailable';
}

export const RobustnessLabView: React.FC<RobustnessLabViewProps> = ({ onAnalyzeUrl }) => {
  const [report, setReport] = useState<JsonArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await fetchRobustnessResults());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The robustness report is unavailable.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  const experiments = isRecord(report?.experiments) ? Object.entries(report.experiments) : [];

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-600 dark:text-amber-400 mb-1.5"><FlaskConical className="w-4 h-4" /><span>RECORDED OFFLINE EXPERIMENTS</span></div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">Model Robustness Lab</h1>
          <p className="mt-1 text-xs md:text-sm text-slate-500 dark:text-slate-400">Results are read from the checked-in domain-generalization evaluation report. Experiments are not run by this web application.</p>
        </div>
        <button onClick={() => void refresh()} className="flex items-center gap-2 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-200"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      {error && <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{error}</div>}
      {loading && <p className="text-sm text-slate-500">Loading recorded evaluation…</p>}
      {report && (
        <>
          <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-4 flex gap-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <strong>Experimental offline evidence.</strong> This report is not a live scan result or guarantee of evasion detection. The report status is <code>{String(report.status ?? report.evaluation_type ?? 'unspecified')}</code>. Compare the hostname-disjoint evaluation with random-split metrics; their generalization limitations differ.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {experiments.map(([key, value]) => {
              if (!isRecord(value)) return null;
              const metrics = isRecord(value.metrics) ? value.metrics : {};
              const split = isRecord(value.split) ? value.split : {};
              return (
                <section key={key} className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">{String(value.name ?? key)}</h2>
                      <p className="text-[10px] uppercase font-mono text-slate-500 mt-1">Status: {String(value.status ?? 'not reported')}</p>
                    </div>
                    {typeof split.hostname_overlap_count === 'number' && <span className="text-[10px] font-mono text-slate-500">Host overlap: {split.hostname_overlap_count}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded bg-slate-50 dark:bg-[#0B0F19]"><div className="text-[10px] uppercase text-slate-500">Accuracy</div><div className="mt-1 font-mono font-bold text-slate-900 dark:text-white">{percent(metrics.accuracy)}</div></div>
                    <div className="p-3 rounded bg-slate-50 dark:bg-[#0B0F19]"><div className="text-[10px] uppercase text-slate-500">Macro F1</div><div className="mt-1 font-mono font-bold text-slate-900 dark:text-white">{percent(metrics.macro_f1)}</div></div>
                    <div className="p-3 rounded bg-slate-50 dark:bg-[#0B0F19]"><div className="text-[10px] uppercase text-slate-500">Macro precision</div><div className="mt-1 font-mono font-bold text-slate-900 dark:text-white">{percent(metrics.macro_precision)}</div></div>
                    <div className="p-3 rounded bg-slate-50 dark:bg-[#0B0F19]"><div className="text-[10px] uppercase text-slate-500">Macro recall</div><div className="mt-1 font-mono font-bold text-slate-900 dark:text-white">{percent(metrics.macro_recall)}</div></div>
                  </div>
                  {typeof value.limitation === 'string' && value.limitation && <p className="text-[11px] text-slate-500">{value.limitation}</p>}
                  {typeof split.test_rows === 'number' && <p className="text-[10px] text-slate-500">Test rows: {split.test_rows.toLocaleString()} · split method: {String(split.method ?? 'not reported')}</p>}
                </section>
              );
            })}
          </div>
          {experiments.length === 0 && <p className="text-xs text-slate-500">The artifact does not contain a recognized experiment collection.</p>}
          <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Interactive URL execution</h2>
            <p className="text-xs text-slate-500">The backend provides URL analysis but no robustness experiment execution endpoint. This page therefore does not claim a model robustness run. Use Analyze URL to evaluate a URL through the actual classifier only.</p>
            <button onClick={() => onAnalyzeUrl('')} className="px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300">Open Analyze URL</button>
          </section>
        </>
      )}
    </div>
  );
};
