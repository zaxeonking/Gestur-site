import type { LucideIcon } from 'lucide-react'

interface SheetActionProps {
  icon: LucideIcon
  label: string
  /** Keterangan kecil di bawah label. */
  hint?: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

/** Satu baris aksi di menu bawah (bottom sheet). Dipakai menu antrean dan menu lagu. */
export default function SheetAction({ icon: Icon, label, hint, onClick, disabled, danger }: SheetActionProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex min-h-[3rem] w-full items-center gap-4 rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors hover:bg-raised active:bg-raised disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
          danger ? 'text-danger' : 'text-ink'
        } focus-ring`}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block">{label}</span>
          {hint && <span className="block text-xs font-normal text-ink-muted">{hint}</span>}
        </span>
      </button>
    </li>
  )
}
