import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  /** Versi lebih rendah untuk bagian sekunder di dalam halaman. */
  compact?: boolean
  /** `error` mewarnai ikon dan diumumkan pembaca layar (role=alert). */
  tone?: 'neutral' | 'error'
}

export default function EmptyState({ icon: Icon, title, description, action, compact = false, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={`flex flex-col items-center rounded-lg bg-card px-6 text-center ${compact ? 'py-8' : 'py-14'}`}
    >
      <Icon className={`${tone === 'error' ? 'text-danger' : 'text-ink-faint'} ${compact ? 'mb-3 h-8 w-8' : 'mb-4 h-10 w-10'}`} aria-hidden="true" />
      <p className="text-balance font-display text-lg font-bold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>
      {action && <div className={compact ? 'mt-4' : 'mt-6'}>{action}</div>}
    </div>
  )
}
