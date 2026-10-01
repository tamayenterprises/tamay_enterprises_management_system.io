import type { Profile, ProjectAssignment } from '@/types/database'

type ClientAssignmentLike = Pick<ProjectAssignment, 'id' | 'assigned_at' | 'is_active'> & {
  is_primary_client?: boolean | null
  profile?: Pick<Profile, 'role' | 'archived_at'> | null
}

export type PrimaryClientStatus =
  /** An assignment is explicitly marked Primary Client. */
  | 'primary'
  /** No primary set, exactly one eligible client: that client is the contact. */
  | 'sole'
  /** No primary set, several clients: earliest assignment is used until Management picks one. */
  | 'needs_selection'
  | 'none'

export type PrimaryClientResolution<T> = {
  /** Client used as the project contact (mirrors SQL `resolve_project_client`). */
  contact: T | null
  status: PrimaryClientStatus
  /** Eligible client assignments, primary first, then earliest assigned. */
  clients: T[]
}

export function isEligibleClientAssignment(assignment: ClientAssignmentLike): boolean {
  return (
    assignment.is_active === true &&
    assignment.profile?.role === 'client' &&
    !assignment.profile.archived_at
  )
}

function compareClientAssignments(a: ClientAssignmentLike, b: ClientAssignmentLike) {
  const primary = Number(Boolean(b.is_primary_client)) - Number(Boolean(a.is_primary_client))
  if (primary !== 0) return primary
  const time = new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime()
  if (time !== 0) return time
  return a.id.localeCompare(b.id)
}

/**
 * Canonical client-contact rule shared with the database:
 * Primary Client, otherwise the earliest active client assignment.
 */
export function resolvePrimaryClient<T extends ClientAssignmentLike>(
  assignments: readonly T[],
): PrimaryClientResolution<T> {
  const clients = assignments.filter(isEligibleClientAssignment).sort(compareClientAssignments)
  const contact = clients[0] ?? null
  let status: PrimaryClientStatus = 'none'
  if (contact?.is_primary_client) status = 'primary'
  else if (clients.length === 1) status = 'sole'
  else if (clients.length > 1) status = 'needs_selection'
  return { contact, status, clients }
}
