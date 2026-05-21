import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  trend?: { value: string; positive: boolean }
  iconColor?: string
  iconBg?: string
}

export function StatCard({
  label, value, sub, icon: Icon, trend,
  iconColor = 'text-brand', iconBg = 'bg-brand-pale',
}: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider leading-none">
            {label}
          </p>
          <p className="text-3xl font-bold text-gray-900 mt-2 leading-none tabular-nums">
            {value}
          </p>
          {sub && (
            <p className="text-xs text-gray-400 mt-1.5 font-medium">{sub}</p>
          )}
          {trend && (
            <p className={`text-xs font-semibold mt-2 ${trend.positive ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend.positive ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </div>
    </div>
  )
}
