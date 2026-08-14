/** Shared attendance correction preview / reconstruction helpers (client-side). */

export type CorrectionMode = 'simple' | 'detailed'

export type CorrectionReasonCode =
  | 'forgot_clock_in'
  | 'forgot_clock_out'
  | 'forgot_start_break'
  | 'forgot_end_break'
  | 'incorrect_time'
  | 'incorrect_project'
  | 'duplicate_event'
  | 'accidental_break'
  | 'incomplete_workday'
  | 'gps_location_issue'
  | 'system_error'
  | 'other'

export const CORRECTION_REASON_OPTIONS: { value: CorrectionReasonCode; label: string }[] = [
  { value: 'forgot_clock_in', label: 'Forgot to Clock In' },
  { value: 'forgot_clock_out', label: 'Forgot to Clock Out' },
  { value: 'forgot_start_break', label: 'Forgot to Start Break' },
  { value: 'forgot_end_break', label: 'Forgot to End Break' },
  { value: 'incorrect_time', label: 'Incorrect Time' },
  { value: 'incorrect_project', label: 'Incorrect Project' },
  { value: 'duplicate_event', label: 'Duplicate Event' },
  { value: 'accidental_break', label: 'Accidental Break' },
  { value: 'incomplete_workday', label: 'Incomplete Workday' },
  { value: 'gps_location_issue', label: 'GPS or Location Issue' },
  { value: 'system_error', label: 'System Error' },
  { value: 'other', label: 'Other' },
]

export type TimelineEventInput = {
  action: 'WORK_STARTED' | 'BREAK_STARTED' | 'BREAK_ENDED' | 'WORK_ENDED'
  timestamp: string
  exclude?: boolean
}

export type CorrectionPreview = {
  clockIn: string
  clockOut: string | null
  breakSeconds: number
  elapsedSeconds: number | null
  paidHours: number | null
  totalHours: number | null
  timeline: TimelineEventInput[]
  warnings: string[]
  status: 'working' | 'on_break' | 'completed' | 'incomplete'
}

/** Parse datetime-local (no timezone) as local wall time → ISO UTC. */
export function fromLocalInputValue(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!match) {
    throw new Error('The entered date or time could not be processed.')
  }
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0),
    0,
  )
  if (Number.isNaN(date.getTime())) {
    throw new Error('The entered date or time could not be processed.')
  }
  return date.toISOString()
}

