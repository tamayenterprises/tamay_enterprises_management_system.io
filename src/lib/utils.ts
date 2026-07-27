import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isPast, differenceInDays } from 'date-fns'
import type { CertificationStatus, ProjectStatus, UserRole } from '@/types/database'

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

export function roleLabel(role: UserRole) {
  const labels: Record<UserRole, string> = {
    admin: 'Admin',
    project_manager: 'Project Manager',
    employee: 'Employee',
    subcontractor: 'Subcontractor',
  }
  return labels[role]
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
