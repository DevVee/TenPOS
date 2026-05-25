interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  /** Compact variant — less bottom margin, smaller title */
  compact?: boolean
}

export function PageHeader({ title, subtitle, actions, compact = false }: PageHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between space-y-2 sm:space-y-0 ${compact ? 'mb-4 md:mb-5' : 'mb-5 md:mb-7'}`}>
      <div className="min-w-0">
        <h1 className={`font-bold text-gray-900 tracking-tight leading-tight ${compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'}`}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 font-normal leading-snug">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center space-x-2 flex-wrap flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
