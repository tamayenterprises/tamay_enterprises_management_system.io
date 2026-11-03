import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261103010000_subcontractor_mvp.sql?raw'
import {
  SUBCONTRACTOR_REQUIREMENTS,
  TRADE_LICENSE_TYPES,
  canSeeWorkOrders,
  formatDay,
  readinessFromItems,
  requirementAction,
  requirementStoragePath,
  sharedResourceStoragePath,
  sortWorkOrders,
  submissionStatus,
  workOrderAction,
  workOrderDisplayStatus,
} from './subcontractor-requirements'
import type { SubcontractorRequirementItem, SubcontractorRequirementStatus } from '@/types/database'

function item(
  key: SubcontractorRequirementItem['requirement_key'],
  status: SubcontractorRequirementStatus,
  overrides: Partial<SubcontractorRequirementItem> = {},
): SubcontractorRequirementItem {
  return {
    requirement_key: key,
    requirement_id: null,
    label: key,
    required: true,
    needs_expiration: false,
    expiration_optional: false,
    counts_toward_ready: key !== 'payment_ach',
    sort_order: 1,
    status,
    document_id: null,
    document_name: null,
    kind_label: null,
    submitted_at: null,
    expires_on: null,
    review_note: null,
    reviewed_at: null,
    ...overrides,
  }
}

describe('requirement catalog', () => {
  it('matches the SQL catalog exactly (keys, labels, defaults, expiration, Ready to Work)', () => {
    const rows = [
      ...migrationSql.matchAll(
        /\('(\w+)', '((?:[^']|'')+)', (true|false), (true|false), (true|false), (true|false), '(\w+)'::public\.document_category, (\d+)\)/g,
      ),
    ].map((m) => ({
      key: m[1],
      label: m[2].replace(/''/g, "'"),
      defaultRequired: m[3] === 'true',
      needsExpiration: m[4] === 'true',
      expirationOptional: m[5] === 'true',
      countsTowardReady: m[6] === 'true',
    }))
    expect(rows).toEqual(SUBCONTRACTOR_REQUIREMENTS.map((r) => ({ ...r })))
  })

  it('requires W-9, Business Information, Agreement, General Liability and Workers Comp by default', () => {
    expect(SUBCONTRACTOR_REQUIREMENTS.filter((r) => r.defaultRequired).map((r) => r.key)).toEqual([
      'w9',
      'business_info',
      'subcontractor_agreement',
      'general_liability',
      'workers_comp',
    ])
  })

  it('never lets Payment / ACH decide Ready to Work', () => {
    expect(SUBCONTRACTOR_REQUIREMENTS.find((r) => r.key === 'payment_ach')?.countsTowardReady).toBe(false)
  })

  it('license types match the database list', () => {
    const sql = migrationSql.match(/trade_license_types\(\)[\s\S]*?array\[([^\]]*)\]/)?.[1] ?? ''
    expect([...sql.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...TRADE_LICENSE_TYPES])
  })
})

describe('readinessFromItems', () => {
  const base = ['w9', 'business_info', 'subcontractor_agreement', 'general_liability', 'workers_comp'] as const

  it('Setup Required when something required is missing', () => {
    const items = base.map((k, i) => item(k, i === 0 ? 'missing' : 'approved'))
    expect(readinessFromItems(items)).toEqual({ status: 'setup_required', completed: 4, total: 5 })
  })

  it('Pending Review when everything is submitted but not all approved', () => {
    const items = base.map((k, i) => item(k, i === 0 ? 'submitted' : 'approved'))
    expect(readinessFromItems(items).status).toBe('pending_review')
  })

  it('Action Required beats missing when something was rejected or expired', () => {
    expect(readinessFromItems([item('w9', 'missing'), item('general_liability', 'expired')]).status).toBe('action_required')
    expect(readinessFromItems([item('w9', 'rejected')]).status).toBe('action_required')
  })

  it('Ready to Work when every required item is approved; optional and payment items do not count', () => {
    const items = [
      ...base.map((k) => item(k, 'approved')),
      item('commercial_auto', 'missing', { required: false }),
      item('payment_ach', 'missing', { required: false, counts_toward_ready: false }),
    ]
    expect(readinessFromItems(items)).toEqual({ status: 'ready', completed: 5, total: 5 })
  })

  it('custom required documents count', () => {
    const items = [...base.map((k) => item(k, 'approved')), item('other', 'missing', { requirement_id: 'r1', label: 'Equipment insurance' })]
    expect(readinessFromItems(items)).toEqual({ status: 'setup_required', completed: 5, total: 6 })
  })
})

