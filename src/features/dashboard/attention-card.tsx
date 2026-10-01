import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ExpandableText } from '@/components/ui/disclosure'
import { useAuth } from '@/features/auth/auth-hooks'
import { useCertifications } from '@/features/data/hooks'
import { useNotifications } from '@/features/notifications/hooks'
import { relevanceLabel } from '@/features/notifications/relevance'
import { formatRelative, cn } from '@/lib/utils'
import { DashboardSectionTitle } from '@/features/dashboard/dashboard-section-title'
import {
  previewList,
  selectAttentionItems,
  type AttentionItem,
} from '@/features/dashboard/employee-dashboard-model'

function AttentionRow({ item }: { item: AttentionItem }) {
  const meta = item.relevance === 'certification' ? 'Certification' : relevanceLabel(item.relevance)
  return (
    <li className="flex gap-2.5 py-2.5">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <Link
          to={item.link}
          className="block font-semibold leading-snug text-primary underline-offset-2 hover:underline"
        >
          {item.title}
        </Link>
        <ExpandableText text={item.body} lines={2} className="text-sm text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {meta}
          {item.createdAt ? ` · ${formatRelative(item.createdAt)}` : ''}
        </p>
      </div>
    </li>
  )
}

export function AttentionCard() {
  const { profile } = useAuth()
  const listId = `${useId()}-list`
  const [expanded, setExpanded] = useState(false)
  const { data: notifications = [], isLoading } = useNotifications({ status: 'unread', limit: 30 })
  const { data: certifications = [] } = useCertifications()

  const items = useMemo(
    () => selectAttentionItems(notifications, certifications, profile?.id),
    [notifications, certifications, profile?.id],
  )
  const { shown, hidden, hiddenCount } = previewList(items)

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <DashboardSectionTitle
          icon={BellRing}
          trailing={
            items.length > 0 ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
                {items.length}
              </span>
            ) : null
          }
        >
          Needs Your Attention
        </DashboardSectionTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!isLoading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : null}

        {shown.length > 0 ? (
          <ul id={listId} className="divide-y divide-border">
            {shown.map((item) => (
              <AttentionRow key={item.id} item={item} />
            ))}
            {expanded
              ? hidden.map((item) => (
                  <AttentionRow key={item.id} item={item} />
                ))
              : null}
          </ul>
        ) : null}

        {hiddenCount > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
            className="flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-sm font-semibold text-primary transition hover:bg-accent/10 aria-expanded:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>{expanded ? 'Show less' : `View ${hiddenCount} more`}</span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')}
              aria-hidden
            />
          </button>
        ) : null}

        <Link
          to="/notifications"
          className="flex min-h-11 items-center justify-between rounded-lg px-2 text-sm font-semibold text-primary transition hover:bg-accent/10"
        >
          All notifications
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  )
}
