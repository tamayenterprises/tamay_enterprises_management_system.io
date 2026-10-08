export function workforceAdminActions(input: {
  viewerRole?: string | null
  viewerId?: string | null
  workerId: string
  isActive: boolean
}) {
  const isAdmin = input.viewerRole === 'admin'
  const isManagement = isAdmin || input.viewerRole === 'project_manager'
  const isSelf = Boolean(input.viewerId && input.viewerId === input.workerId)
  return {
    canClockOut: isManagement,
    canDeactivate: isAdmin && !isSelf && input.isActive,
    canRemove: isAdmin && !isSelf,
    canHireBack: isAdmin && !isSelf && !input.isActive,
  }
}

export function accountChangeReason(typed: string, fallback: string) {
  const value = typed.trim()
  return value.length >= 3 ? value : fallback
}