export function toLocalInputValue(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function buildSimpleCorrectionPreview(input: {
  clockInIso: string
  clockOutIso: string | null
  breakMinutes: number
  originalBreakStartedAt?: string | null
}): CorrectionPreview {
  const warnings: string[] = []
  const clockInMs = new Date(input.clockInIso).getTime()
  const clockOutMs = input.clockOutIso ? new Date(input.clockOutIso).getTime() : null
  const breakSeconds = Math.max(0, Math.round(Number(input.breakMinutes || 0) * 60))

  if (Number.isNaN(clockInMs)) {
    throw new Error('The entered date or time could not be processed.')
  }
  if (clockOutMs != null && Number.isNaN(clockOutMs)) {
    throw new Error('The entered date or time could not be processed.')
  }
  if (clockOutMs != null && clockOutMs <= clockInMs) {
    throw new Error('Clock Out must be later than Clock In.')
  }

  const timeline: TimelineEventInput[] = [
    { action: 'WORK_STARTED', timestamp: input.clockInIso },
  ]

  if (breakSeconds > 0) {
    let breakStartMs = input.originalBreakStartedAt
      ? new Date(input.originalBreakStartedAt).getTime()
      : null
    if (breakStartMs == null || Number.isNaN(breakStartMs)) {
      if (clockOutMs == null) {
        throw new Error(
          'This correction cannot be saved because the break is missing a start time. Use Detailed Timeline to enter Break Start and Break End.',
        )
      }
      breakStartMs = clockInMs + (clockOutMs - clockInMs) / 2 - (breakSeconds * 1000) / 2
      warnings.push('Break Start was estimated because no original break start was found.')
    }
    const breakEndMs = breakStartMs + breakSeconds * 1000
    if (breakStartMs <= clockInMs) {
      throw new Error('Break Start must be later than Clock In.')
    }
    if (clockOutMs != null && breakEndMs > clockOutMs) {
      throw new Error('A break ends after the selected Clock Out time.')
    }
    timeline.push({ action: 'BREAK_STARTED', timestamp: new Date(breakStartMs).toISOString() })
    timeline.push({ action: 'BREAK_ENDED', timestamp: new Date(breakEndMs).toISOString() })
  } else if (input.originalBreakStartedAt) {
    warnings.push(
      'Total break is 0 minutes. The open Break Start will be excluded from paid-time calculation and preserved in audit history.',
    )
  }

  if (input.clockOutIso) {
    timeline.push({ action: 'WORK_ENDED', timestamp: input.clockOutIso })
  }

  const elapsedSeconds =
    clockOutMs != null ? Math.max(0, Math.round((clockOutMs - clockInMs) / 1000)) : null
  if (elapsedSeconds != null && breakSeconds > elapsedSeconds) {
    throw new Error('Break time cannot exceed the total work-session duration.')
  }

  const totalHours = elapsedSeconds != null ? Math.round((elapsedSeconds / 3600) * 100) / 100 : null
  const paidHours =
    elapsedSeconds != null
      ? Math.max(0, Math.round(((elapsedSeconds - breakSeconds) / 3600) * 100) / 100)
      : null

  if (breakSeconds > 0 && input.originalBreakStartedAt) {
    warnings.push('End Break will be generated from Break Start + total break minutes.')
  }
  if (input.clockOutIso) {
    warnings.push('Clock Out will close the work session and clear any active break.')
  }

  return {
    clockIn: input.clockInIso,
    clockOut: input.clockOutIso,
    breakSeconds,
    elapsedSeconds,
    paidHours,
    totalHours,
    timeline,
    warnings,
    status: input.clockOutIso ? 'completed' : 'incomplete',
  }
}

export function buildDetailedCorrectionPreview(events: TimelineEventInput[]): CorrectionPreview {
  const active = events
    .filter((e) => !e.exclude)
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const clockIn = active.find((e) => e.action === 'WORK_STARTED')
  const clockOut = [...active].reverse().find((e) => e.action === 'WORK_ENDED')
  if (!clockIn) throw new Error('Clock In is required.')

  let openBreak: string | null = null
  let breakSeconds = 0
  for (const event of active) {
    const ts = new Date(event.timestamp).getTime()
    if (Number.isNaN(ts)) throw new Error('The entered date or time could not be processed.')
    if (event.action === 'BREAK_STARTED') {
      if (openBreak) throw new Error('Breaks do not overlap. End the previous break before starting another.')
      if (ts <= new Date(clockIn.timestamp).getTime()) {
        throw new Error('Break Start must be later than Clock In.')
      }
      openBreak = event.timestamp
    } else if (event.action === 'BREAK_ENDED') {
      if (!openBreak) throw new Error('Every Break Start must have one Break End.')
      const start = new Date(openBreak).getTime()
      if (ts <= start) throw new Error('Break End must be later than Break Start.')
      if (clockOut && ts > new Date(clockOut.timestamp).getTime()) {
        throw new Error('A break ends after the selected Clock Out time.')
      }
      breakSeconds += Math.round((ts - start) / 1000)
      openBreak = null
    } else if (event.action === 'WORK_ENDED') {
      if (openBreak) {
        throw new Error(
          'This correction cannot be saved because the break is missing an ending time. Enter a Break End or use Simple Correction to generate it.',
        )
      }
      if (ts <= new Date(clockIn.timestamp).getTime()) {
        throw new Error('Clock Out must be later than Clock In.')
      }
    }
  }

  if (openBreak && clockOut) {
    throw new Error(
      'This correction cannot be saved because the break is missing an ending time. Enter a Break End or use Simple Correction to generate it.',
    )
  }

  const clockInIso = clockIn.timestamp
  const clockOutIso = clockOut?.timestamp ?? null
  const elapsedSeconds = clockOutIso
    ? Math.max(0, Math.round((new Date(clockOutIso).getTime() - new Date(clockInIso).getTime()) / 1000))
    : null
  if (elapsedSeconds != null && breakSeconds > elapsedSeconds) {
    throw new Error('Break time cannot exceed the total work-session duration.')
  }

  return {
    clockIn: clockInIso,
    clockOut: clockOutIso,
    breakSeconds,
    elapsedSeconds,
    paidHours:
      elapsedSeconds != null
        ? Math.max(0, Math.round(((elapsedSeconds - breakSeconds) / 3600) * 100) / 100)
        : null,
    totalHours: elapsedSeconds != null ? Math.round((elapsedSeconds / 3600) * 100) / 100 : null,
    timeline: active,
    warnings: events.some((e) => e.exclude)
      ? ['One or more original events are excluded from the active calculation.']
      : [],
    status: clockOutIso ? 'completed' : openBreak ? 'on_break' : 'working',
  }
}

export function recommendDetailedMode(input: {
  eventCount: number
  missingBreakEnd: boolean
  missingClockOut: boolean
  breakEventCount: number
  hasDuplicates?: boolean
}): boolean {
  if (input.hasDuplicates) return true
  if (input.breakEventCount > 2) return true
  if (input.missingBreakEnd && input.missingClockOut && input.breakEventCount > 1) return true
  return false
}
