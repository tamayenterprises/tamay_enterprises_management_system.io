import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WARRANTY_NOTE,
  canCloseWorkOrder,
  formatMoney,
  formatWorkOrderNumber,
  isOpenWorkOrder,
  sortWorkOrders,
  subcontractorActions,
  workOrderFilePath,
  workOrderGroup,
} from './work-orders'

describe('work order helpers', () => {
  it('subcontractor actions follow the status flow; Work Completed and Closed are read-only', () => {
    expect(subcontractorActions('assigned')).toEqual(['accept'])
    expect(subcontractorActions('accepted')).toEqual(['start'])
    expect(subcontractorActions('in_progress')).toEqual(['add_update', 'complete'])
    expect(subcontractorActions('work_completed')).toEqual([])
    expect(subcontractorActions('closed')).toEqual([])
  })

  it('only Admin and PM can close, and not twice', () => {
    expect(canCloseWorkOrder('admin', 'work_completed')).toBe(true)
    expect(canCloseWorkOrder('project_manager', 'in_progress')).toBe(true)
    expect(canCloseWorkOrder('subcontractor', 'work_completed')).toBe(false)
    expect(canCloseWorkOrder('employee', 'work_completed')).toBe(false)
    expect(canCloseWorkOrder('admin', 'closed')).toBe(false)
  })

  it('dashboard groups: Assigned (incl. Accepted), In Progress, Work Completed (incl. Closed)', () => {
    expect(workOrderGroup('assigned')).toBe('assigned')
    expect(workOrderGroup('accepted')).toBe('assigned')
    expect(workOrderGroup('in_progress')).toBe('in_progress')
    expect(workOrderGroup('work_completed')).toBe('work_completed')
    expect(workOrderGroup('closed')).toBe('work_completed')
    expect(isOpenWorkOrder('accepted')).toBe(true)
    expect(isOpenWorkOrder('work_completed')).toBe(false)
  })

  it('lists in-progress first, then accepted, assigned, completed; newest first within a status', () => {
    const rows = [
      { id: 'done', status: 'work_completed' as const, created_at: '2026-03-01' },
      { id: 'old', status: 'assigned' as const, created_at: '2026-01-01' },
      { id: 'new', status: 'assigned' as const, created_at: '2026-02-01' },
      { id: 'ok', status: 'accepted' as const, created_at: '2026-01-01' },
      { id: 'busy', status: 'in_progress' as const, created_at: '2026-01-01' },
    ]
    expect(sortWorkOrders(rows).map((row) => row.id)).toEqual(['busy', 'ok', 'new', 'old', 'done'])
  })

  it('formats numbers and money', () => {
    expect(formatWorkOrderNumber(1001)).toBe('WO-1001')
    expect(formatWorkOrderNumber(null)).toBe('WO')
    expect(formatMoney(4500)).toBe('$4,500.00')
    expect(formatMoney('1250.5')).toBe('$1,250.50')
    expect(formatMoney(null)).toBe('—')
  })

  it('stores reference files and update photos in their own folders of the work order', () => {
    expect(workOrderFilePath('wo-1', 'reference', 'Plan A.pdf', 1, 'abc')).toBe('wo-1/reference/1-abc-Plan A.pdf')
    expect(workOrderFilePath('wo-1', 'update_photo', '../x?.jpg', 2, 'def')).toBe('wo-1/updates/2-def-._x_.jpg')
    expect(workOrderFilePath('wo-1', 'update_photo', 'photo..jpg', 2, 'def')).not.toContain('..')
  })

  it('default warranty note matches the agreed wording', () => {
    expect(DEFAULT_WARRANTY_NOTE).toContain('workmanship responsibility for this assigned scope')
    expect(DEFAULT_WARRANTY_NOTE).toContain('may require correction by the subcontractor')
  })
})
