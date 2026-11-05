import { formatDate } from '@/lib/utils'
import type {
  SubcontractorReadinessStatus,
  SubcontractorRequirementItem,
  SubcontractorRequirementKey,
  SubcontractorRequirementStatus,
} from '@/types/database'

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' | 'accent'

export interface RequirementDefinition {
  key: SubcontractorRequirementKey
  label: string
  defaultRequired: boolean
  needsExpiration: boolean
  expirationOptional: boolean
  /** Payment / ACH never blocks Ready to Work. */
  countsTowardReady: boolean
}

/** Must match public.subcontractor_requirement_catalog() in 20261103010000_subcontractor_mvp.sql. */
export const SUBCONTRACTOR_REQUIREMENTS: readonly RequirementDefinition[] = [
  { key: 'w9', label: 'W-9', defaultRequired: true, needsExpiration: false, expirationOptional: false, countsTowardReady: true },
  { key: 'business_info', label: 'Business Information', defaultRequired: true, needsExpiration: false, expirationOptional: false, countsTowardReady: true },
  { key: 'subcontractor_agreement', label: 'Subcontractor Agreement', defaultRequired: true, needsExpiration: false, expirationOptional: false, countsTowardReady: true },
  { key: 'general_liability', label: 'General Liability Insurance', defaultRequired: true, needsExpiration: true, expirationOptional: false, countsTowardReady: true },
  { key: 'workers_comp', label: "Workers' Compensation", defaultRequired: true, needsExpiration: true, expirationOptional: false, countsTowardReady: true },
  { key: 'trade_license', label: 'Trade License', defaultRequired: false, needsExpiration: true, expirationOptional: false, countsTowardReady: true },
  { key: 'osha_safety', label: 'OSHA / Safety Certification', defaultRequired: false, needsExpiration: false, expirationOptional: true, countsTowardReady: true },
  { key: 'commercial_auto', label: 'Commercial Auto Insurance', defaultRequired: false, needsExpiration: true, expirationOptional: false, countsTowardReady: true },
  { key: 'payment_ach', label: 'Payment / ACH Information', defaultRequired: false, needsExpiration: false, expirationOptional: false, countsTowardReady: false },
  { key: 'other', label: 'Other Required Document', defaultRequired: false, needsExpiration: false, expirationOptional: true, countsTowardReady: true },
]

/** Must match public.trade_license_types(). */
export const TRADE_LICENSE_TYPES = [
  'Electrical',
  'Plumbing',
  'HVAC',
  'Home Improvement Contractor (HIC)',
  'General Contractor',
  'Other',
] as const

export const PAYMENT_REQUIREMENT_KEY: SubcontractorRequirementKey = 'payment_ach'

/** Date-only values (expiration, project dates) must not shift a day in US time zones. */
export function formatDay(value?: string | null) {
  if (!value) return '—'
  return formatDate(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
}

export function requirementDefinition(key: SubcontractorRequirementKey) {
  return SUBCONTRACTOR_REQUIREMENTS.find((item) => item.key === key)
}

export const REQUIREMENT_STATUS_LABEL: Record<SubcontractorRequirementStatus, string> = {
  missing: 'Missing',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
}

export function requirementStatusVariant(status: SubcontractorRequirementStatus): BadgeVariant {
  if (status === 'approved') return 'success'
  if (status === 'submitted') return 'warning'
  if (status === 'missing') return 'outline'
  return 'destructive'
}

export const READINESS_LABEL: Record<SubcontractorReadinessStatus, string> = {
  setup_required: 'Setup Required',
  pending_review: 'Pending Review',
  ready: 'Ready to Work',
  action_required: 'Action Required',
}

export function readinessVariant(status: SubcontractorReadinessStatus): BadgeVariant {
  if (status === 'ready') return 'success'
  if (status === 'pending_review') return 'warning'
  return 'destructive'
}

/**
 * Subcontractors see the dashboard and Work Orders once setup is done. Action Required (an expired or
 * rejected document) keeps them visible with a warning; Start Work stays blocked until Ready.
 */
export function canSeeWorkOrders(status: SubcontractorReadinessStatus) {
  return status === 'ready' || status === 'action_required'
}

/** Requirements that decide Ready to Work, in display order (Payment / ACH excluded). */
export function readinessItems(items: SubcontractorRequirementItem[]) {
  return items.filter((item) => item.required && item.counts_toward_ready)
}

/** Mirrors public.subcontractor_readiness() for one subcontractor's requirement items. */
export function readinessFromItems(items: SubcontractorRequirementItem[]): {
  status: SubcontractorReadinessStatus
  completed: number
  total: number
} {
  const counted = readinessItems(items)
  const completed = counted.filter((item) => item.status === 'approved').length
  const has = (statuses: SubcontractorRequirementStatus[]) => counted.some((item) => statuses.includes(item.status))
  const status: SubcontractorReadinessStatus = has(['rejected', 'expired'])
    ? 'action_required'
    : has(['missing'])
      ? 'setup_required'
      : has(['submitted'])
        ? 'pending_review'
        : 'ready'
  return { status, completed, total: counted.length }
}

/** Status of one submitted file (mirrors the per-requirement rule in the database). */
export function submissionStatus(
  doc: { review_status?: string | null; expires_on?: string | null },
  today = new Date().toISOString().slice(0, 10),
): SubcontractorRequirementStatus {
  if (doc.review_status === 'rejected') return 'rejected'
  if (doc.review_status === 'approved') {
    return doc.expires_on && doc.expires_on < today ? 'expired' : 'approved'
  }
  return 'submitted'
}

/** What the subcontractor can do with a requirement right now. */
export function requirementAction(status: SubcontractorRequirementStatus): 'upload' | 'replace' | null {
  if (status === 'missing') return 'upload'
  if (status === 'rejected' || status === 'expired') return 'replace'
  return null
}

export function requirementStoragePath(
  ownerId: string,
  key: SubcontractorRequirementKey,
  fileName: string,
  now = Date.now(),
) {
  const safeName = fileName.replace(/[^\w.\-()+ ]+/g, '_') || 'upload'
  const folder = key === PAYMENT_REQUIREMENT_KEY ? 'payment' : 'requirements'
  return `${ownerId}/${folder}/${now}-${key}-${safeName}`
}

export function sharedResourceStoragePath(uploaderId: string, fileName: string, now = Date.now()) {
  const safeName = fileName.replace(/[^\w.\-()+ ]+/g, '_') || 'upload'
  return `${uploaderId}/shared-subcontractors/${now}-${safeName}`
}
