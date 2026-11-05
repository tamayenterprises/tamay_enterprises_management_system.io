import type { UserRole, WorkOrderRecord, WorkOrderStatus } from '@/types/database'

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' | 'accent'

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  work_completed: 'Work Completed',
  closed: 'Closed',
}

export function workOrderStatusVariant(status: WorkOrderStatus): BadgeVariant {
  if (status === 'assigned') return 'warning'
  if (status === 'accepted') return 'default'
  if (status === 'in_progress') return 'accent'
  if (status === 'work_completed') return 'success'
  return 'secondary'
}

export function formatWorkOrderNumber(number: number | string | null | undefined) {
  return number == null ? 'WO' : `WO-${number}`
}

export type SubcontractorWorkOrderAction = 'accept' | 'start' | 'add_update' | 'complete'

/** What the assigned subcontractor can do now. Work Completed and Closed are read-only. */
export function subcontractorActions(status: WorkOrderStatus): SubcontractorWorkOrderAction[] {
  if (status === 'assigned') return ['accept']
  if (status === 'accepted') return ['start']
  if (status === 'in_progress') return ['add_update', 'complete']
  return []
}

export function canCloseWorkOrder(role: UserRole | null | undefined, status: WorkOrderStatus) {
  return (role === 'admin' || role === 'project_manager') && status !== 'closed'
}

export type WorkOrderGroup = 'assigned' | 'in_progress' | 'work_completed'

/** Subcontractor dashboard groups: Assigned (incl. Accepted), In Progress, Work Completed (incl. Closed). */
export function workOrderGroup(status: WorkOrderStatus): WorkOrderGroup {
  if (status === 'assigned' || status === 'accepted') return 'assigned'
  if (status === 'in_progress') return 'in_progress'
  return 'work_completed'
}

export function isOpenWorkOrder(status: WorkOrderStatus) {
  return status !== 'work_completed' && status !== 'closed'
}

/** Open work first (In Progress, Accepted, Assigned), then completed; each newest first. */
export function sortWorkOrders<T extends Pick<WorkOrderRecord, 'status' | 'created_at'>>(rows: T[]) {
  const rank: Record<WorkOrderStatus, number> = { in_progress: 0, accepted: 1, assigned: 2, work_completed: 3, closed: 4 }
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

function safeName(fileName: string) {
  return fileName.replace(/[^\w.\-()+ ]+/g, '_').replace(/\.{2,}/g, '.') || 'upload'
}

/** Private bucket "work-order-files": {work_order_id}/reference/... (management) and /updates/... (photos). */
export function workOrderFilePath(
  workOrderId: string,
  kind: 'reference' | 'update_photo',
  fileName: string,
  now = Date.now(),
  unique = Math.random().toString(36).slice(2, 8),
) {
  const folder = kind === 'reference' ? 'reference' : 'updates'
  return `${workOrderId}/${folder}/${now}-${unique}-${safeName(fileName)}`
}

export const WORK_ORDER_FILES_BUCKET = 'work-order-files'
