import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Native HTML select — much snappier than Radix Select on phones,
 * especially inside dialogs where portal/focus restore feels laggy.
 */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<'select'>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-11 w-full appearance-none rounded-xl border border-input bg-white bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      // Chevron without an extra icon dependency
      "bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E')]",
      className,
    )}
    {...props}
  >
    {children}
  </select>
))
NativeSelect.displayName = 'NativeSelect'
