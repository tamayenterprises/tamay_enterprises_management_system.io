import { isClientRole, isManagementRole } from '@/lib/utils'
import type { Profile } from '@/types/database'

/** True when this worker added the certification themselves (not Tamay / management). */
export function isSelfUploadedCertification(
  cert: { created_by?: string | null },
  workerId?: string | null,
) {
  return Boolean(workerId && cert.created_by === workerId)
}

/** Workers ask admin to delete any certification on their record. */
export function canRequestCertificationDelete(viewer?: Pick<Profile, 'role'> | null) {
  if (!viewer) return false
  if (isManagementRole(viewer.role) || isClientRole(viewer.role)) return false
  return true
}

export const CERTIFICATION_TYPES = [
  'OSHA',
  'Equipment',
  'Trade',
  'CPR',
  'First Aid',
  'Company-specific',
  'Other',
] as const

/** All types shows every certification; any other value matches that type only. */
export function certificationMatchesType(
  cert: { certification_type?: string | null },
  type: string,
) {
  if (!type || type === 'all') return true
  return (cert.certification_type ?? '').trim() === type
}
