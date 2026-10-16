import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export default function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
