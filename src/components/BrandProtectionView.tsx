import React, { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { BrandRegistryResponse, fetchBrandRegistry, fetchHistory, ScanRecord } from '../services/api';

interface BrandProtectionViewProps {
  onAnalyzeUrl: (url: string) => void;
}

export const BrandProtectionView: React.FC<BrandProtectionViewProps> = ({ onAnalyzeUrl }) => {
  const [registry, setRegistry] = useState<BrandRegistryResponse | null>(null);
  const [assessedScans, setAssessedScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [brands, history] = await Promise.all([
        fetchBrandRegistry(),
        fetchHistory({ limit: 100 }),
      ]);
      setRegistry(brands);
      setAssessedScans(history.scans.filter((scan) => scan.brand_assessment !== null));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Brand registry data is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400 mb-1.5"><ShieldCheck className="w-4 h-4" /><span>LOCAL CURATED BRAND REGISTRY &amp; SCAN ASSESSMENTS</span></div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">Brand Protection Studio</h1>
          <p className="mt-1 text-xs md:text-sm text-slate-500 dark:text-slate-400">Brand match outcomes are supporting signals from the backend registry, separate from the classifier prediction.</p>
        </div>
        <button onClick={() => void refresh()} className="flex items-center gap-2 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-200"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      {error && <div role="alert" className="rounded border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      {loading && <p className="text-sm text-slate-500">Loading brand registry and recorded assessments…</p>}
      {registry && (
        <>
          <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-4 text-xs text-amber-900 dark:text-amber-200">
            No online brand-monitoring or lookalike-generation endpoint is configured. The page shows the actual curated registry and assessments persisted from submitted scans; it does not invent candidate-domain scores.
          </div>
          <section className="bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 rounded-lg p-4">
            <div className="text-sm font-semibold text-cyan-900 dark:text-cyan-200">{registry.registry.title ?? 'Brand registry'}</div>
            <p className="mt-1 text-xs text-cyan-800 dark:text-cyan-300">{registry.registry.description ?? 'Curated local registry used for URL brand assessment.'}</p>
            <p className="mt-2 text-[11px] text-cyan-700 dark:text-cyan-400">
              {registry.brands.length} registry entries · verification: {registry.registry.verification_method ?? 'unspecified'} · updated {registry.registry.generated_at ?? 'date unavailable'}
            </p>
            <p className="mt-2 text-[11px] text-cyan-700 dark:text-cyan-400">{registry.registry.notes}</p>
          </section>

          <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Official domains in local registry</h2>
            {registry.brands.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {registry.brands.map((brand) => (
                  <article key={brand.id} className="p-4 bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 rounded space-y-2">
                    <div className="flex justify-between gap-3"><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{brand.name}</h3><span className="text-[10px] text-slate-500">{brand.verification?.verified_at ?? 'verification date n/a'}</span></div>
                    <ul className="space-y-1 text-xs font-mono text-emerald-700 dark:text-emerald-400">
                      {brand.official_domains.map((domain) => <li key={domain}>{domain}</li>)}
                    </ul>
                    {brand.aliases.length > 0 && <p className="text-[10px] text-slate-500">Aliases: {brand.aliases.join(', ')}</p>}
                    <p className="text-[10px] text-slate-500">{brand.verification?.notes ?? 'This registry entry is not an exhaustive guarantee of ownership.'}</p>
                  </article>
                ))}
              </div>
            ) : <p className="text-xs text-slate-500">The registry currently contains no entries.</p>}
          </section>
        </>
      )}

      <section className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Brand assessments from saved scans</h2>
          <p className="mt-1 text-[11px] text-slate-500">These outcomes are local scan history, not a live domain monitoring service. No generated squatting or reputation scores are shown.</p>
        </div>
        {assessedScans.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800"><tr><th className="p-2">Scanned URL</th><th className="p-2">Assessment</th><th className="p-2">Brand / domain</th><th className="p-2 text-right">Action</th></tr></thead>
              <tbody>{assessedScans.map((scan) => (
                <tr key={scan.id} className="border-b border-slate-100 dark:border-slate-800/60">
                  <td className="p-2 max-w-sm truncate" title={scan.url}>{scan.url}</td>
                  <td className="p-2">{scan.brand_assessment?.status ?? 'Unavailable'}</td>
                  <td className="p-2">{scan.brand_assessment?.matched_brand ?? 'No brand match'}{scan.brand_assessment?.matched_domain ? ` · ${scan.brand_assessment.matched_domain}` : ''}</td>
                  <td className="p-2 text-right"><button onClick={() => onAnalyzeUrl(scan.url)} className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300">Re-analyze</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="text-xs text-slate-500">No saved scans with brand assessment fields are available yet.</p>}
      </section>
    </div>
  );
};
