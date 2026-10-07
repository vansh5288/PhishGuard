import React, { useState } from 'react';
import { X, Shield, Copy, Check, ExternalLink, Calendar, Info, Globe, AlertCircle, Trash2 } from 'lucide-react';
import { ScanHistoryItem } from '../../types';
import { RiskGauge } from '../common/RiskGauge';
import { ThreatBadge } from '../common/ThreatBadge';

interface DetailModalProps {
  scan: ScanHistoryItem | null;
  onClose: () => void;
  onReScan?: (url: string) => void;
  onDelete?: (scanId: string) => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({ scan, onClose, onReScan, onDelete }) => {
  const [copied, setCopied] = useState(false);

  if (!scan) return null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(scan.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = new Date(scan.timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0F19]/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-[#111827] border border-[#374151] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#1F2937] flex items-center justify-between bg-[#141b2b]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-[#0B0F19] border border-[#374151]">
              <Shield className="w-4 h-4 text-[#3B82F6]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#F9FAFB]">URL Threat Inspection</h3>
              <p className="text-xs text-[#9CA3AF] font-mono">ID: {scan.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-[#1F2937] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* URL bar */}
          <div className="p-3 bg-[#0B0F19] rounded-lg border border-[#1F2937] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Globe className="w-4 h-4 text-[#06B6D4] shrink-0" />
              <span className="font-mono text-xs text-[#F9FAFB] truncate selection:bg-blue-600/30">
                {scan.url}
              </span>
            </div>
            <button
              onClick={handleCopyUrl}
              className="px-2.5 py-1 text-xs font-mono text-[#9CA3AF] hover:text-[#F9FAFB] bg-[#1F2937] hover:bg-[#374151] rounded border border-[#374151] transition-colors flex items-center gap-1.5 shrink-0"
              title="Copy URL"
            >
              {copied ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* Verdict + Gauge */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-[#070e1d] p-4 rounded-lg border border-[#1F2937]">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#6B7280]">
                Model Classification
              </div>
              <div className="mt-1.5">
                <ThreatBadge
                  prediction={scan.prediction}
                  threatLevel={scan.threat_level}
                  className="text-xs py-1 px-2.5"
                />
              </div>
              <div className="mt-4 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-[#9CA3AF]">
                  <span>Scan Timestamp:</span>
                  <span className="font-mono text-[#F9FAFB]">{formattedDate}</span>
                </div>
                <div className="flex items-center justify-between text-[#9CA3AF]">
                  <span>Threat Level:</span>
                  <span className="font-mono text-[#F9FAFB] font-semibold">{scan.threat_level}</span>
                </div>
                <div className="flex items-center justify-between text-[#9CA3AF]">
                  <span>Model Confidence:</span>
                  <span className="font-mono text-[#22D3EE] font-semibold">
                    {Math.round(scan.confidence > 1 ? scan.confidence : scan.confidence * 100)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-center border-t sm:border-t-0 sm:border-l border-[#1F2937] pt-4 sm:pt-0 sm:pl-4">
              <RiskGauge
                score={scan.risk_score}
                confidence={scan.confidence}
                size={120}
                showConfidence={false}
              />
            </div>
          </div>

          {/* Explanations / Reasons */}
          <div>
            <h4 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider font-mono text-[#9CA3AF] mb-2.5 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-[#F59E0B]" />
              Threat Diagnostic Signals
            </h4>
            {scan.reasons && scan.reasons.length > 0 ? (
              <ul className="space-y-2">
                {scan.reasons.map((reason, idx) => (
                  <li
                    key={idx}
                    className="p-2.5 rounded bg-[#141b2b] border border-[#1F2937] text-xs text-[#DCE2F7] flex items-start gap-2.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] mt-1.5 shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#6B7280] italic">
                SHAP explanations are not stored in the scan-history database.
              </p>
            )}
          </div>

          {/* Features used by the trained classifier */}
          {scan.features && (
            <div>
              <h4 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider font-mono text-[#9CA3AF] mb-2.5">
                Model Input Features
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {Object.entries(scan.features).map(([feature, value]) => (
                  <div key={feature} className="p-2.5 bg-[#0B0F19] rounded border border-[#1F2937]">
                    <div className="text-[10px] text-[#6B7280]">
                      {feature.replaceAll('_', ' ')}
                    </div>
                    <div className="font-mono text-sm font-semibold text-[#F9FAFB] mt-0.5">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-[#1F2937] bg-[#141b2b] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-[#1F2937] rounded border border-[#374151] transition-colors"
            >
              Close
            </button>
            {onDelete && (
              <button
                onClick={() => {
                  onDelete(scan.id);
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-semibold text-[#F87171] hover:bg-[#EF4444]/15 rounded border border-[#EF4444]/30 transition-colors flex items-center gap-1.5"
                title="Delete this scan"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Scan</span>
              </button>
            )}
          </div>
          {onReScan && (
            <button
              onClick={() => {
                onReScan(scan.url);
                onClose();
              }}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] rounded transition-colors flex items-center gap-1.5"
            >
              Re-Analyze in Scanner
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
