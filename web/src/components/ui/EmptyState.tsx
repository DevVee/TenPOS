import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  compact?: boolean
}

export function EmptyState({ icon: Icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-10 px-4' : 'py-16 px-6'}`}>
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3 flex-shrink-0">
        <Icon className="w-5 h-5 text-gray-400" />
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-gray-700 mb-1">{title}</p>

      {/* Description */}
      {description && (
        <p className="text-sm text-gray-400 max-w-[280px] leading-relaxed">{description}</p>
      )}

      {/* CTA */}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
