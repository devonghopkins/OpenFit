import * as React from 'react'
import { cn } from '@/lib/utils'

/** Native <select> (uses the iOS picker wheel) styled to match Input. */
const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
