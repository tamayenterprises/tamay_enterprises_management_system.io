/**
 * Profile columns granted to every signed-in user. Contact, HR and compliance fields
 * (email, phone, hire date, emergency contact, notes, insurance, license) are not
 * readable from the table; load them through the `list_profiles` RPC, which masks
 * them per viewer.
 */
export const PROFILE_DIRECTORY_COLUMNS =
  'id, organization_id, first_name, last_name, role, approval_status, is_active, avatar_url, position, company_name, trade_specialization, archived_at, created_at, updated_at' as const

import type { UserRole } from '@/types/database'

export const PROFILE_PRIVATE_FIELDS = [
  'email',
  'phone',
  'hire_date',
  'emergency_contact_name',
  'emergency_contact_phone',
  'internal_notes',
  'insurance_info',
  'license_info',
] as const

export type ProfilePrivateField = (typeof PROFILE_PRIVATE_FIELDS)[number]

/** Must match project_manager_can_read_profile_field() in the Phase 0 migration. */
export const PROJECT_MANAGER_PROFILE_FIELDS: readonly ProfilePrivateField[] = ['email', 'phone', 'insurance_info', 'license_info']

/** Whether someone with `viewerRole` can read (and therefore edit) a private field on another person's profile. */
export function canManageProfileField(viewerRole: UserRole | null | undefined, field: ProfilePrivateField) {
  if (viewerRole === 'admin') return true
  if (viewerRole === 'project_manager') return PROJECT_MANAGER_PROFILE_FIELDS.includes(field)
  return false
}

/**
 * Drops private fields the editor cannot read, so a hidden value is never sent back as a
 * blank and overwritten.
 */
export function profileUpdatePayload<T extends Record<string, unknown>>(values: T, viewerRole: UserRole | null | undefined) {
  const payload: Record<string, unknown> = { ...values }
  for (const field of PROFILE_PRIVATE_FIELDS) {
    if (field in payload && !canManageProfileField(viewerRole, field)) delete payload[field]
  }
  return payload as Partial<T>
}
