import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import {
  Activity,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Cpu,
  Award,
  Layers,
  Database,
  Info,
} from 'lucide-react';
import { StatsResponse, ScanHistoryItem } from '../types';

interface AnalyticsPageProps {
  stats: StatsResponse;
  scans: ScanHistoryItem[];
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ stats, scans }) => {
  const total = stats.total_scans;
  const malicious = stats.malicious_detected;
  const safe = stats.safe_urls;

  // Donut data uses counts returned by the scan-history API.
  const verdictDonutData = [
    { name: 'Phishing', value: stats.class_distribution.phishing, color: '#EF4444' },
    { name: 'Defacement', value: stats.class_distribution.defacement, color: '#F97316' },
    { name: 'Malware', value: stats.class_distribution.malware, color: '#A855F7' },
    { name: 'Legitimate', value: stats.class_distribution.legitimate, color: '#10B981' },
  ];

  // Threat level distribution
  const threatSeverityData = [
    { level: 'Critical (80-100)', count: stats.threat_distribution.critical, fill: '#EF4444' },
    { level: 'High (60-79)', count: stats.threat_distribution.high, fill: '#F87171' },
    { level: 'Medium (30-59)', count: stats.threat_distribution.medium, fill: '#F59E0B' },
    { level: 'Low (0-29)', count: stats.threat_distribution.low, fill: '#10B981' },
  ];

  // Trend data
  const trendData = stats.recent_trend || [];

  const vectorData = stats.common_threat_vectors || [];

  const avgMaliciousProbability =
    scans.length > 0
      ? scans.reduce((acc, curr) => acc + curr.risk_score, 0) / scans.length
      : 0;
  const metricValue = (name: string, percentage = false) => {
    const value = stats.model_info?.metrics[name];
    if (value === undefined) return 'Not available';
    return percentage ? `${(value * 100).toFixed(1)}%` : value.toFixed(3);
  };

  // Custom Recharts dark tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#111827] border border-[#374151] p-2.5 rounded shadow-xl text-xs font-mono">
          <p className="text-[#9CA3AF] mb-1">{label || payload[0]?.name}</p>
          {payload.map((entry: any, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.color || entry.fill }}>
              {entry.name}: <span className="font-bold">{entry.value}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#F9FAFB] tracking-tight">
          PhishGuard Threat Analytics
        </h1>
        <p className="text-xs text-[#9CA3AF] mt-1">
          Machine learning evaluation metrics, attack vector distribution, and longitudinal threat telemetry.
        </p>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="text-[11px] font-mono uppercase text-[#6B7280]">Total Analyzed</div>
          <div className="text-2xl font-bold font-mono text-[#F9FAFB] mt-2 tabular-nums">
            {total}
          </div>
          <div className="text-xs text-[#9CA3AF] mt-1">Recorded URL scans</div>
        </div>

        <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="text-[11px] font-mono uppercase text-[#6B7280]">Malicious Ratio</div>
          <div className="text-2xl font-bold font-mono text-[#F87171] mt-2 tabular-nums">
            {total > 0 ? Math.round((malicious / total) * 100) : 0}%
          </div>
          <div className="text-xs text-[#9CA3AF] mt-1">{malicious} malicious predictions</div>
        </div>

        <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="text-[11px] font-mono uppercase text-[#6B7280]">Legitimate Ratio</div>
          <div className="text-2xl font-bold font-mono text-[#34D399] mt-2 tabular-nums">
            {total > 0 ? Math.round((safe / total) * 100) : 0}%
          </div>
          <div className="text-xs text-[#9CA3AF] mt-1">{safe} legitimate predictions</div>
        </div>

        <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="text-[11px] font-mono uppercase text-[#6B7280]">Avg Malicious Probability</div>
          <div className="text-2xl font-bold font-mono text-[#22D3EE] mt-2 tabular-nums">
            {avgMaliciousProbability.toFixed(1)}%
          </div>
          <div className="text-xs text-[#9CA3AF] mt-1">Across available scan history</div>
        </div>
      </div>

      {/* Primary Visualizations Grid: Trend + Ratio */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Detection Trend Over Time */}
        <div className="lg:col-span-2 p-5 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="flex items-center justify-between border-b border-[#1F2937] pb-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#F9FAFB]">Detection Ingestion Trend</h2>
              <p className="text-xs text-[#6B7280]">Temporal volume of malicious vs legitimate scans</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-[#34D399]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981]" /> Legitimate
              </span>
              <span className="flex items-center gap-1.5 text-[#F87171]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#EF4444]" /> Malicious
              </span>
            </div>
          </div>

          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPhishing" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorSafe" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                <XAxis dataKey="date" stroke="#6B7280" fontSize={11} tickLine={false} />
                <YAxis stroke="#6B7280" fontSize={11} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="malicious"
                  name="Malicious"
                  stroke="#EF4444"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorPhishing)"
                />
                <Area
                  type="monotone"
                  dataKey="legitimate"
                  name="Legitimate"
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSafe)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Verdict Classification Donut */}
        <div className="p-5 rounded-lg bg-[#111827] border border-[#1F2937] flex flex-col justify-between">
          <div className="border-b border-[#1F2937] pb-3 mb-2">
            <h2 className="text-sm font-semibold text-[#F9FAFB]">Classification Breakdown</h2>
            <p className="text-xs text-[#6B7280]">Predicted class counts in scan history</p>
          </div>

          <div className="h-56 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={verdictDonutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {verdictDonutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold font-mono text-[#F9FAFB]">{total}</span>
              <span className="text-[10px] font-mono text-[#6B7280] uppercase">Total Scans</span>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#1F2937] text-xs">
            {verdictDonutData.map((entry) => (
              <div className="flex items-center justify-between" key={entry.name}>
                <span className="flex items-center gap-1.5 text-[#9CA3AF]">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.name}
                </span>
                <span className="font-mono text-[#F9FAFB] font-semibold">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary Visualizations: Threat Severity Bar + Heuristic Vectors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Threat Severity Distribution Bar */}
        <div className="p-5 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="border-b border-[#1F2937] pb-3 mb-4">
            <h2 className="text-sm font-semibold text-[#F9FAFB]">Threat Severity Level Distribution</h2>
            <p className="text-xs text-[#6B7280]">Categorization across risk tiers (0–100)</p>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={threatSeverityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                <XAxis dataKey="level" stroke="#6B7280" fontSize={10} tickLine={false} />
                <YAxis stroke="#6B7280" fontSize={11} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Scans" radius={[4, 4, 0, 0]}>
                  {threatSeverityData.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Common Threat Vectors Bar */}
        <div className="p-5 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="border-b border-[#1F2937] pb-3 mb-4">
            <h2 className="text-sm font-semibold text-[#F9FAFB]">Top Malicious Heuristic Vectors</h2>
            <p className="text-xs text-[#6B7280]">Most frequently triggered suspicious URL features</p>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {vectorData.length > 0 ? <BarChart
                layout="vertical"
                data={vectorData}
                margin={{ top: 5, right: 20, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                <XAxis type="number" stroke="#6B7280" fontSize={11} tickLine={false} />
                <YAxis
                  dataKey="factor"
                  type="category"
                  stroke="#9CA3AF"
                  fontSize={10}
                  tickLine={false}
                  width={110}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Frequency" fill="#06B6D4" radius={[0, 4, 4, 0]} />
              </BarChart> : <div className="flex h-full items-center justify-center text-xs text-[#6B7280]">
                SHAP feature counts are not stored in scan history.
              </div>}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Model Benchmark & Academic Evaluation Table */}
      <div className="rounded-lg bg-[#111827] border border-[#1F2937] p-5">
        <div className="border-b border-[#1F2937] pb-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#06B6D4]" />
            <h2 className="text-sm font-semibold text-[#F9FAFB]">
              Model Evaluation Metrics (Held-out Test Set)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#22D3EE] bg-[#06B6D4]/10 border border-[#06B6D4]/30 px-2 py-0.5 rounded">
            Classifier: {stats.model_info?.name || 'Not available'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 bg-[#0B0F19] rounded border border-[#1F2937]">
            <div className="text-[10px] uppercase font-mono text-[#6B7280]">Accuracy</div>
            <div className="text-lg font-bold font-mono text-[#34D399] mt-1">{metricValue('Accuracy', true)}</div>
            <div className="text-[10px] text-[#9CA3AF] mt-0.5">Overall correctness</div>
          </div>
          <div className="p-3 bg-[#0B0F19] rounded border border-[#1F2937]">
            <div className="text-[10px] uppercase font-mono text-[#6B7280]">Precision</div>
            <div className="text-lg font-bold font-mono text-[#22D3EE] mt-1">{metricValue('Precision', true)}</div>
            <div className="text-[10px] text-[#9CA3AF] mt-0.5">Macro precision</div>
          </div>
          <div className="p-3 bg-[#0B0F19] rounded border border-[#1F2937]">
            <div className="text-[10px] uppercase font-mono text-[#6B7280]">Recall (Sensitivity)</div>
            <div className="text-lg font-bold font-mono text-[#34D399] mt-1">{metricValue('Recall', true)}</div>
            <div className="text-[10px] text-[#9CA3AF] mt-0.5">Macro recall</div>
          </div>
          <div className="p-3 bg-[#0B0F19] rounded border border-[#1F2937]">
            <div className="text-[10px] uppercase font-mono text-[#6B7280]">F1-Score</div>
            <div className="text-lg font-bold font-mono text-[#F9FAFB] mt-1">{metricValue('F1')}</div>
            <div className="text-[10px] text-[#9CA3AF] mt-0.5">Harmonic balance</div>
          </div>
          <div className="p-3 bg-[#0B0F19] rounded border border-[#1F2937]">
            <div className="text-[10px] uppercase font-mono text-[#6B7280]">ROC-AUC</div>
            <div className="text-lg font-bold font-mono text-[#22D3EE] mt-1">{metricValue('ROC-AUC')}</div>
            <div className="text-[10px] text-[#9CA3AF] mt-0.5">Area under curve</div>
          </div>
        </div>
      </div>
    </div>
  );
};
