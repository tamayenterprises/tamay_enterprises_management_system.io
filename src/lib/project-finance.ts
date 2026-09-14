/** Pure helpers for Project Financial Tracking (no React / Supabase). */

export type PaymentStatus = 'due' | 'partial' | 'paid' | 'void'
export type PaymentMethod = 'check' | 'stripe' | 'other'
export type PaymentStageKey = 'initial' | 'progress' | 'second_progress' | 'final' | 'other'

export type PaymentLike = {
  expected_amount: number | string
  actual_amount: number | string
  status: PaymentStatus | string
  sort_order?: number | null
  created_at?: string
  label?: string
  stripe_payment_link_url?: string | null
  stripe_payment_link_active?: boolean | null
}

export type ReceiptLike = {
  amount: number | string
  status: 'active' | 'void' | string
}

export function toMoneyNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

export function formatCurrency(value: number | string | null | undefined): string {
  const amount = toMoneyNumber(value)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function derivePaymentStatus(
  expectedAmount: number | string,
  actualAmount: number | string,
  currentStatus?: string | null,
): PaymentStatus {
  if (currentStatus === 'void') return 'void'
  const expected = toMoneyNumber(expectedAmount)
  const actual = toMoneyNumber(actualAmount)
  if (actual <= 0) return 'due'
  if (expected > 0 && actual + 0.0001 >= expected) return 'paid'
  if (actual > 0) return 'partial'
  return 'due'
}

export function sumValidPayments(payments: PaymentLike[]): number {
  return payments.reduce((sum, payment) => {
    if (payment.status === 'void') return sum
    return sum + toMoneyNumber(payment.actual_amount)
  }, 0)
}

export function sumActiveReceipts(receipts: ReceiptLike[]): number {
  return receipts.reduce((sum, receipt) => {
    if (receipt.status === 'void') return sum
    return sum + toMoneyNumber(receipt.amount)
  }, 0)
}

export function remainingBalance(
  currentProjectTotal: number | string | null | undefined,
  totalPaid: number,
): number {
  return Math.max(0, Math.round((toMoneyNumber(currentProjectTotal) - totalPaid) * 100) / 100)
}

export type OverallPaymentStatus = 'unset' | 'unpaid' | 'partial' | 'paid' | 'overpaid'

export function overallPaymentStatus(
  currentProjectTotal: number | string | null | undefined,
  totalPaid: number,
): OverallPaymentStatus {
  if (currentProjectTotal === null || currentProjectTotal === undefined || currentProjectTotal === '') {
    return 'unset'
  }
  const total = toMoneyNumber(currentProjectTotal)
  if (total <= 0 && totalPaid <= 0) return 'unset'
  if (totalPaid <= 0) return 'unpaid'
  if (totalPaid + 0.0001 >= total) {
    if (totalPaid > total + 0.009) return 'overpaid'
    return 'paid'
  }
  return 'partial'
}

export function overallPaymentStatusLabel(status: OverallPaymentStatus): string {
  switch (status) {
    case 'paid':
      return 'Paid'
    case 'partial':
      return 'Partial'
    case 'overpaid':
      return 'Overpaid'
    case 'unpaid':
      return 'Unpaid'
    default:
      return 'Not set'
  }
}

export function paymentStatusLabel(status: string): string {
  switch (status) {
    case 'due':
      return 'Due'
    case 'partial':
      return 'Partial'
    case 'paid':
      return 'Paid'
    case 'void':
      return 'Void'
    default:
      return status
  }
}

export function paymentMethodLabel(method?: string | null): string {
  switch (method) {
    case 'check':
      return 'Check'
    case 'stripe':
      return 'Stripe'
    case 'other':
      return 'Other'
    default:
      return '—'
  }
}

export function paymentStageLabel(stage: string): string {
  switch (stage) {
    case 'initial':
      return 'Initial Payment'
    case 'progress':
      return 'Progress Payment'
    case 'second_progress':
      return 'Second Progress Payment'
    case 'final':
      return 'Final Payment'
    default:
      return 'Other Payment'
  }
}

/** Next open payment stage: first non-void due/partial by sort_order then created_at. */
export function nextPaymentDue(payments: PaymentLike[]): {
  label: string
  amountDue: number
} | null {
  const open = [...payments]
    .filter((p) => p.status === 'due' || p.status === 'partial')
    .sort((a, b) => {
      const order = (a.sort_order ?? 0) - (b.sort_order ?? 0)
      if (order !== 0) return order
      return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    })
  const next = open[0]
  if (!next) return null
  const amountDue = Math.max(
    0,
    toMoneyNumber(next.expected_amount) - toMoneyNumber(next.actual_amount),
  )
  return {
    label: next.label || 'Next payment',
    amountDue,
  }
}

export function activeStripePayLink(payments: PaymentLike[]): string | null {
  const eligible = payments.find((payment) => isClientPayNowEligible(payment))
  const url = eligible?.stripe_payment_link_url
  return typeof url === 'string' ? url : null
}

/**
 * Client Pay Now is shown only when the payment is unpaid/partial, has a stored
 * Stripe URL, and Admin has enabled Client Pay Now (`stripe_payment_link_active`).
 */
export function isClientPayNowEligible(payment: PaymentLike): boolean {
  if (payment.status === 'void' || payment.status === 'paid') return false
  if (payment.status !== 'due' && payment.status !== 'partial') return false
  if (!payment.stripe_payment_link_active) return false
  return (
    typeof payment.stripe_payment_link_url === 'string' &&
    payment.stripe_payment_link_url.startsWith('http')
  )
}

export function clientPayNowLabel(payment: PaymentLike): 'Enabled' | 'Disabled' | 'Unavailable' {
  if (payment.status === 'void' || payment.status === 'paid') return 'Unavailable'
  if (
    typeof payment.stripe_payment_link_url !== 'string' ||
    !payment.stripe_payment_link_url.startsWith('http')
  ) {
    return 'Unavailable'
  }
  return payment.stripe_payment_link_active ? 'Enabled' : 'Disabled'
}

export function exceedsBalanceWarning(
  paymentAmount: number,
  remaining: number,
): { exceeds: boolean; overBy: number } {
  const amount = toMoneyNumber(paymentAmount)
  const rem = toMoneyNumber(remaining)
  if (amount <= rem + 0.009) return { exceeds: false, overBy: 0 }
  return {
    exceeds: true,
    overBy: Math.round((amount - rem) * 100) / 100,
  }
}

/** True when management is correcting an already-established original total. */
export function requiresOriginalTotalConfirmation(
  existingOriginal: number | string | null | undefined,
  nextOriginal: number | string | null | undefined,
): boolean {
  if (existingOriginal === null || existingOriginal === undefined || existingOriginal === '') {
    return false
  }
  if (nextOriginal === null || nextOriginal === undefined || nextOriginal === '') return false
  return toMoneyNumber(existingOriginal) !== toMoneyNumber(nextOriginal)
}

/**
 * Contract/payment financials (totals, payments, Pay Now, snapshot).
 * Admin + project_manager only — never employees, subcontractors, or unassigned staff.
 */
export function canViewContractFinance(role?: string | null): boolean {
  return role === 'admin' || role === 'project_manager'
}

export function canManageContractFinance(role?: string | null): boolean {
  return canViewContractFinance(role)
}

/**
 * Project receipts — operational uploads (internal Tamay spending).
 * Admin + project managers always; assigned employees only; never subcontractors/clients.
 * Employees who successfully open a project page are assigned (projects RLS).
 */
export function canViewProjectReceipts(
  role?: string | null,
  isAssignedToProject?: boolean,
): boolean {
  if (role === 'admin' || role === 'project_manager') return true
  if (role === 'employee' && isAssignedToProject) return true
  return false
}

export function canAddProjectReceipt(
  role?: string | null,
  isAssignedToProject?: boolean,
): boolean {
  return canViewProjectReceipts(role, isAssignedToProject)
}

/** Employees only see their own receipts; management/PM see the full project set. */
export function canViewAllProjectReceipts(role?: string | null): boolean {
  return role === 'admin' || role === 'project_manager'
}

/** Void / unrestricted edit — management and project managers only. */
export function canManageAllProjectReceipts(role?: string | null): boolean {
  return role === 'admin' || role === 'project_manager'
}

/** Employees may edit their own active receipts; management may edit any. */
export function canEditProjectReceipt(
  role?: string | null,
  options?: { receiptCreatedBy?: string | null; receiptStatus?: string | null; currentUserId?: string | null },
): boolean {
  if (canManageAllProjectReceipts(role)) return true
  if (role !== 'employee') return false
  if (options?.receiptStatus === 'void') return false
  return Boolean(
    options?.currentUserId &&
      options.receiptCreatedBy &&
      options.currentUserId === options.receiptCreatedBy,
  )
}

/** Strip contract totals before showing a project to workforce roles. */
export function stripContractFinanceFromProject<T extends {
  original_project_total?: number | string | null
  current_project_total?: number | string | null
  project_total_updated_at?: string | null
  project_total_updated_by?: string | null
}>(project: T): T {
  return {
    ...project,
    original_project_total: null,
    current_project_total: null,
    project_total_updated_at: null,
    project_total_updated_by: null,
  }
}
