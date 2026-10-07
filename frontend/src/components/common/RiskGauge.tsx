import React from 'react';

interface RiskGaugeProps {
  score: number; // 0 to 100
  confidence?: number; // 0 to 1
  size?: number;
  showConfidence?: boolean;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score,
  confidence = 0.95,
  size = 140,
  showConfidence = true,
}) => {
  // Clamp score
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  
  // Radius and circumference
  const strokeWidth = 10;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  // Use semi-circle or 240-degree arc
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (arcLength * safeScore) / 100;

  // Dynamic color according to Stitch spec: Emerald < 30, Amber 31-70, Red 71-100
  let color = '#10B981'; // Emerald
  let textLabel = 'SAFE';
  if (safeScore > 70) {
    color = '#EF4444'; // Red
    textLabel = 'CRITICAL';
  } else if (safeScore > 30) {
    color = '#F59E0B'; // Amber
    textLabel = 'WARNING';
  }

  const confidencePct = Math.round(confidence > 1 ? confidence : confidence * 100);

  return (
    <div className="flex flex-col items-center justify-center relative select-none">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-135 overflow-visible"
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1F2937"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        {/* Active arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="flex items-baseline">
          <span className="font-mono text-3xl font-bold tracking-tight text-[#F9FAFB]">
            {safeScore}
          </span>
          <span className="font-mono text-xs text-[#6B7280] ml-0.5">/100</span>
        </div>
        <span
          className="font-mono text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded mt-0.5"
          style={{ color, backgroundColor: `${color}15` }}
        >
          {textLabel}
        </span>
      </div>

      {/* Confidence tag underneath */}
      {showConfidence && (
        <div className="mt-2 text-center">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#06B6D4]/10 border border-[#06B6D4]/30 text-[#22D3EE]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] animate-pulse" />
            Model Confidence: {confidencePct}%
          </span>
        </div>
      )}
    </div>
  );
};
