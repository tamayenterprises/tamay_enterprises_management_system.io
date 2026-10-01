import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import type { MyWorkScheduleItem, Project } from '@/types/database'
import type { NavigationTarget } from '@/lib/project-coords'

export function scheduleNavigationTarget(
  item: Pick<MyWorkScheduleItem, 'project_latitude' | 'project_longitude' | 'project_address'>,
): NavigationTarget {
  return {
    latitude: item.project_latitude,
    longitude: item.project_longitude,
    address: item.project_address,
  }
}

/** Canonical job-site address: `job_site_address`, falling back to legacy `location`. */
export function canonicalProjectAddress(
  project?: Pick<Project, 'job_site_address' | 'location'> | null,
): string | null {
  const primary = project?.job_site_address?.trim()
  if (primary) return primary
  const legacy = project?.location?.trim()
  return legacy || null
}

function phoneDigits(raw?: string | null) {
  if (!raw) return null
  const main = raw.split(/(?:ext\.?|extension|x|#)/i)[0] ?? ''
  const hasPlus = main.trim().startsWith('+')
  const digits = main.replace(/\D/g, '')
  if (!digits) return null
  return { digits, hasPlus }
}

/**
 * `tel:` href for a stored free-text phone. US 10-digit numbers get +1.
 * Returns null when the value cannot be dialed, so no broken Call button renders.
 */
export function phoneHref(raw?: string | null): string | null {
  const parsed = phoneDigits(raw)
  if (!parsed) return null
  const { digits, hasPlus } = parsed
  if (hasPlus && digits.length >= 8 && digits.length <= 15) return `tel:+${digits}`
  if (digits.length === 10) return `tel:+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`
  if (digits.length >= 8 && digits.length <= 15) return `tel:+${digits}`
  if (digits.length === 7) return `tel:${digits}`
  return null
}

/** Friendly display: (203) 555-1234 for US numbers, otherwise the trimmed original. */
export function formatPhoneDisplay(raw?: string | null): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  const parsed = phoneDigits(trimmed)
  if (!parsed) return trimmed
  let { digits } = parsed
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return trimmed
}

/** "07:00:00" → "7:00 AM" */
export function formatScheduleTime(value?: string | null): string {
  if (!value) return ''
  const [h, m] = value.split(':')
  const hours = Number(h)
  const minutes = Number(m ?? 0)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

export function formatScheduleTimeRange(start: string, end?: string | null): string {
  const from = formatScheduleTime(start)
  return end ? `${from} – ${formatScheduleTime(end)}` : from
}

/** "07:00:00" → "07:00" for <input type="time">. */
export function toTimeInputValue(value?: string | null): string {
  if (!value) return ''
  return value.slice(0, 5)
}

export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function parseDateKey(key: string): Date {
  return parseISO(key)
}

/** Work weeks start Monday. */
export function weekDays(anchor: Date): string[] {
  const start = startOfWeek(anchor, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)))
}

export function scheduleDayLabel(key: string, todayKey: string): string {
  const date = parseDateKey(key)
  if (key === todayKey) return `Today · ${format(date, 'EEE, MMM d')}`
  return format(date, 'EEEE, MMM d')
}

function toMinutes(value: string) {
  const [h, m] = value.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

/** Overlap on the same day. An open-ended entry (no end time) runs until end of day. */
export function timesOverlap(
  a: { start_time: string; end_time?: string | null },
  b: { start_time: string; end_time?: string | null },
): boolean {
  const endOfDay = 24 * 60
  const aStart = toMinutes(a.start_time)
  const aEnd = a.end_time ? toMinutes(a.end_time) : endOfDay
  const bStart = toMinutes(b.start_time)
  const bEnd = b.end_time ? toMinutes(b.end_time) : endOfDay
  return aStart < bEnd && bStart < aEnd
}

/** Pick the job to highlight today: the one in progress, else the next one, else the last one. */
export function currentOrNextIndex(
  items: Array<{ start_time: string; end_time?: string | null }>,
  now: Date,
): number {
  if (items.length === 0) return -1
  const minutes = now.getHours() * 60 + now.getMinutes()
  const index = items.findIndex((item) => {
    const end = item.end_time ? toMinutes(item.end_time) : 24 * 60
    return end > minutes
  })
  return index === -1 ? items.length - 1 : index
}
