import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  summary: string
  /** Shown when there is nothing to expand (no View button). */
  empty?: boolean
  expandLabel?: string
  collapseLabel?: string
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  actions?: ReactNode
  className?: string
  children?: ReactNode
}

/**
 * Compact project-section accordion. Summary stays visible; list content collapses.
 */
export function CompactAccordion({
  title,
  summary,
  empty = false,
  expandLabel = 'View ▼',
  collapseLabel = 'Hide ▲',
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  actions,
  className,
  children,
}: Props) {
  const reactId = useId()
  const panelId = `${reactId}-panel`
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? Boolean(controlledOpen) : uncontrolledOpen

  function setOpen(next: boolean) {
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  return (
    <div className={cn('rounded-md border border-border', className)}>
      <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium tracking-wide">{title}</p>
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {!empty ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen(!open)}
            >
              {open ? collapseLabel : expandLabel}
            </Button>
          ) : null}
        </div>
      </div>
      {open && !empty ? (
        <div id={panelId} className="space-y-2 border-t border-border px-3 py-2.5">
          {children}
        </div>
      ) : null}
    </div>
  )
}
