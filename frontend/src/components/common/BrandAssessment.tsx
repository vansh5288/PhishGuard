import React from 'react';
import { AlertCircle, BadgeCheck } from 'lucide-react';
import { BrandAssessment as BrandAssessmentData } from '../../types';

interface BrandAssessmentProps {
  assessment?: BrandAssessmentData;
  unavailableMessage?: string;
}

const statusLabels: Record<string, string> = {
  domain_match: 'Registered domain match',
  possible_impersonation: 'Possible brand impersonation',
  idn_warning: 'Internationalized domain warning',
  no_brand_signal: 'No known brand signal',
  assessment_error: 'Brand assessment unavailable',
};

export const BrandAssessment: React.FC<BrandAssessmentProps> = ({
  assessment,
  unavailableMessage = 'Brand identity assessment is unavailable for this scan.',
}) => {
  if (!assessment) {
    return (
      <section className="rounded-lg border border-[#374151] bg-[#0B0F19] p-4 text-xs text-[#9CA3AF]">
        <h2 className="text-sm font-semibold text-[#D1D5DB]">Brand Identity Assessment</h2>
        <p className="mt-1.5">{unavailableMessage}</p>
      </section>
    );
  }

  const warning = [
    'possible_impersonation',
    'idn_warning',
    'assessment_error',
  ].includes(assessment.status);
  const statusLabel = statusLabels[assessment.status] ?? assessment.status.replaceAll('_', ' ');

  return (
    <section
      aria-live="polite"
      className={`rounded-lg border p-4 ${
        warning ? 'border-[#F59E0B]/40 bg-[#78350F]/10' : 'border-[#374151] bg-[#0B0F19]'
      }`}
    >
      <div className="flex items-start gap-3">
        {warning ? (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FBBF24]" />
        ) : (
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#9CA3AF]" />
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#D1D5DB]">Brand Identity Assessment</h2>
          <p className={`mt-1 text-xs font-semibold ${warning ? 'text-[#FCD34D]' : 'text-[#E5E7EB]'}`}>
            {statusLabel}
            {assessment.matched_brand ? ` · ${assessment.matched_brand}` : ''}
          </p>
          {assessment.hostname && (
            <p className="mt-1 break-all font-mono text-[11px] text-[#9CA3AF]">
              Hostname: {assessment.hostname}
              {assessment.matched_domain ? ` · registered domain: ${assessment.matched_domain}` : ''}
            </p>
          )}
          {assessment.reasons.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-[#9CA3AF]">
              {assessment.reasons.map((reason, index) => (
                <li key={`${index}-${reason}`}>{reason}</li>
              ))}
            </ul>
          )}
          {assessment.status === 'no_brand_signal' && (
            <p className="mt-1 text-[11px] text-[#6B7280]">
              The local registry is not exhaustive; this is not a safety verdict.
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
