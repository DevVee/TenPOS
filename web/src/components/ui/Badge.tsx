type BadgeVariant = 'red' | 'green' | 'yellow' | 'blue' | 'gray' | 'purple' | 'orange'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  dot?: boolean
}

const variantClass: Record<BadgeVariant, string> = {
  green:  'badge-green',
  red:    'badge-red',
  yellow: 'badge-yellow',
  blue:   'badge-blue',
  gray:   'badge-gray',
  purple: 'badge-purple',
  orange: 'badge-orange',
}

const dotColor: Record<BadgeVariant, string> = {
  green:  'bg-emerald-500',
  red:    'bg-red-500',
  yellow: 'bg-amber-500',
  blue:   'bg-blue-500',
  gray:   'bg-gray-400',
  purple: 'bg-violet-500',
  orange: 'bg-orange-500',
}

export function Badge({ variant = 'gray', children, dot = false }: BadgeProps) {
  return (
    <span className={variantClass[variant]}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor[variant]}`} />}
      {children}
    </span>
  )
}
