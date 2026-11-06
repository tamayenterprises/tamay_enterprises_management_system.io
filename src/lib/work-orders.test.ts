import { describe, expect, it } from 'vitest'
import offersSql from '../../supabase/migrations/20261106010000_work_order_offers_documents.sql?raw'
import {
  ACCEPTANCE_STATEMENT,
  DEFAULT_WARRANTY_NOTE,
  canCloseWorkOrder,
  formatMoney,
  formatWorkOrderNumber,
  insuranceStatus,
  isOpenWorkOrder,
  offerSummaryText,
  sortTamayDocuments,
  sortWorkOrders,
  subcontractorActions,
  workOrderFilePath,
  workOrderGroup,
} from './work-orders'

describe('work order helpers', () => {
  it('subcontractor actions follow the status flow; Work Completed and Closed are read-only', () => {
    expect(subcontractorActions('offered')).toEqual(['accept', 'decline'])
    expect(subcontractorActions('assigned')).toEqual(['accept', 'decline'])
    expect(subcontractorActions('accepted')).toEqual(['start'])
    expect(subcontractorActions('in_progress')).toEqual(['add_update', 'complete'])
    expect(subcontractorActions('work_completed')).toEqual([])
    expect(subcontractorActions('closed')).toEqual([])
  })

  it('only Admin and PM can close, and not twice', () => {
    expect(canCloseWorkOrder('admin', 'work_completed')).toBe(true)
    expect(canCloseWorkOrder('project_manager', 'offered')).toBe(true)
    expect(canCloseWorkOrder('subcontractor', 'work_completed')).toBe(false)
    expect(canCloseWorkOrder('admin', 'closed')).toBe(false)
  })

  it('subcontractor groups: New Offers, Assigned, In Progress, Work Completed (incl. Closed)', () => {
    expect(workOrderGroup('offered')).toBe('offers')
    expect(workOrderGroup('assigned')).toBe('offers')
    expect(workOrderGroup('accepted')).toBe('assigned')
    expect(workOrderGroup('in_progress')).toBe('in_progress')
    expect(workOrderGroup('work_completed')).toBe('work_completed')
    expect(workOrderGroup('closed')).toBe('work_completed')
    expect(isOpenWorkOrder('offered')).toBe(true)
    expect(isOpenWorkOrder('work_completed')).toBe(false)
  })

  it('lists in-progress first, then accepted, then waiting for an answer, then completed', () => {
    const rows = [
      { id: 'done', status: 'work_completed' as const, created_at: '2026-03-01' },
      { id: 'offer', status: 'offered' as const, created_at: '2026-02-01' },
      { id: 'old', status: 'assigned' as const, created_at: '2026-01-01' },
      { id: 'ok', status: 'accepted' as const, created_at: '2026-01-01' },
      { id: 'busy', status: 'in_progress' as const, created_at: '2026-01-01' },
    ]
    expect(sortWorkOrders(rows).map((row) => row.id)).toEqual(['busy', 'ok', 'offer', 'old', 'done'])
  })

  it('formats numbers and money', () => {
    expect(formatWorkOrderNumber(1001)).toBe('WO-1001')
    expect(formatMoney(4500)).toBe('$4,500.00')
    expect(formatMoney(null)).toBe('—')
  })

  it('stores Tamay documents, update photos and subcontractor documents in their own folders', () => {
    expect(workOrderFilePath('wo-1', 'reference', 'Plan A.pdf', 1, 'abc')).toBe('wo-1/reference/1-abc-Plan A.pdf')
    expect(workOrderFilePath('wo-1', 'update_photo', '../x?.jpg', 2, 'def')).toBe('wo-1/updates/2-def-._x_.jpg')
    expect(workOrderFilePath('wo-1', 'subcontractor_document', 'COI.pdf', 3, 'ghi')).toBe('wo-1/subcontractor/3-ghi-COI.pdf')
    expect(workOrderFilePath('wo-1', 'update_photo', 'photo..jpg', 2, 'def')).not.toContain('..')
  })

  it('contract and proposal are listed first', () => {
    const rows = [
      { id: 'p', category: 'photo' as const, created_at: '1' },
      { id: 'c', category: 'contract' as const, created_at: '3' },
      { id: 'x', category: null, created_at: '0' },
      { id: 'pr', category: 'proposal' as const, created_at: '2' },
    ]
    expect(sortTamayDocuments(rows).map((row) => row.id)).toEqual(['c', 'pr', 'x', 'p'])
  })

  it('insurance status: any approved certificate unlocks; otherwise the latest decides', () => {
    const cert = (review_status: 'submitted' | 'approved' | 'rejected', created_at: string) =>
      ({ kind: 'subcontractor_document' as const, category: 'insurance' as const, review_status, created_at })
    expect(insuranceStatus({ insurance_required: false }, [])).toBe('not_required')
    expect(insuranceStatus({ insurance_required: true }, [])).toBe('missing')
    expect(insuranceStatus({ insurance_required: true }, [cert('rejected', '2')])).toBe('rejected')
    expect(insuranceStatus({ insurance_required: true }, [cert('rejected', '1'), cert('submitted', '2')])).toBe('submitted')
    expect(insuranceStatus({ insurance_required: true }, [cert('approved', '1'), cert('rejected', '2')])).toBe('approved')
  })

  it('offer summary for management cards', () => {
    expect(offerSummaryText([])).toBeNull()
    expect(offerSummaryText([{ status: 'pending' }, { status: 'pending' }, { status: 'declined' }])).toBe('Offered — 2 waiting for an answer · 1 declined')
    expect(offerSummaryText([{ status: 'declined' }])).toBe('1 declined — send to other subcontractors')
  })

  it('the agreement text shown to the subcontractor is the one the database stores', () => {
    expect(offersSql).toContain(ACCEPTANCE_STATEMENT)
  })

  it('default warranty note matches the agreed wording', () => {
    expect(DEFAULT_WARRANTY_NOTE).toContain('workmanship responsibility for this assigned scope')
  })
})
