import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { UncertaintyAssessment as UncertaintyAssessmentData } from '../../types';

interface UncertaintyAssessmentProps {
  assessment?: UncertaintyAssessmentData;
  unavailableMessage?: string;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export const UncertaintyAssessment: React.FC<UncertaintyAssessmentProps> = ({
  assessment,
  unavailableMessage = 'Uncertainty assessment is unavailable for this scan.',
}) => {
  if (!assessment) {
    return (
      <section className="rounded-lg border border-[#374151] bg-[#0B0F19] p-4 text-xs text-[#9CA3AF]">
        <h2 className="text-sm font-semibold text-[#D1D5DB]">Prediction Uncertainty</h2>
        <p className="mt-1.5">{unavailableMessage}</p>
      </section>
    );
  }

  const needsReview = assessment.review_required;

  return (
    <section
      aria-live="polite"
      className={`rounded-lg border p-4 sm:p-5 ${
        needsReview
          ? 'border-[#F59E0B]/50 bg-[#78350F]/15'
          : 'border-[#374151] bg-[#0B0F19]'
      }`}
    >
      <div className="flex items-start gap-3">
        {needsReview ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#FBBF24]" />
        ) : (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9CA3AF]" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className={`text-sm font-semibold ${needsReview ? 'text-[#FCD34D]' : 'text-[#D1D5DB]'}`}>
            {needsReview
              ? 'ML prediction uncertain — additional verification recommended.'
              : 'Higher-confidence prediction'}
          </h2>
          {!needsReview && (
            <p className="mt-1 text-xs text-[#9CA3AF]">
              The review rule did not flag this prediction; this is not a guarantee of safety.
            </p>
          )}

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">Predicted class</dt>
              <dd className="mt-0.5 break-words font-mono text-sm font-semibold capitalize text-[#F9FAFB]">
                {assessment.predicted_class}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">Maximum class probability</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-[#F9FAFB]">
                {formatPercent(assessment.max_class_probability)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">Top-two probability margin</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-[#F9FAFB]">
                {formatPercent(assessment.top_two_probability_margin)}
              </dd>
            </div>
          </dl>

          {needsReview && (
            <div className="mt-4 border-t border-[#F59E0B]/20 pt-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-[#FCD34D]">
                Reason for review
              </h3>
              {assessment.reasons.length > 0 ? (
                <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs leading-relaxed text-[#D1D5DB]">
                  {assessment.reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-[#D1D5DB]">
                  No review reason was retained for this historical scan.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
