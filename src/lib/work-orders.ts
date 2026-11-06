import type {
  UserRole,
  WorkOrderDocumentCategory,
  WorkOrderFileRecord,
  WorkOrderOfferStatus,
  WorkOrderRecord,
  WorkOrderStatus,
} from '@/types/database'

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' | 'accent'

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  offered: 'Offered',
  assigned: 'Assigned',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  work_completed: 'Work Completed',
  closed: 'Closed',
}

export function workOrderStatusVariant(status: WorkOrderStatus): BadgeVariant {
  if (status === 'offered' || status === 'assigned') return 'warning'
  if (status === 'accepted') return 'default'
  if (status === 'in_progress') return 'accent'
  if (status === 'work_completed') return 'success'
  return 'secondary'
}

export function formatWorkOrderNumber(number: number | string | null | undefined) {
  return number == null ? 'WO' : `WO-${number}`
}

export type SubcontractorWorkOrderAction = 'accept' | 'decline' | 'start' | 'add_update' | 'complete'

/** What the subcontractor can do now. Work Completed and Closed are read-only. */
export function subcontractorActions(status: WorkOrderStatus): SubcontractorWorkOrderAction[] {
  if (status === 'offered' || status === 'assigned') return ['accept', 'decline']
  if (status === 'accepted') return ['start']
  if (status === 'in_progress') return ['add_update', 'complete']
  return []
}

/** Management card text for a work order nobody has accepted yet. */
export function offerSummaryText(offers: Array<{ status: WorkOrderOfferStatus }>) {
  const pending = offers.filter((offer) => offer.status === 'pending').length
  const declined = offers.filter((offer) => offer.status === 'declined').length
  if (pending > 0) return `Offered — ${pending} waiting for an answer${declined ? ` · ${declined} declined` : ''}`
  if (declined > 0) return `${declined} declined — send to other subcontractors`
  return null
}

export function canCloseWorkOrder(role: UserRole | null | undefined, status: WorkOrderStatus) {
  return (role === 'admin' || role === 'project_manager') && status !== 'closed'
}

/** Shown and stored when a subcontractor accepts (must match respond_to_work_order). */
export const ACCEPTANCE_STATEMENT =
  'I have read and agree to the scope of work, agreed price, dates, important job requirements, warranty responsibility and the attached contract documents for this work order.'

export type WorkOrderGroup = 'offers' | 'assigned' | 'in_progress' | 'work_completed'

/** Subcontractor groups: New Offers, Assigned (accepted, not started), In Progress, Work Completed (incl. Closed). */
export function workOrderGroup(status: WorkOrderStatus): WorkOrderGroup {
  if (status === 'offered' || status === 'assigned') return 'offers'
  if (status === 'accepted') return 'assigned'
  if (status === 'in_progress') return 'in_progress'
  return 'work_completed'
}

export function isOpenWorkOrder(status: WorkOrderStatus) {
  return status !== 'work_completed' && status !== 'closed'
}

/** Open work first (In Progress, Accepted, waiting for an answer), then completed; each newest first. */
export function sortWorkOrders<T extends Pick<WorkOrderRecord, 'status' | 'created_at'>>(rows: T[]) {
  const rank: Record<WorkOrderStatus, number> = { in_progress: 0, accepted: 1, assigned: 2, offered: 2, work_completed: 3, closed: 4 }
  return [...rows].sort((a, b) => rank[a.status] - rank[b.status] || b.created_at.localeCompare(a.created_at))
}

export function formatMoney(value: number | string | null | undefined) {
  if (value == null || value === '') return '—'
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) return '—'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export const DEFAULT_WARRANTY_NOTE =
  'This project includes workmanship responsibility for this assigned scope. Workmanship-related issues determined by Tamay to result from this work may require correction by the subcontractor.'

export const DOCUMENT_CATEGORY_LABEL: Record<WorkOrderDocumentCategory, string> = {
  contract: 'Contract / Agreement',
  proposal: 'Proposal',
  plans: 'Plans / Drawings',
  photo: 'Photo',
  insurance: 'Insurance Certificate',
  permit: 'Permit',
  receipt: 'Receipt / Invoice',
  other: 'Other',
}

/** Types Tamay picks when attaching documents. */
export const TAMAY_DOCUMENT_TYPES: WorkOrderDocumentCategory[] = ['contract', 'proposal', 'plans', 'photo', 'other']

/** Types the subcontractor picks when adding documents. */
export const SUBCONTRACTOR_DOCUMENT_TYPES: WorkOrderDocumentCategory[] = ['insurance', 'permit', 'receipt', 'other']

/** Contract and proposal first: they are the formal documents of the work order. */
export function sortTamayDocuments<T extends Pick<WorkOrderFileRecord, 'category' | 'created_at'>>(rows: T[]) {
  const rank = (category: WorkOrderDocumentCategory | null) =>
    category === 'contract' ? 0 : category === 'proposal' ? 1 : category === 'plans' ? 2 : 3
  return [...rows].sort((a, b) => rank(a.category) - rank(b.category) || a.created_at.localeCompare(b.created_at))
}

export type InsuranceStatus = 'not_required' | 'missing' | 'submitted' | 'approved' | 'rejected'

/** Insurance certificate state for a work order: any approved certificate unlocks Start Work. */
export function insuranceStatus(
  workOrder: Pick<WorkOrderRecord, 'insurance_required'>,
  files: Array<Pick<WorkOrderFileRecord, 'kind' | 'category' | 'review_status' | 'created_at'>>,
): InsuranceStatus {
  const certificates = files
    .filter((file) => file.kind === 'subcontractor_document' && file.category === 'insurance')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (certificates.some((file) => file.review_status === 'approved')) return 'approved'
  if (!workOrder.insurance_required) return 'not_required'
  if (certificates.length === 0) return 'missing'
  return certificates[0]!.review_status === 'rejected' ? 'rejected' : 'submitted'
}

function safeName(fileName: string) {
  return fileName.replace(/[^\w.\-()+ ]+/g, '_').replace(/\.{2,}/g, '.') || 'upload'
}

const FOLDER: Record<WorkOrderFileRecord['kind'], string> = {
  reference: 'reference',
  update_photo: 'updates',
  subcontractor_document: 'subcontractor',
}

/** Private bucket "work-order-files": {work_order_id}/reference|updates|subcontractor/... */
export function workOrderFilePath(
  workOrderId: string,
  kind: WorkOrderFileRecord['kind'],
  fileName: string,
  now = Date.now(),
  unique = Math.random().toString(36).slice(2, 8),
) {
  return `${workOrderId}/${FOLDER[kind]}/${now}-${unique}-${safeName(fileName)}`
}

export const WORK_ORDER_FILES_BUCKET = 'work-order-files'
