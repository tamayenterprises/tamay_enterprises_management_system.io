import { canUseNearbyFinder } from '@/features/nearby/nearby-access'
import { canAccessAdmin, isClientRole } from '@/lib/utils'
import type { Profile, UserRole } from '@/types/database'

export const APP_PAGE_KEYS = [
  'dashboard',
  'projects',
  'schedule',
  'nearby',
  'client-requests',
  'updates',
  'employees',
  'subcontractors',
  'clients',
  'timesheets',
  'work-schedule',
  'activity',
  'certifications',
  'documents',
  'drafts',
  'payments',
  'notifications',
  'admin',
] as const

export type AppPageKey = (typeof APP_PAGE_KEYS)[number]

export const APP_PAGE_LABELS: Record<AppPageKey, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  schedule: 'My Schedule',
  nearby: 'Nearby Finder',
  'client-requests': 'Client requests',
  updates: 'Updates',
  employees: 'Employees',
  subcontractors: 'Subcontractors',
  clients: 'Clients',
  timesheets: 'Timesheets',
  'work-schedule': 'Work Schedule',
  activity: 'Activity',
  certifications: 'Certifications',
  documents: 'Work Documents',
  drafts: 'Drafts',
  payments: 'Payment History',
  notifications: 'Notifications',
  admin: 'Admin',
}

/** Pages every project manager always keeps so they can sign in and see alerts. */
export const PM_ALWAYS_PAGES: readonly AppPageKey[] = ['dashboard', 'notifications']

/**
 * Pages a project manager has until admin customizes the list.
 * Matches today's PM nav (management pages, not Admin or Clients).
 */
export const DEFAULT_PM_PAGES: readonly AppPageKey[] = [
  'dashboard',
  'projects',
  'schedule',
  'nearby',
  'client-requests',
  'updates',
  'employees',
  'subcontractors',
  'timesheets',
  'work-schedule',
  'activity',
  'certifications',
  'documents',
  'drafts',
  'payments',
  'notifications',
]

/** Pages admin can grant or revoke for a project manager (Admin stays admin-only). */
export const GRANTABLE_PM_PAGES: readonly AppPageKey[] = [
  'projects',
  'schedule',
  'nearby',
  'client-requests',
  'updates',
  'employees',
  'subcontractors',
  'clients',
  'timesheets',
  'work-schedule',
  'activity',
  'certifications',
  'documents',
  'drafts',
  'payments',
]

const STAFF_PAGES: readonly AppPageKey[] = [
  'dashboard',
  'projects',
  'updates',
  'activity',
  'certifications',
  'documents',
  'drafts',
  'notifications',
]

const MANAGEMENT_PAGES: readonly AppPageKey[] = [
  'client-requests',
  'employees',
  'subcontractors',
  'timesheets',
  'work-schedule',
  'payments',
]

export function isAppPageKey(value: string): value is AppPageKey {
  return (APP_PAGE_KEYS as readonly string[]).includes(value)
}

export function pageKeyFromPath(pathname: string): AppPageKey | null {
  const path = pathname.split('?')[0] ?? pathname
  if (path === '/' || path === '/dashboard') return 'dashboard'
  if (path.startsWith('/projects')) return 'projects'
  const match = APP_PAGE_KEYS.find((key) => path === `/${key}` || path.startsWith(`/${key}/`))
  return match ?? null
}

export function sanitizeGrantedPages(pages: readonly string[] | null | undefined): AppPageKey[] {
  const unique = new Set<AppPageKey>()
  for (const page of pages ?? []) {
    if (isAppPageKey(page) && page !== 'admin') unique.add(page)
  }
  return [...unique]
}

export function resolvedPmPages(grantedPages: readonly string[] | null | undefined): AppPageKey[] {
  const source = grantedPages == null ? DEFAULT_PM_PAGES : sanitizeGrantedPages(grantedPages)
  const allowed = new Set<AppPageKey>([...PM_ALWAYS_PAGES, ...source])
  return APP_PAGE_KEYS.filter((key) => allowed.has(key) && key !== 'admin')
}

export function canAccessAppPage(
  profile: Pick<Profile, 'role' | 'granted_pages'> | { role?: UserRole | null; granted_pages?: string[] | null } | null | undefined,
  page: AppPageKey,
) {
  const role = profile?.role
  if (!role || isClientRole(role)) return false
  if (canAccessAdmin(role)) return true
  if (role === 'project_manager') {
    if (page === 'admin') return false
    return resolvedPmPages(profile?.granted_pages).includes(page)
  }
  if (page === 'schedule') return role === 'employee' || role === 'project_manager'
  if (page === 'nearby') return canUseNearbyFinder(role)
  if (MANAGEMENT_PAGES.includes(page) || page === 'clients' || page === 'admin') return false
  return STAFF_PAGES.includes(page)
}
