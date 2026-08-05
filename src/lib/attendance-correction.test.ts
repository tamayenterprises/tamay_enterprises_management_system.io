import { describe, expect, it } from 'vitest'
import {
  buildSimpleCorrectionPreview,
  fromLocalInputValue,
  toLocalInputValue,
} from '@/lib/attendance-correction'

describe('attendance correction reconstruction', () => {
  it('reconstructs missing break end + clock out for John Lopez scenario', () => {
    const clockIn = '2026-08-04T14:27:00.000Z' // 10:27 AM EDT
    const breakStart = '2026-08-04T16:59:00.000Z' // 12:59 PM EDT
    const clockOut = '2026-08-04T23:23:00.000Z' // 7:23 PM EDT

    const preview = buildSimpleCorrectionPreview({
      clockInIso: clockIn,
      clockOutIso: clockOut,
      breakMinutes: 30,
      originalBreakStartedAt: breakStart,
    })

    expect(preview.status).toBe('completed')
    expect(preview.breakSeconds).toBe(1800)
    expect(preview.timeline.map((e) => e.action)).toEqual([
      'WORK_STARTED',
      'BREAK_STARTED',
      'BREAK_ENDED',
      'WORK_ENDED',
    ])
    expect(preview.timeline[2]?.timestamp).toBe('2026-08-04T17:29:00.000Z') // 1:29 PM EDT
    // 8h 56m - 30m = 8h 26m = 8.43h rounded to 2 decimals from seconds
    expect(preview.elapsedSeconds).toBe(8 * 3600 + 56 * 60)
    expect(preview.paidHours).toBe(8.43)
  })

  it('rejects break longer than the workday', () => {
    expect(() =>
      buildSimpleCorrectionPreview({
        clockInIso: '2026-08-04T14:27:00.000Z',
        clockOutIso: '2026-08-04T15:27:00.000Z',
        breakMinutes: 90,
        originalBreakStartedAt: '2026-08-04T14:40:00.000Z',
      }),
    ).toThrow(/Break time cannot exceed/)
  })

  it('parses datetime-local without ambiguous locale strings', () => {
    const iso = fromLocalInputValue('2026-08-04T10:27')
    expect(toLocalInputValue(iso)).toBe('2026-08-04T10:27')
  })
})
