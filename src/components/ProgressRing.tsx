"use client";

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
}

export default function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 8,
  label,
  sublabel,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#ebe2d2"
            strokeWidth={strokeWidth}
          />
          <circle
            className="progress-ring-circle"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#8c2f24"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-ink">
            {Math.round(progress)}%
          </span>
        </div>
      </div>
      {label && (
        <span className="text-sm font-medium text-ink-light">{label}</span>
      )}
      {sublabel && (
        <span className="text-xs text-ink-muted">{sublabel}</span>
      )}
    </div>
  );
}
