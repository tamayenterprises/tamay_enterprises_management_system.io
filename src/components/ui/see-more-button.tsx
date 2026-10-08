import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function SeeMoreButton({
  shown,
  total,
  step,
  onMore,
}: {
  shown: number
  total: number
  step: number
  onMore: () => void
}) {
  if (total <= shown) return null
  const remaining = total - shown
  const next = Math.min(step, remaining)
  return (
    <Button type="button" size="sm" variant="outline" className="w-full" onClick={onMore}>
      See {next} more{remaining > next ? ` · ${remaining} left` : ''}
    </Button>
  )
}

/** On phones, hide a preview list until the user taps See more. Desktop keeps the list visible. */
export function MobileListGate({
  children,
  enabled = true,
  expandLabel = 'See more',
  collapseLabel = 'Show less',
}: {
  children: ReactNode
  enabled?: boolean
  expandLabel?: string
  collapseLabel?: string
}) {
  const [open, setOpen] = useState(false)
  if (!enabled) return <>{children}</>
  return (
    <div className="space-y-3">
      <div className={open ? 'block space-y-3' : 'hidden space-y-3 lg:block'}>{children}</div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full lg:hidden"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? collapseLabel : expandLabel}
      </Button>
    </div>
  )
}
