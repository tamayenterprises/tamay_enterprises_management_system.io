import { describe, expect, it } from 'vitest'
import {
  previewList,
  selectAttentionItems,
  splitTodayJobs,
  summarizeAttendance,
} from '@/features/dashboard/employee-dashboard-model'
import type { AttendanceRecord, Certification, MyWorkScheduleItem, Notification } from '@/types/database'

function job(id: string, start: string, end: string | null): MyWorkScheduleItem {
  return {
    entry_id: id,
    work_date: '2026-09-30',
    start_time: start,
    end_time: end,
    task: 'Task',
    notes: null,
    project_id: `p-${id}`,
    project_name: `Project ${id}`,
    project_address: null,
    project_latitude: null,
    project_longitude: null,
    client_name: null,
    client_phone: null,
    crew: [],
    updated_at: '2026-09-29T00:00:00Z',
  }
}

function attendance(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: 'a1',
    organization_id: 'o',
    user_id: 'u',
    project_id: 'p1',
    clock_in_time: '2026-09-30T12:03:00Z',
    clock_out_time: null,
    total_hours: null,
    paid_hours: null,
    break_seconds: 0,
    workflow_status: 'working',
    active_break_started_at: null,
    geofence_enforced: true,
    notes: null,
    created_at: '2026-09-30T12:03:00Z',
    updated_at: '2026-09-30T12:03:00Z',
    ...overrides,
  }
}

function notification(overrides: Partial<Notification>): Notification {
  return {
    id: 'n',
    organization_id: 'o',
    recipient_id: 'u',
    title: 'Title',
    message: 'Message',
    link: null,
    is_read: false,
    created_at: '2026-09-30T10:00:00Z',
    ...overrides,
  }
}

describe('summarizeAttendance', () => {
  const now = new Date(2026, 8, 30, 14, 0)

  it('reports working and on-break from the open record', () => {
    expect(summarizeAttendance(attendance({}), [], now).kind).toBe('working')
    expect(summarizeAttendance(attendance({ workflow_status: 'on_break' }), [], now).kind).toBe('on_break')
  })

  it('reports done for today only when the latest shift closed today', () => {
    const closedToday = attendance({ clock_out_time: new Date(2026, 8, 30, 12, 0).toISOString() })
    const closedYesterday = attendance({ clock_out_time: new Date(2026, 8, 29, 16, 0).toISOString() })
    expect(summarizeAttendance(null, [closedToday], now).kind).toBe('done_today')
    expect(summarizeAttendance(null, [closedYesterday], now).kind).toBe('not_clocked_in')
    expect(summarizeAttendance(null, [], now).kind).toBe('not_clocked_in')
  })
})

describe('splitTodayJobs', () => {
  it('puts the current job first and the rest in others', () => {
    const items = [job('a', '07:00', '09:00'), job('b', '09:30', '12:00'), job('c', '13:00', null)]
    const result = splitTodayJobs(items, new Date(2026, 8, 30, 10, 0))
    expect(result.primary?.entry_id).toBe('b')
    expect(result.highlight).toBe('now')
    expect(result.others.map((i) => i.entry_id)).toEqual(['a', 'c'])
  })

  it('marks an upcoming job as next and handles an empty day', () => {
    const result = splitTodayJobs([job('a', '15:00', '17:00')], new Date(2026, 8, 30, 8, 0))
    expect(result.highlight).toBe('next')
    expect(splitTodayJobs([], new Date()).primary).toBeNull()
  })
})

describe('selectAttentionItems', () => {
  it('keeps only unread, employee-relevant notifications', () => {
    const items = selectAttentionItems(
      [
        notification({ id: 'mention', relevance: 'mentioned' }),
        notification({ id: 'schedule', relevance: 'you_are_assigned' }),
        notification({ id: 'general', relevance: 'general' }),
        notification({ id: 'project', relevance: 'assigned_project' }),
        notification({ id: 'read', relevance: 'mentioned', is_read: true }),
        notification({ id: 'legacy', relevance: null }),
      ],
      [],
      'u',
    )
    expect(items.map((i) => i.id)).toEqual(['mention', 'schedule'])
  })

  it('adds only my expired/expiring certifications and sorts by priority', () => {
    const cert = (id: string, profileId: string, status: Certification['status']) =>
      ({ id, profile_id: profileId, status, name: id, expiration_date: '2026-10-01' }) as Certification
    const items = selectAttentionItems(
      [notification({ id: 'assigned', relevance: 'you_are_assigned' })],
      [cert('mine-expired', 'u', 'expired'), cert('mine-valid', 'u', 'valid'), cert('other', 'x', 'expired')],
      'u',
    )
    expect(items.map((i) => i.id)).toEqual(['cert-mine-expired', 'assigned'])
  })
})

describe('previewList', () => {
  it('shows at most three and counts the rest', () => {
    expect(previewList([1, 2, 3, 4, 5, 6])).toEqual({ shown: [1, 2, 3], hidden: [4, 5, 6], hiddenCount: 3 })
    expect(previewList([1, 2]).hiddenCount).toBe(0)
  })
})
