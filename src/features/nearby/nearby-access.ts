import type { UserRole } from '@/types/database'

/** Staff field tool: employees, subcontractors and management. Clients never see it. */
export function canUseNearbyFinder(role?: UserRole | null) {
  return role === 'admin' || role === 'project_manager' || role === 'employee' || role === 'subcontractor'
}

/** Add / edit / mark preferred / archive saved places (the database enforces the same rule). */
export function canManageSavedPlaces(role?: UserRole | null) {
  return role === 'admin' || role === 'project_manager'
}
