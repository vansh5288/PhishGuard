import React from 'react';

interface ThreatBadgeProps {
  prediction?: 'phishing' | 'legitimate' | 'defacement' | 'malware' | string;
  threatLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  className?: string;
}

export const ThreatBadge: React.FC<ThreatBadgeProps> = ({
  prediction,
  threatLevel,
  className = '',
}) => {
  const normPred = (prediction || '').toLowerCase();
  const normLevel = (threatLevel || '').toUpperCase();

  // Determine type
  const isMalicious =
    ['phishing', 'defacement', 'malware'].includes(normPred) ||
    normLevel === 'CRITICAL' ||
    normLevel === 'HIGH';
  const isWarning = normLevel === 'MEDIUM';
  const isClean = normPred === 'legitimate' || normLevel === 'LOW';

  if (isMalicious) {
    const label = ['phishing', 'defacement', 'malware'].includes(normPred)
      ? `${normPred.toUpperCase()} DETECTED`
      : (normLevel || 'THREAT CRITICAL');
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-mono font-medium bg-[#EF4444]/12 border border-[#EF4444]/35 text-[#F87171] tracking-wide ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] shrink-0" />
        {label}
      </span>
    );
  }

  if (isWarning) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-mono font-medium bg-[#F59E0B]/12 border border-[#F59E0B]/35 text-[#FBBF24] tracking-wide ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] shrink-0" />
        {threatLevel || 'SUSPICIOUS'}
      </span>
    );
  }

  if (isClean) {
    const label = normPred === 'legitimate' ? 'LEGITIMATE URL' : (normLevel || 'CLEAN / SAFE');
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-mono font-medium bg-[#10B981]/12 border border-[#10B981]/35 text-[#34D399] tracking-wide ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0" />
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-mono font-medium bg-[#374151]/30 border border-[#374151] text-[#9CA3AF] ${className}`}
    >
      UNKNOWN
    </span>
  );
};

export const ThreatLevelPill: React.FC<{ level: string; className?: string }> = ({
  level,
  className = '',
}) => {
  const norm = level.toUpperCase();
  if (norm === 'CRITICAL') {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-mono font-medium bg-[#EF4444]/15 border border-[#EF4444]/40 text-[#F87171] ${className}`}>
        CRITICAL
      </span>
    );
  }
  if (norm === 'HIGH') {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-mono font-medium bg-[#EF4444]/12 border border-[#EF4444]/30 text-[#F87171] ${className}`}>
        HIGH
      </span>
    );
  }
  if (norm === 'MEDIUM') {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-mono font-medium bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#FBBF24] ${className}`}>
        MEDIUM
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-mono font-medium bg-[#10B981]/15 border border-[#10B981]/40 text-[#34D399] ${className}`}>
      LOW
    </span>
  );
};
