interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  /** Compact variant — less bottom margin, smaller title */
  compact?: boolean
}

export function PageHeader({ title, subtitle, actions, compact = false }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${compact ? 'mb-4' : 'mb-6'}`}>
      <div>
        <h1 className={`font-bold text-gray-900 tracking-tight leading-tight ${compact ? 'text-xl' : 'text-2xl'}`}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-0.5 font-normal">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
