export const ASSIGNED_PROJECTS_PREVIEW = 3
/** Directory, feeds, and cards: show this many, then See more in steps of the same size. */
export const LIST_PREVIEW = 5

export function visibleAssignments<T>(assignments: T[], expanded: boolean, limit = ASSIGNED_PROJECTS_PREVIEW) {
  if (expanded || assignments.length <= limit) return assignments
  return assignments.slice(0, limit)
}

/** Timesheets: keep adding `step` rows until the list is fully shown. */
export function growPreview(shown: number, total: number, step = ASSIGNED_PROJECTS_PREVIEW) {
  return Math.min(shown + step, total)
}
