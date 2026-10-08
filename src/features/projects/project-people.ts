export function splitWorkerAssignments<T extends { profile?: { role?: string } | null }>(
  assignments: T[],
) {
  const managers = assignments.filter((item) => item.profile?.role === 'project_manager')
  const others = assignments.filter((item) => item.profile?.role !== 'project_manager')
  return { managers, others }
}
