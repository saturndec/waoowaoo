'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, disabled = false, onCheckedChange, onClick, ...props }, ref) => {
    const dataState = checked ? 'checked' : 'unchecked'

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        data-state={dataState}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event)
          if (event.defaultPrevented || disabled) return
          onCheckedChange?.(!checked)
        }}
        className={cn(
          'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border px-0.5 shadow-inner transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'border-primary bg-primary' : 'border-zinc-400 bg-zinc-300',
          className,
        )}
        {...props}
      >
        <span
          data-state={dataState}
          className={cn(
            'pointer-events-none block h-5 w-5 rounded-full border border-zinc-200 bg-zinc-50 shadow-sm transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    )
  },
)

Switch.displayName = 'Switch'

export { Switch }
