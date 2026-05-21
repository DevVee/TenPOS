import { TrendingUp, TrendingDown, Clock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  /** Hex accent colour — used for glow, sparkline, top bar, live dot */
  accentColor?: string
  iconColor?: string
  iconBg?: string
  live?: boolean
  trend?: { value: string; positive: boolean; label?: string }
  /** Bottom-left sub-metric */
  subIcon?: LucideIcon
  subValue?: string
  subLabel?: string
  /** Sparkline data — array of numbers (e.g. weekly revenue) */
  sparkline?: number[]
  /** Bottom-right timestamp label */
  updatedLabel?: string
}

// ── Helper ────────────────────────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function SparkLine({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const W = 100, H = 42
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - 6 - ((v - min) / range) * (H - 14),
  }))
  // Smooth curve using cubic bezier control points
  const d = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
    const prev = pts[i - 1]
    const cpX = ((p.x - prev.x) / 2)
    return `${acc} C${(prev.x + cpX).toFixed(1)},${prev.y.toFixed(1)} ${(p.x - cpX).toFixed(1)},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }, '')
  const last = pts[pts.length - 1]
  return (
    <svg
      className="absolute bottom-12 right-0 opacity-60 pointer-events-none"
      width="88" height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="3.5" fill={color} stroke="white" strokeWidth="1.5" />
    </svg>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────
export function StatCard({
  label, value, icon: Icon,
  accentColor = '#C0392B',
  iconColor   = 'text-brand',
  iconBg      = 'bg-brand-pale',
  live        = false,
  trend,
  subIcon: SubIcon,
  subValue, subLabel,
  sparkline,
  updatedLabel = 'Updated just now',
}: StatCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/[0.03] transition-shadow hover:shadow-card-hover"
      style={{ background: `linear-gradient(140deg, #ffffff 55%, ${hexToRgba(accentColor, 0.06)} 100%)` }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
        style={{ background: `linear-gradient(to right, ${accentColor}, ${hexToRgba(accentColor, 0.5)})` }}
      />

      {/* Glow blob — top right */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${hexToRgba(accentColor, 0.14)} 0%, transparent 68%)` }}
      />

      {/* Floating icon circle */}
      <div
        className={`absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}
        style={{ boxShadow: `0 0 0 7px ${hexToRgba(accentColor, 0.08)}` }}
      >
        <Icon className={`w-7 h-7 ${iconColor}`} />
      </div>

      {/* Sparkline — overlaps bottom section */}
      {sparkline && <SparkLine data={sparkline} color={accentColor} />}

      {/* Content */}
      <div className="px-5 pt-5 pb-4 relative z-10">

        {/* Label row */}
        <div className="flex items-center gap-2 mb-2 pr-16">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.12em] leading-none">
            {label}
          </p>
          {live && (
            <div className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
                style={{ background: accentColor }}
              />
              <span className="text-[10px] font-bold" style={{ color: accentColor }}>Live</span>
            </div>
          )}
        </div>

        {/* Value */}
        <p className="text-[28px] font-black text-gray-900 tabular-nums tracking-tight leading-none mb-2 pr-16">
          {value}
        </p>

        {/* Trend */}
        {trend ? (
          <div className="flex items-center gap-2 mb-4">
            <div className={`flex items-center gap-1 text-xs font-bold ${trend.positive ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend.positive
                ? <TrendingUp className="w-3.5 h-3.5" />
                : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{trend.value}</span>
            </div>
            <span className="text-[11px] text-gray-400 font-medium">
              {trend.label ?? 'vs yesterday'}
            </span>
          </div>
        ) : (
          <div className="mb-4" />
        )}

        {/* Divider */}
        <div className="border-t border-gray-100 mb-3" />

        {/* Bottom row */}
        <div className="flex items-center justify-between gap-2">
          {SubIcon && (subValue || subLabel) ? (
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: hexToRgba(accentColor, 0.08) }}
              >
                <SubIcon className="w-4 h-4" style={{ color: accentColor }} />
              </div>
              <div className="min-w-0">
                {subValue && (
                  <p className="text-sm font-bold text-gray-800 leading-none">{subValue}</p>
                )}
                {subLabel && (
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5 leading-none">{subLabel}</p>
                )}
              </div>
            </div>
          ) : <div />}

          {updatedLabel && (
            <div className="flex items-center gap-1 text-gray-300 flex-shrink-0">
              <Clock className="w-3 h-3" />
              <span className="text-[10px] font-medium whitespace-nowrap">{updatedLabel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
