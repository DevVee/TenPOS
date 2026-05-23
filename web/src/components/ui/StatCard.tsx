import { TrendingUp, TrendingDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type IconColor = 'emerald' | 'blue' | 'violet' | 'amber' | 'red' | 'orange' | 'gray'

const ICON_STYLES: Record<IconColor, { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-50 border border-emerald-100', text: 'text-emerald-600' },
  blue:    { bg: 'bg-blue-50    border border-blue-100',    text: 'text-blue-600'    },
  violet:  { bg: 'bg-violet-50  border border-violet-100',  text: 'text-violet-600'  },
  amber:   { bg: 'bg-amber-50   border border-amber-100',   text: 'text-amber-600'   },
  red:     { bg: 'bg-red-50     border border-red-100',     text: 'text-red-500'     },
  orange:  { bg: 'bg-orange-50  border border-orange-100',  text: 'text-orange-600'  },
  gray:    { bg: 'bg-gray-100   border border-gray-200',    text: 'text-gray-500'    },
}

interface StatCardProps {
  label: string
  value: string
  icon?: LucideIcon
  iconColor?: IconColor
  live?: boolean
  trend?: { value: string; positive: boolean; label?: string }
  subValue?: string
  subLabel?: string
  /** Sparkline data — array of numbers */
  sparkline?: number[]
}

// ── Mini sparkline ─────────────────────────────────────────────────────────────
function SparkLine({ data, positive = true }: { data: number[]; positive?: boolean }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const W = 80
  const H = 32
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - 4 - ((v - min) / range) * (H - 10),
  }))
  const d = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
    const prev = pts[i - 1]
    const cpX = (p.x - prev.x) / 2
    return `${acc} C${(prev.x + cpX).toFixed(1)},${prev.y.toFixed(1)} ${(p.x - cpX).toFixed(1)},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }, '')
  const last = pts[pts.length - 1]
  const color = positive ? '#059669' : '#DC2626'

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="flex-shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <circle cx={last.x} cy={last.y} r="2.5" fill={color} />
    </svg>
  )
}

// ── StatCard ───────────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = 'gray',
  live = false,
  trend,
  subValue,
  subLabel,
  sparkline,
}: StatCardProps) {
  const trendPositive = trend?.positive ?? true
  const ic = ICON_STYLES[iconColor]

  return (
    <div className="card p-5 hover:shadow-lift transition-shadow duration-200">

      {/* Label row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="kpi-label">{label}</p>
          {live && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-medium text-emerald-600">Live</span>
            </span>
          )}
        </div>
        {Icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ic.bg}`}>
            <Icon className={`w-4 h-4 ${ic.text}`} />
          </div>
        )}
      </div>

      {/* Value */}
      <p className="text-[32px] font-extrabold text-gray-900 tabular-nums tracking-tight leading-none mb-2">
        {value}
      </p>

      {/* Trend + sparkline */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          {/* Trend badge */}
          {trend ? (
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md leading-none
                  ${trendPositive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-600'
                  }`}
              >
                {trendPositive
                  ? <TrendingUp className="w-3 h-3" />
                  : <TrendingDown className="w-3 h-3" />
                }
                {trend.value}
              </span>
              <span className="text-xs text-gray-400 font-normal">{trend.label ?? 'vs yesterday'}</span>
            </div>
          ) : (
            <div className="h-[22px]" /> /* placeholder height */
          )}

          {/* Sub stat */}
          {(subValue || subLabel) && (
            <p className="text-xs text-gray-500">
              {subValue && <span className="font-semibold text-gray-700">{subValue}</span>}
              {subValue && subLabel && ' '}
              {subLabel && <span>{subLabel}</span>}
            </p>
          )}
        </div>

        {/* Sparkline */}
        {sparkline && sparkline.length >= 2 && (
          <SparkLine data={sparkline} positive={trendPositive} />
        )}
      </div>
    </div>
  )
}
