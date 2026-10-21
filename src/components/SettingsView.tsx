import React, { useEffect, useState } from 'react';
import { Moon, RefreshCw, Server, Shield, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { fetchApplicationConfig, getApiBaseUrl, JsonArtifact } from '../services/api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const SettingsView: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [config, setConfig] = useState<JsonArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setConfig(await fetchApplicationConfig());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Backend configuration is unavailable.');
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  const featureNames = Array.isArray(config?.feature_names)
    ? config.feature_names.filter((name): name is string => typeof name === 'string')
    : [];
  const classLabels = Array.isArray(config?.class_labels)
    ? config.class_labels.filter((label): label is string => typeof label === 'string')
    : [];

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-600 dark:text-cyan-400 mb-1.5"><Shield className="w-4 h-4" /><span>CLIENT APPEARANCE &amp; LIVE BACKEND METADATA</span></div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">System Settings</h1>
          <p className="mt-1 text-xs md:text-sm text-slate-500 dark:text-slate-400">Theme preference is stored locally. Operational policies are not configurable by this application.</p>
        </div>
        <button onClick={() => void refresh()} className="flex items-center gap-2 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-200"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Interface theme</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'} className={`p-4 rounded-lg border text-left flex gap-3 ${theme === 'dark' ? 'border-emerald-500 bg-slate-900 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>
            <Moon className="w-4 h-4 mt-0.5" /><span><strong className="block text-sm">Dark mode</strong><span className="text-[11px] opacity-70">Preference persists after refresh.</span></span>
          </button>
          <button onClick={() => setTheme('light')} aria-pressed={theme === 'light'} className={`p-4 rounded-lg border text-left flex gap-3 ${theme === 'light' ? 'border-emerald-600 bg-emerald-50 text-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>
            <Sun className="w-4 h-4 mt-0.5" /><span><strong className="block text-sm">Light mode</strong><span className="text-[11px] opacity-70">Preference persists after refresh.</span></span>
          </button>
        </div>
      </section>

      <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3"><Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><h2 className="text-sm font-bold text-slate-900 dark:text-white">Backend connectivity</h2></div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div><dt className="text-slate-500">API base URL</dt><dd className="mt-1 font-mono text-slate-800 dark:text-slate-200 break-all">{getApiBaseUrl()}</dd></div>
          <div><dt className="text-slate-500">Connection</dt><dd className={`mt-1 font-semibold ${config ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{loading ? 'Checking…' : config ? 'Connected' : 'Unavailable'}</dd></div>
        </dl>
        {error && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300 break-words">{error}</p>}
        <p className="text-[11px] text-slate-500">Configure the frontend endpoint with <code>VITE_API_URL</code>. No API keys or environment secrets are displayed.</p>
      </section>

      <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Backend model and application configuration</h2>
        {loading ? <p className="text-xs text-slate-500">Loading backend metadata…</p> : config ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div><dt className="text-slate-500">Classifier</dt><dd className="mt-1 font-mono text-slate-800 dark:text-slate-200">{String(config.classifier ?? 'Unavailable')}</dd></div>
            <div><dt className="text-slate-500">Feature count</dt><dd className="mt-1 font-mono text-slate-800 dark:text-slate-200">{String(config.feature_count ?? 'Unavailable')}</dd></div>
            <div><dt className="text-slate-500">Classes</dt><dd className="mt-1 font-mono text-slate-800 dark:text-slate-200">{classLabels.join(', ') || 'Unavailable'}</dd></div>
            <div><dt className="text-slate-500">Storage</dt><dd className="mt-1 font-mono text-slate-800 dark:text-slate-200">{String(config.database ?? 'Unavailable')}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate-500">Feature order</dt><dd className="mt-1 font-mono text-[11px] text-slate-800 dark:text-slate-200 break-words">{featureNames.join(' → ') || 'Unavailable'}</dd></div>
            <div><dt className="text-slate-500">Remote URL fetching by analyzer</dt><dd className="mt-1 font-mono text-slate-800 dark:text-slate-200">{config.url_fetching_enabled === false ? 'Disabled' : 'Not reported'}</dd></div>
          </dl>
        ) : <p className="text-xs text-slate-500">Backend configuration is unavailable while the API is offline.</p>}
      </section>

      <section className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4 text-xs text-amber-900 dark:text-amber-200">
        URL blocking, DNS sinkholing, outbound SIEM webhooks, and threshold editing are not implemented by this API. No controls for those actions are presented as active.
      </section>
    </div>
  );
};
