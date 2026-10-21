import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, Download, Lock, Radar, Shield, ShieldAlert, ShieldCheck, TrendingUp } from 'lucide-react';
import { analyzeUrl, ScanRecord } from '../services/api';

interface UrlAnalysisStudioProps {
  initialUrl?: string;
}

const CLASS_ORDER = ['PHISHING', 'LEGITIMATE', 'MALWARE', 'DEFACEMENT'] as const;
const CLASS_STYLES: Record<string, string> = {
  PHISHING: 'text-rose-600 dark:text-rose-400',
  LEGITIMATE: 'text-emerald-600 dark:text-emerald-400',
  MALWARE: 'text-amber-600 dark:text-amber-400',
  DEFACEMENT: 'text-purple-600 dark:text-purple-400',
};
const FEATURE_LABELS: Record<string, string> = {
  url_length: 'URL length',
  hostname_length: 'Hostname length',
  path_length: 'Path length',
  dot_count: 'Dot count',
  hyphen_count: 'Hyphen count',
  digit_count: 'Digit count',
  special_character_count: 'Special character count',
  subdirectory_count: 'Subdirectory count',
  has_https: 'HTTPS indicator',
  query_length: 'Query length',
};

function downloadEvidence(scan: ScanRecord): void {
  const blob = new Blob([JSON.stringify(scan, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `phishguard-evidence-${scan.id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const UrlAnalysisStudio: React.FC<UrlAnalysisStudioProps> = ({ initialUrl = '' }) => {
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [result, setResult] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    if (initialUrl) setUrlInput(initialUrl);
  }, [initialUrl]);

  const runAnalysis = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!urlInput.trim()) {
      setError('Enter a URL to analyze.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      setResult(await analyzeUrl(urlInput.trim()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const copyEvidence = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopyMessage('Evidence copied');
    } catch {
      setCopyMessage('Clipboard access is unavailable in this browser');
    }
    window.setTimeout(() => setCopyMessage(''), 2500);
  };

  const probabilities = result?.probabilities;
  const probabilityTotal = probabilities
    ? CLASS_ORDER.reduce((total, label) => total + (probabilities[label] ?? 0), 0)
    : 0;
  const probabilityDataAvailable = Boolean(
    probabilities &&
    CLASS_ORDER.every((label) => Number.isFinite(probabilities[label])) &&
    Math.abs(probabilityTotal - 1) < 0.01,
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <div className="flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>LIVE FASTAPI INFERENCE • TRAINED FOUR-CLASS CLASSIFIER</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          URL Analysis Studio
        </h1>
        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
          The backend validates and parses the URL; it does not open or fetch the submitted page.
        </p>
      </div>

      <form
        onSubmit={runAnalysis}
        className="flex flex-col sm:flex-row gap-2 bg-white dark:bg-[#0F172A] p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm"
      >
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-slate-100 dark:bg-[#162032] text-xs font-mono text-slate-600 dark:text-slate-300">
          <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          URL
        </div>
        <input
          type="text"
          aria-label="URL to analyze"
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          placeholder="Enter a URL (for example, https://example.com/)"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs md:text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setUrlInput('https://example.com/')}
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Fill safe example
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-xs rounded"
        >
          <Radar className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Analyzing…' : 'Analyze URL'}
        </button>
      </form>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-800 dark:text-rose-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <strong>Analysis unavailable</strong>
              <p className="mt-1 break-words">{error}</p>
              {error.includes('localhost:8000') && (
                <p className="mt-2 text-xs">Start the API with <code>.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000</code>.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {!result && !error && !loading && (
        <div className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center">
          <Shield className="w-8 h-8 mx-auto text-emerald-600 dark:text-emerald-400" />
          <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Ready to analyze</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">No example scans are preloaded. Submit a URL to view a real model result.</p>
        </div>
      )}

      {result && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Persisted scan #{result.id}</div>
              <div className="mt-1 text-xs font-mono text-slate-700 dark:text-slate-300 break-all">{result.url}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={copyEvidence} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono text-slate-700 dark:text-slate-300">
                {copyMessage === 'Evidence copied' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copyMessage || 'Copy evidence'}
              </button>
              <button onClick={() => downloadEvidence(result)} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono text-slate-700 dark:text-slate-300">
                <Download className="w-3.5 h-3.5" /> Export JSON
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-6">
              <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Trained model prediction</div>
                    <h2 className={`mt-1 text-xl font-bold ${CLASS_STYLES[result.prediction]}`}>
                      {result.prediction}
                    </h2>
                  </div>
                  <div className="sm:text-right">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Non-legitimate probability</div>
                    <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                      {(result.risk_score * 100).toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-slate-500">Risk score = 1 − P(LEGITIMATE)</div>
                  </div>
                </div>

                {probabilityDataAvailable ? (
                  <>
                    <div className="h-3 flex overflow-hidden rounded bg-slate-100 dark:bg-slate-900" aria-label="Four-class model probability distribution">
                      {CLASS_ORDER.map((label) => (
                        <div
                          key={label}
                          title={`${label}: ${(probabilities![label] * 100).toFixed(2)}%`}
                          style={{ width: `${probabilities![label] * 100}%` }}
                          className={
                            label === 'PHISHING' ? 'bg-rose-500' :
                              label === 'LEGITIMATE' ? 'bg-emerald-500' :
                                label === 'MALWARE' ? 'bg-amber-500' : 'bg-purple-500'
                          }
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {CLASS_ORDER.map((label) => (
                        <div key={label} className="rounded bg-slate-50 dark:bg-[#0B0F19] p-3">
                          <div className={`text-[10px] font-mono ${CLASS_STYLES[label]}`}>{label}</div>
                          <div className="mt-1 font-mono font-bold text-slate-900 dark:text-white">
                            {(probabilities![label] * 100).toFixed(2)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Per-class probabilities are unavailable for this saved record.</p>
                )}
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  Scan saved to the local SQLite history at {result.created_at || 'timestamp unavailable'}.
                </div>
              </section>

              <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">SHAP feature attribution</h2>
                </div>
                {result.explanation.length ? (
                  <div className="space-y-3">
                    {result.explanation.map((item) => (
                      <div key={item.feature}>
                        <div className="flex justify-between gap-3 text-xs font-mono">
                          <span className="text-slate-700 dark:text-slate-300">{FEATURE_LABELS[item.feature] ?? item.feature} <span className="text-slate-500">({item.value})</span></span>
                          <span className={item.shap_value >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                            {item.shap_value >= 0 ? '+' : ''}{item.shap_value.toFixed(5)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded bg-slate-100 dark:bg-slate-900 overflow-hidden">
                          <div
                            className={`h-full ${item.shap_value >= 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(Math.abs(item.shap_value) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    <p className="text-[11px] text-slate-500">Attributions are the backend’s local SHAP values for the predicted class; positive/negative indicates contribution direction in that class output.</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No SHAP explanation was stored for this scan.</p>
                )}
              </section>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {result.stability_assessment?.status === 'stable' ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : result.stability_assessment?.status === 'unstable' ? (
                      <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <Shield className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    )}
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Stability Shield
                    </h2>
                  </div>
                  {result.stability_assessment && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                        result.stability_assessment.status === 'stable'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                          : result.stability_assessment.status === 'unstable'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
                          : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {result.stability_assessment.status}
                    </span>
                  )}
                </div>

                {result.stability_assessment ? (
                  <div className="space-y-3.5">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded bg-slate-50 dark:bg-[#0B0F19] p-3">
                        <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                          Prediction Stability
                        </div>
                        <div className="mt-1 text-lg font-mono font-bold text-slate-900 dark:text-white">
                          {result.stability_assessment.prediction_stability !== null
                            ? `${result.stability_assessment.prediction_stability.toFixed(1)}%`
                            : 'N/A'}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {result.stability_assessment.transformations_tested > 0
                            ? `${result.stability_assessment.consistent_predictions}/${result.stability_assessment.transformations_tested} consistent`
                            : '0 representations tested'}
                        </div>
                      </div>

                      <div className="rounded bg-slate-50 dark:bg-[#0B0F19] p-3">
                        <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                          Original Prediction
                        </div>
                        <div
                          className={`mt-1 text-sm font-mono font-bold ${
                            CLASS_STYLES[result.stability_assessment.original_prediction] ?? 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {result.stability_assessment.original_prediction}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {result.stability_assessment.status === 'stable'
                            ? 'Consistent across transforms'
                            : result.stability_assessment.status === 'unstable'
                            ? 'Prediction flipped on transform'
                            : 'No valid transforms'}
                        </div>
                      </div>
                    </div>

                    <div className="rounded bg-slate-50/70 dark:bg-[#0B0F19]/60 border border-slate-200/60 dark:border-slate-800/60 p-3 text-xs space-y-1.5">
                      <p className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                        {result.stability_assessment.explanation}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {result.stability_assessment.summary}
                      </p>
                    </div>

                    {result.stability_assessment.checks.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                          Equivalent Representations Tested ({result.stability_assessment.checks.length})
                        </div>
                        <div className="space-y-2">
                          {result.stability_assessment.checks.map((chk) => (
                            <div
                              key={chk.check_id}
                              className="rounded border border-slate-200 dark:border-slate-800/80 p-2.5 bg-slate-50/50 dark:bg-[#0B0F19]/40 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                  {chk.name}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                    chk.consistent
                                      ? 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : 'bg-rose-100/80 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  }`}
                                >
                                  {chk.consistent ? (
                                    <>
                                      <Check className="w-3 h-3" />
                                      Consistent
                                    </>
                                  ) : (
                                    <>
                                      <AlertTriangle className="w-3 h-3" />
                                      Changed
                                    </>
                                  )}
                                </span>
                              </div>

                              <div className="font-mono text-[10px] text-slate-600 dark:text-slate-400 truncate bg-slate-100 dark:bg-slate-900/80 px-2 py-1 rounded">
                                {chk.transformed_url}
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                                <span>
                                  Predicted:{' '}
                                  <strong className={CLASS_STYLES[chk.predicted_class] ?? 'text-slate-700 dark:text-slate-300'}>
                                    {chk.predicted_class}
                                  </strong>
                                </span>
                                <span>{(chk.probability * 100).toFixed(1)}% prob</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.stability_assessment.skipped_checks.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                          Skipped Transformations ({result.stability_assessment.skipped_checks.length})
                        </div>
                        <ul className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {result.stability_assessment.skipped_checks.map((sc) => (
                            <li key={sc.check_id} className="flex items-start gap-1.5">
                              <span className="text-slate-400 dark:text-slate-600">•</span>
                              <span>
                                <strong className="font-medium text-slate-600 dark:text-slate-400">{sc.name}:</strong>{' '}
                                {sc.reason}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.stability_assessment.limitations && (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal border-t border-slate-100 dark:border-slate-800/60 pt-2">
                        {result.stability_assessment.limitations}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Stability assessment is not available for this record.</p>
                )}
              </section>

              <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Extracted model features</h2>
                {result.features ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(result.features).map(([name, value]) => (
                      <div key={name} className="rounded bg-slate-50 dark:bg-[#0B0F19] px-3 py-2">
                        <dt className="text-[10px] font-mono text-slate-500">{FEATURE_LABELS[name] ?? name}</dt>
                        <dd className="mt-0.5 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-xs text-slate-500">Feature values are not available in this legacy record.</p>
                )}
              </section>

              <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Brand identity assessment</h2>
                {result.brand_assessment ? (
                  <>
                    <div className="text-xs font-mono text-cyan-700 dark:text-cyan-300">{result.brand_assessment.status ?? 'status unavailable'}</div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      {result.brand_assessment.matched_brand
                        ? `${result.brand_assessment.matched_brand}${result.brand_assessment.matched_domain ? ` · ${result.brand_assessment.matched_domain}` : ''}`
                        : 'No registered brand match was returned.'}
                    </p>
                    <ul className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {result.brand_assessment.reasons.map((reason, index) => <li key={index}>{reason}</li>)}
                    </ul>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Brand assessment is not available for this legacy scan.</p>
                )}
              </section>

              <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Uncertainty and review</h2>
                {result.uncertainty ? (
                  <>
                    <div className={`text-xs font-semibold ${result.uncertainty.review_required ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {result.uncertainty.review_required ? 'Manual review recommended' : 'No review trigger'}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Confidence {(result.uncertainty.max_class_probability * 100).toFixed(2)}% · top-two margin {result.uncertainty.top_two_probability_margin.toFixed(4)}
                    </p>
                    {result.uncertainty.reasons.map((reason, index) => <p key={index} className="text-xs text-slate-600 dark:text-slate-400">{reason}</p>)}
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Uncertainty metadata is not available for this legacy scan.</p>
                )}
              </section>
            </div>
          </div>
        </>
      )}

      {copyMessage && copyMessage !== 'Evidence copied' && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{copyMessage}</p>
      )}
    </div>
  );
};
