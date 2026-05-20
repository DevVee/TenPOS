type BadgeVariant = 'red' | 'green' | 'yellow' | 'blue' | 'gray'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
}

const variantClass: Record<BadgeVariant, string> = {
  red: 'badge-red',
  green: 'badge-green',
  yellow: 'badge-yellow',
  blue: 'badge-blue',
  gray: 'badge-gray',
}

export function Badge({ variant = 'gray', children }: BadgeProps) {
  return <span className={variantClass[variant]}>{children}</span>
}
