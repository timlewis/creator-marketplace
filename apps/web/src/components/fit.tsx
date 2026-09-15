import type { FitComponent, FitScore } from '@marketplace/api';
import { fitLabel } from '../lib/format.js';
import { cx } from './ui.js';

/**
 * A fit score is never shown as a bare number.
 *
 * The number alone tells a creator nothing they can act on. The ring gives them
 * the gist at a glance while scanning; the breakdown tells them which of the
 * three things they could actually change is holding them back.
 */

export function FitRing({ score, size = 56 }: { score: number; size?: number }) {
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, score)) / 100) * circumference;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Fit score ${score} out of 100: ${fitLabel(score)}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="stroke-accent transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-body font-semibold tabular">
        {score}
      </span>
    </div>
  );
}

function ComponentRow({ component }: { component: FitComponent }) {
  const percentage = component.maxPoints === 0 ? 0 : (component.points / component.maxPoints) * 100;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-body font-semibold">{component.label}</span>
        <span className="text-label text-muted tabular">
          {component.points} / {component.maxPoints}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <p className="text-label text-muted">{component.explanation}</p>
    </div>
  );
}

export function FitBreakdown({ fit, className }: { fit: FitScore; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-4', className)}>
      {fit.components.map((component) => (
        <ComponentRow key={component.key} component={component} />
      ))}
      <div className="flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-body font-semibold">{fitLabel(fit.score)}</span>
        <span className="text-body font-semibold tabular">{fit.score} / 100</span>
      </div>
    </div>
  );
}
