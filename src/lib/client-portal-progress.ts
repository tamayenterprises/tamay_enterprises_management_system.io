import type { ProjectStatus } from '@/types/database'

export type ClientProgressTone = 'on_track' | 'attention' | 'complete' | 'info'

export function clientProjectProgress(
  status: ProjectStatus,
  options?: { paymentPercent?: number | null },
): {
  percent: number
  phase: string
  tone: ClientProgressTone
  statusLabel: string
} {
  const paymentPercent =
    options?.paymentPercent != null && Number.isFinite(options.paymentPercent)
      ? Math.max(0, Math.min(100, Math.round(options.paymentPercent)))
      : null

  switch (status) {
    case 'not_started':
      return {
        percent: paymentPercent ?? 8,
        phase: 'Project kickoff',
        tone: 'info',
        statusLabel: 'Getting started',
      }
    case 'in_progress':
      return {
        percent: paymentPercent ?? 55,
        phase: 'Active work in progress',
        tone: 'on_track',
        statusLabel: 'On track',
      }
    case 'waiting':
      return {
        percent: paymentPercent ?? 45,
        phase: 'Waiting on next step',
        tone: 'attention',
        statusLabel: 'Needs attention',
      }
    case 'completed':
      return {
        percent: 100,
        phase: 'Project complete',
        tone: 'complete',
        statusLabel: 'Complete',
      }
    default:
      return {
        percent: paymentPercent ?? 0,
        phase: 'Project status',
        tone: 'info',
        statusLabel: 'In progress',
      }
  }
}

export function paymentProgressPercent(
  currentTotal: number | string | null | undefined,
  totalPaid: number,
): number {
  const total = typeof currentTotal === 'number' ? currentTotal : Number(currentTotal ?? 0)
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((totalPaid / total) * 100)))
}

/** Prefer active work, then waiting, then kickoff, then completed — tie-break by recent update. */
export function pickPrimaryClientProject<T extends { status: ProjectStatus; updated_at: string }>(
  projects: T[],
): T | null {
  if (projects.length === 0) return null
  const rank = (status: ProjectStatus) => {
    switch (status) {
      case 'in_progress':
        return 0
      case 'waiting':
        return 1
      case 'not_started':
        return 2
      case 'completed':
        return 3
      default:
        return 4
    }
  }
  return [...projects].sort((a, b) => {
    const byStatus = rank(a.status) - rank(b.status)
    if (byStatus !== 0) return byStatus
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })[0]
}
