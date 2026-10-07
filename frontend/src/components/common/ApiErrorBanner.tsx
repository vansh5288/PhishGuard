import React from 'react';
import { AlertTriangle, RefreshCw, Terminal, ExternalLink } from 'lucide-react';
import { API_BASE_URL } from '../../services/api';

interface ApiErrorBannerProps {
  onRetry: () => void;
  isRetrying?: boolean;
  onSimulateDemo?: () => void;
  detail?: string;
}

export const ApiErrorBanner: React.FC<ApiErrorBannerProps> = ({
  onRetry,
  isRetrying = false,
  onSimulateDemo,
  detail,
}) => {
  return (
    <div className="rounded-lg border border-[#EF4444]/40 bg-[#111827] p-5 shadow-lg relative overflow-hidden">
      {/* Red accent line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#EF4444] via-[#F59E0B] to-[#EF4444]" />

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded bg-[#EF4444]/15 border border-[#EF4444]/30 text-[#F87171] shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-[#F9FAFB]">
                Unable to connect to PhishGuard API
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#EF4444]/20 text-[#F87171] border border-[#EF4444]/40">
                OFFLINE
              </span>
            </div>
            <p className="text-sm text-[#9CA3AF] mt-1">
              Could not reach the FastAPI backend server at{' '}
              <code className="font-mono text-xs text-[#22D3EE] bg-[#0B0F19] px-1.5 py-0.5 rounded border border-[#1F2937]">
                {API_BASE_URL}
              </code>
              . {detail || 'Ensure your local Python FastAPI server is running.'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
          {onSimulateDemo && (
            <button
              onClick={onSimulateDemo}
              className="px-3 py-2 text-xs font-medium text-[#C2C6D6] bg-[#1F2937] hover:bg-[#374151] hover:text-[#F9FAFB] rounded border border-[#374151] transition-colors flex items-center gap-1.5"
              title="Inspect with frontend heuristic engine for testing"
            >
              Test with Client Heuristics
            </button>
          )}

          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] active:bg-[#1D4ED8] disabled:opacity-50 rounded transition-colors flex items-center gap-2 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      </div>

      {/* Quick troubleshooting box */}
      <div className="mt-4 pt-3.5 border-t border-[#1F2937] flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[#9CA3AF] gap-2">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <Terminal className="w-3.5 h-3.5 text-[#06B6D4]" />
          <span>Start backend:</span>
          <span className="text-[#F9FAFB] bg-[#0B0F19] px-2 py-0.5 rounded border border-[#1F2937]">
            uvicorn main:app --reload --port 8000
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[#6B7280]">POST /api/analyze</span>
          <span className="text-[#6B7280]">•</span>
          <a
            href={`${API_BASE_URL}/docs`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[#22D3EE] inline-flex items-center gap-1 transition-colors"
          >
            Swagger Docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
