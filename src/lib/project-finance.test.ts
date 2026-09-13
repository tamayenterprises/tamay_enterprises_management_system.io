import { describe, expect, it } from 'vitest'
import {
  activeStripePayLink,
  canAddProjectReceipt,
  canEditProjectReceipt,
  canManageAllProjectReceipts,
  canViewAllProjectReceipts,
  canViewContractFinance,
  canViewProjectReceipts,
  derivePaymentStatus,
  exceedsBalanceWarning,
  formatCurrency,
  nextPaymentDue,
  overallPaymentStatus,
  remainingBalance,
  requiresOriginalTotalConfirmation,
  stripContractFinanceFromProject,
  sumActiveReceipts,
  sumValidPayments,
  toMoneyNumber,
} from '@/lib/project-finance'

describe('project-finance calculations', () => {
  it('formats currency and parses money', () => {
    expect(toMoneyNumber('2500.5')).toBe(2500.5)
    expect(formatCurrency(12500)).toBe('$12,500.00')
  })

  it('matches Maria bathroom scenario totals', () => {
    const payments = [
      { expected_amount: 10000, actual_amount: 10000, status: 'paid', sort_order: 1, label: 'Initial' },
      { expected_amount: 5000, actual_amount: 2500, status: 'partial', sort_order: 2, label: 'Progress' },
      { expected_amount: 5000, actual_amount: 0, status: 'due', sort_order: 3, label: 'Final' },
    ]
    const totalPaid = sumValidPayments(payments)
    expect(totalPaid).toBe(12500)
    expect(remainingBalance(20000, totalPaid)).toBe(7500)
    expect(overallPaymentStatus(20000, totalPaid)).toBe('partial')
    expect(nextPaymentDue(payments)).toEqual({ label: 'Progress', amountDue: 2500 })
  })

  it('ignores voided payments and receipts', () => {
    expect(
      sumValidPayments([
        { expected_amount: 1000, actual_amount: 1000, status: 'paid' },
        { expected_amount: 500, actual_amount: 500, status: 'void' },
      ]),
    ).toBe(1000)
    expect(
      sumActiveReceipts([
        { amount: 827.42, status: 'active' },
        { amount: 1240.15, status: 'active' },
        { amount: 392.89, status: 'active' },
        { amount: 99, status: 'void' },
      ]),
    ).toBe(2460.46)
  })

  it('matches John receipt upload + void scenario', () => {
    const receipts = [
      { amount: 842.18, status: 'active' },
      { amount: 1120.5, status: 'active' },
      { amount: 374.92, status: 'active' },
    ]
    expect(sumActiveReceipts(receipts)).toBe(2337.6)
    expect(
      sumActiveReceipts([
        { amount: 842.18, status: 'active' },
        { amount: 1120.5, status: 'void' },
        { amount: 374.92, status: 'active' },
      ]),
    ).toBe(1217.1)
  })

  it('derives payment status from amounts', () => {
    expect(derivePaymentStatus(10000, 0)).toBe('due')
    expect(derivePaymentStatus(10000, 7500)).toBe('partial')
    expect(derivePaymentStatus(10000, 10000)).toBe('paid')
    expect(derivePaymentStatus(10000, 10000, 'void')).toBe('void')
  })

  it('warns when payment exceeds remaining balance', () => {
    expect(exceedsBalanceWarning(8000, 7500)).toEqual({ exceeds: true, overBy: 500 })
    expect(exceedsBalanceWarning(7500, 7500).exceeds).toBe(false)
  })

  it('requires confirmation only when correcting an established original total', () => {
    expect(requiresOriginalTotalConfirmation(null, 20000)).toBe(false)
    expect(requiresOriginalTotalConfirmation(20000, 20000)).toBe(false)
    expect(requiresOriginalTotalConfirmation(20000, 22000)).toBe(true)
  })

  it('returns active stripe pay link only when flagged and unpaid', () => {
    expect(
      activeStripePayLink([
        {
          expected_amount: 100,
          actual_amount: 0,
          status: 'due',
          stripe_payment_link_url: 'https://buy.stripe.com/test',
          stripe_payment_link_active: true,
        },
      ]),
    ).toBe('https://buy.stripe.com/test')
    expect(
      activeStripePayLink([
        {
          expected_amount: 100,
          actual_amount: 0,
          status: 'due',
          stripe_payment_link_url: 'https://buy.stripe.com/test',
          stripe_payment_link_active: false,
        },
      ]),
    ).toBeNull()
    expect(
      activeStripePayLink([
        {
          expected_amount: 100,
          actual_amount: 100,
          status: 'paid',
          stripe_payment_link_url: 'https://buy.stripe.com/test',
          stripe_payment_link_active: true,
        },
      ]),
    ).toBeNull()
  })
})

describe('project-finance role rules', () => {
  it('allows contract finance only for admin and project managers', () => {
    expect(canViewContractFinance('admin')).toBe(true)
    expect(canViewContractFinance('project_manager')).toBe(true)
    expect(canViewContractFinance('employee')).toBe(false)
    expect(canViewContractFinance('subcontractor')).toBe(false)
    expect(canViewContractFinance('client')).toBe(false)
  })

  it('allows assigned employees receipt access but not subcontractors/clients', () => {
    expect(canViewProjectReceipts('admin', false)).toBe(true)
    expect(canViewProjectReceipts('project_manager', false)).toBe(true)
    expect(canViewProjectReceipts('employee', true)).toBe(true)
    expect(canViewProjectReceipts('employee', false)).toBe(false)
    expect(canAddProjectReceipt('employee', true)).toBe(true)
    expect(canAddProjectReceipt('employee', false)).toBe(false)
    expect(canViewProjectReceipts('subcontractor', true)).toBe(false)
    expect(canViewProjectReceipts('client', true)).toBe(false)
    expect(canManageAllProjectReceipts('employee')).toBe(false)
    expect(canManageAllProjectReceipts('admin')).toBe(true)
    expect(canViewAllProjectReceipts('employee')).toBe(false)
    expect(canViewAllProjectReceipts('project_manager')).toBe(true)
  })

  it('lets employees edit only their own active receipts', () => {
    expect(
      canEditProjectReceipt('employee', {
        receiptCreatedBy: 'john',
        receiptStatus: 'active',
        currentUserId: 'john',
      }),
    ).toBe(true)
    expect(
      canEditProjectReceipt('employee', {
        receiptCreatedBy: 'maria',
        receiptStatus: 'active',
        currentUserId: 'john',
      }),
    ).toBe(false)
    expect(
      canEditProjectReceipt('project_manager', {
        receiptCreatedBy: 'john',
        receiptStatus: 'active',
        currentUserId: 'pm',
      }),
    ).toBe(true)
  })

  it('strips contract totals for workforce responses', () => {
    const stripped = stripContractFinanceFromProject({
      id: 'p1',
      original_project_total: 20000,
      current_project_total: 22000,
      project_total_updated_at: '2026-01-01',
      project_total_updated_by: 'admin',
      name: 'Bathroom',
    })
    expect(stripped.original_project_total).toBeNull()
    expect(stripped.current_project_total).toBeNull()
    expect(stripped.name).toBe('Bathroom')
  })
})
