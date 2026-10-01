import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Chevron row that reveals secondary content. Closed by default.
 * `desktopOpen` keeps the content visible at lg+ and hides the toggle there.
 */
export function Disclosure({
  label,
  count,
  defaultOpen = false,
  desktopOpen = false,
  className,
  panelClassName,
  children,
}: {
  label: string
  count?: number
  defaultOpen?: boolean
  desktopOpen?: boolean
  className?: string
  panelClassName?: string
  children: ReactNode
}) {
  const panelId = `${useId()}-panel`
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-sm font-semibold text-primary transition-colors hover:bg-accent/10 aria-expanded:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          desktopOpen && 'lg:hidden',
        )}
      >
        <span>
          {label}
          {count != null ? <span className="font-medium text-muted-foreground"> ({count})</span> : null}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        className={cn(
          open ? 'block animate-fade-in' : 'hidden',
          desktopOpen && 'lg:block',
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}

const CLAMP_CLASS: Record<2 | 3, string> = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
}

/**
 * Clamps long text on mobile with an accessible Show more / Show less toggle.
 * The toggle only appears when the text actually overflows. No clamp at lg+.
 */
export function ExpandableText({
  text,
  lines = 3,
  className,
}: {
  text: string
  lines?: 2 | 3
  className?: string
}) {
  const textId = `${useId()}-text`
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  // Re-measure on size changes too: text inside a closed Disclosure is display:none at mount.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || expanded) return
    const measure = () => setOverflowing(node.scrollHeight > node.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [expanded, text, lines])

  return (
    <div>
      <p
        id={textId}
        ref={ref}
        className={cn('whitespace-pre-line', !expanded && CLAMP_CLASS[lines], 'lg:line-clamp-none', className)}
      >
        {text}
      </p>
      {overflowing || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex min-h-11 items-center text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  )
}
