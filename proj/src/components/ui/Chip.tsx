import type { ButtonHTMLAttributes } from 'react'

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export default function Chip({ active = false, className = '', children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex h-10 shrink-0 select-none items-center rounded-full px-4 text-sm font-medium transition-[background-color,transform] duration-150 active:scale-[0.97] focus-ring motion-reduce:active:scale-100 ${
        active ? 'bg-accent text-black hover:bg-accent-soft' : 'bg-raised text-ink hover:bg-raised-hover'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
