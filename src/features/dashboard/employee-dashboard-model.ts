import { isSameDay } from 'date-fns'
import { currentOrNextIndex } from '@/features/schedule/schedule-links'
import { RELEVANCE_PRIORITY } from '@/features/notifications/relevance'
import type {
  AttendanceRecord,
  Certification,
  MyWorkScheduleItem,
  Notification,
  NotificationRelevance,
} from '@/types/database'

export const DASHBOARD_PREVIEW_LIMIT = 3

export type AttendanceSummary =
  | { kind: 'not_clocked_in' }
  | { kind: 'working' | 'on_break'; since: string; projectId: string | null; projectName: string | null }
  | { kind: 'done_today'; since: string; until: string; paidHours: number | null }

/** Display-only summary of attendance state; actions stay in the time clock. */
export function summarizeAttendance(
  openRecord: AttendanceRecord | null | undefined,
  history: AttendanceRecord[],
  now: Date,
): AttendanceSummary {
  if (openRecord) {
    return {
      kind: openRecord.workflow_status === 'on_break' ? 'on_break' : 'working',
      since: openRecord.clock_in_time,
      projectId: openRecord.project_id,
      projectName: openRecord.project?.name ?? null,
    }
  }
  const latest = history[0]
  if (latest?.clock_out_time && isSameDay(new Date(latest.clock_out_time), now)) {
    return {
      kind: 'done_today',
      since: latest.clock_in_time,
      until: latest.clock_out_time,
      paidHours: latest.paid_hours ?? latest.total_hours,
    }
  }
  return { kind: 'not_clocked_in' }
}

/** Current/next job for the hero; the rest become compact "Also today" rows. */
export function splitTodayJobs(items: MyWorkScheduleItem[], now: Date) {
  const index = currentOrNextIndex(items, now)
  if (index < 0) return { primary: null, highlight: null, others: [] as MyWorkScheduleItem[] }
  const primary = items[index]
  const minutes = now.getHours() * 60 + now.getMinutes()
  const [h, m] = primary.start_time.split(':')
  const started = Number(h) * 60 + Number(m ?? 0) <= minutes
  return {
    primary,
    highlight: (started ? 'now' : 'next') as 'now' | 'next',
    others: items.filter((_, i) => i !== index),
  }
}

const ATTENTION_RELEVANCE = new Set<NotificationRelevance>([
  'requires_attention',
  'mentioned',
  'reply_to_you',
  'reply_to_your_update',
  'you_are_assigned',
])

export type AttentionItem = {
  id: string
  title: string
  body: string
  link: string
  createdAt: string | null
  priority: number
  relevance: NotificationRelevance | 'certification'
}

const CERT_PRIORITY = { expired: 95, expiring_soon: 75 } as const

/**
 * Unread notifications that need the employee (mentions, replies, assignments and
 * schedule changes, announcements flagged "requires attention"), plus their own
 * expired/expiring certifications. Highest priority first, then newest.
 */
export function selectAttentionItems(
  notifications: Notification[],
  certifications: Certification[],
  profileId: string | null | undefined,
): AttentionItem[] {
  const fromNotifications: AttentionItem[] = notifications
    .filter((n) => !n.is_read && n.relevance && ATTENTION_RELEVANCE.has(n.relevance))
    .map((n) => ({
      id: n.id,
      title: n.title,
      body: n.preview_text || n.message,
      link: n.destination_route || n.link || '/notifications',
      createdAt: n.created_at,
      priority: RELEVANCE_PRIORITY[n.relevance!],
      relevance: n.relevance!,
    }))

  const fromCertifications: AttentionItem[] = profileId
    ? certifications
        .filter(
          (c) =>
            c.profile_id === profileId && (c.status === 'expired' || c.status === 'expiring_soon'),
        )
        .map((c) => ({
          id: `cert-${c.id}`,
          title: c.status === 'expired' ? `${c.name} expired` : `${c.name} expiring soon`,
          body: c.expiration_date ? `Expiration date: ${c.expiration_date}` : 'Check your certification.',
          link: '/certifications',
          createdAt: null,
          priority: CERT_PRIORITY[c.status as 'expired' | 'expiring_soon'],
          relevance: 'certification' as const,
        }))
    : []

  return [...fromNotifications, ...fromCertifications].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  })
}

/** First `limit` entries plus how many more exist, for "View N more" toggles. */
export function previewList<T>(items: T[], limit = DASHBOARD_PREVIEW_LIMIT) {
  return { shown: items.slice(0, limit), hidden: items.slice(limit), hiddenCount: Math.max(0, items.length - limit) }
}