describe('submissions', () => {
  it('derives a file status from review + expiration', () => {
    expect(submissionStatus({ review_status: 'submitted' })).toBe('submitted')
    expect(submissionStatus({ review_status: 'rejected' })).toBe('rejected')
    expect(submissionStatus({ review_status: 'approved', expires_on: '2026-01-01' }, '2026-06-01')).toBe('expired')
    expect(submissionStatus({ review_status: 'approved', expires_on: '2027-01-01' }, '2026-06-01')).toBe('approved')
    expect(submissionStatus({ review_status: 'approved', expires_on: null })).toBe('approved')
  })

  it('offers Upload for missing and Upload Replacement for rejected or expired', () => {
    expect(requirementAction('missing')).toBe('upload')
    expect(requirementAction('rejected')).toBe('replace')
    expect(requirementAction('expired')).toBe('replace')
    expect(requirementAction('approved')).toBeNull()
    expect(requirementAction('submitted')).toBeNull()
  })

  it('stores submissions in the subcontractor folder; payment files in the payment folder', () => {
    expect(requirementStoragePath('sub-1', 'w9', 'my w9?.pdf', 5)).toBe('sub-1/requirements/5-w9-my w9_.pdf')
    expect(requirementStoragePath('sub-1', 'payment_ach', 'ach.pdf', 5)).toBe('sub-1/payment/5-payment_ach-ach.pdf')
    expect(sharedResourceStoragePath('admin-1', 'Blank W-9.pdf', 5)).toBe('admin-1/shared-subcontractors/5-Blank W-9.pdf')
  })

  it('formats date-only values without shifting a day', () => {
    expect(formatDay('2027-03-01')).toBe('Mar 1, 2027')
    expect(formatDay(null)).toBe('—')
  })
})

describe('work orders', () => {
  it('shows Assigned until Ready to Work, then Ready to Start', () => {
    expect(workOrderDisplayStatus('assigned', false)).toBe('assigned')
    expect(workOrderDisplayStatus('assigned', true)).toBe('ready_to_start')
    expect(workOrderDisplayStatus('in_progress', false)).toBe('in_progress')
    expect(workOrderDisplayStatus('completed', true)).toBe('completed')
    expect(workOrderDisplayStatus(undefined, true)).toBe('ready_to_start')
  })

  it('Start Work only when ready to start; Complete Work only when in progress', () => {
    expect(workOrderAction('ready_to_start')).toBe('start')
    expect(workOrderAction('in_progress')).toBe('complete')
    expect(workOrderAction('assigned')).toBeNull()
    expect(workOrderAction('completed')).toBeNull()
  })

  it('lists in-progress first, then assigned (newest), then completed', () => {
    const rows = [
      { id: 'done', work_status: 'completed' as const, assigned_at: '2026-01-01', completed_at: '2026-02-01' },
      { id: 'old', work_status: 'assigned' as const, assigned_at: '2026-01-01', completed_at: null },
      { id: 'new', work_status: 'assigned' as const, assigned_at: '2026-03-01', completed_at: null },
      { id: 'busy', work_status: 'in_progress' as const, assigned_at: '2026-01-01', completed_at: null },
    ]
    expect(sortWorkOrders(rows).map((r) => r.id)).toEqual(['busy', 'new', 'old', 'done'])
  })

  it('work area is visible when Ready or Action Required, not during setup or review', () => {
    expect(canSeeWorkOrders('ready')).toBe(true)
    expect(canSeeWorkOrders('action_required')).toBe(true)
    expect(canSeeWorkOrders('setup_required')).toBe(false)
    expect(canSeeWorkOrders('pending_review')).toBe(false)
  })
})
