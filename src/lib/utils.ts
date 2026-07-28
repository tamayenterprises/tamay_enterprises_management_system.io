import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isPast, differenceInDays } from 'date-fns'
import type {
  ApprovalStatus,
  CertificationStatus,
  DocumentCategory,
  DocumentRecord,
  ProjectStatus,
  UserRole,
  WorkforceStatus,
} from '@/types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim()
}

export function formatDate(value?: string | null, pattern = 'MMM d, yyyy') {
  if (!value) return '—'
  return format(new Date(value), pattern)
}

export function formatRelative(value?: string | null) {
  if (!value) return '—'
  return formatDistanceToNow(new Date(value), { addSuffix: true })
}

/** Format decimal hours (e.g. 8.72) as "8h 43m". */
export function formatHoursDuration(totalHours?: number | string | null) {
  if (totalHours == null || totalHours === '') return '—'
  const hoursValue = typeof totalHours === 'string' ? Number(totalHours) : totalHours
  if (!Number.isFinite(hoursValue) || hoursValue < 0) return '—'
  const wholeHours = Math.floor(hoursValue)
  const minutes = Math.round((hoursValue - wholeHours) * 60)
  if (minutes === 60) return `${wholeHours + 1}h 0m`
  return `${wholeHours}h ${minutes}m`
}

export function roleLabel(role: UserRole) {
  const labels: Record<UserRole, string> = {
    admin: 'Admin',
    project_manager: 'Project Manager',
    employee: 'Employee',
    subcontractor: 'Subcontractor',
  }
  return labels[role]
}

export function approvalStatusLabel(status: ApprovalStatus) {
  const labels: Record<ApprovalStatus, string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
  }
  return labels[status]
}

export function projectStatusLabel(status: ProjectStatus) {
  const labels: Record<ProjectStatus, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    waiting: 'Waiting',
    completed: 'Completed',
  }
  return labels[status]
}

export function certificationStatusLabel(status: CertificationStatus) {
  const labels: Record<CertificationStatus, string> = {
    valid: 'Valid',
    expiring_soon: 'Expiring Soon',
    expired: 'Expired',
    missing: 'Missing',
  }
  return labels[status]
}

export function workforceStatusLabel(status: WorkforceStatus) {
  const labels: Record<WorkforceStatus, string> = {
    active: 'Active',
    on_site: 'On Site',
    traveling_to_site: 'Traveling to Site',
    on_break: 'On Break',
    completed_for_day: 'Completed for Day',
    off_site: 'Off Site',
    inactive: 'Inactive',
  }
  return labels[status]
}

export function workforceStatusEmoji(status: WorkforceStatus) {
  const icons: Record<WorkforceStatus, string> = {
    active: '🟢',
    on_site: '🟢',
    traveling_to_site: '🟡',
    on_break: '🟠',
    completed_for_day: '🔵',
    off_site: '⚪',
    inactive: '⚫',
  }
  return icons[status]
}

export const WORKFORCE_STATUSES: WorkforceStatus[] = [
  'active',
  'on_site',
  'traveling_to_site',
  'on_break',
  'completed_for_day',
  'off_site',
  'inactive',
]

export function documentCategoryLabel(category: DocumentCategory) {
  const labels: Record<DocumentCategory, string> = {
    certification: 'Certification',
    license: 'License',
    insurance: 'Insurance',
    contract: 'Contract',
    identification: 'Identification',
    work_photo: 'Work photo',
    project_file: 'Project file',
    company: 'Company',
    miscellaneous: 'Miscellaneous',
  }
  return labels[category]
}

export function formatFileSize(bytes?: number | null) {
  if (bytes == null || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Infer storage bucket from upload path conventions used in the app. */
export function documentStorageBucket(doc: Pick<DocumentRecord, 'storage_path' | 'project_id'>) {
  const parts = doc.storage_path.split('/')
  if (doc.project_id && parts.length >= 3) return 'project-files'
  return 'documents'
}

export function deriveCertificationStatus(expirationDate?: string | null): CertificationStatus {
  if (!expirationDate) return 'missing'
  const date = new Date(expirationDate)
  if (isPast(date) && differenceInDays(new Date(), date) > 0) return 'expired'
  if (differenceInDays(date, new Date()) <= 30) return 'expiring_soon'
  return 'valid'
}

export function isManagementRole(role?: UserRole | null) {
  return role === 'admin' || role === 'project_manager'
}

export function canAccessAdmin(role?: UserRole | null) {
  return role === 'admin'
}

export function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}
