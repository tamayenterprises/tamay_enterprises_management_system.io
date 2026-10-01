import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Employee Dashboard section header: navy icon block with a gold icon, navy title. */
export function DashboardSectionTitle({
  icon: Icon,
  children,
  trailing,
}: {
  icon: LucideIcon
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <h3 className="flex items-center gap-2.5 font-display text-lg font-semibold leading-tight tracking-tight text-primary">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-accent">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span>{children}</span>
      {trailing}
    </h3>
  )
}
