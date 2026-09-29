export interface ScoreRingProps {
  score: number;
  size?: number;
  label?: string;
  sublabel?: string;
}

export function ScoreRing({ score, size = 120, label, sublabel }: ScoreRingProps) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, score));
  const color = score >= 80 ? '#16A34A' : score >= 60 ? '#D97706' : '#DC2626';
  const center = size / 2;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={label ? `${label}: ${score}` : `Score: ${score}`}
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#E7E5E4"
            strokeWidth={stroke}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (circumference * pct) / 100}
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-stone-900 dark:text-stone-100">
            {Math.round(score)}
          </span>
          {sublabel && (
            <span className="text-xs text-stone-500 dark:text-stone-400">{sublabel}</span>
          )}
        </div>
      </div>
      {label && (
        <p className="mt-2 text-sm font-medium text-stone-600 dark:text-stone-300">{label}</p>
      )}
    </div>
  );
}
