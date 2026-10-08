import { describe, expect, it } from 'vitest'
import { ASSIGNED_PROJECTS_PREVIEW, visibleAssignments } from './assignment-preview'

describe('visibleAssignments', () => {
  it('shows at most three until Show more', () => {
    const rows = [1, 2, 3, 4, 5, 6]
    expect(visibleAssignments(rows, false)).toEqual([1, 2, 3])
    expect(visibleAssignments(rows, false)).toHaveLength(ASSIGNED_PROJECTS_PREVIEW)
    expect(visibleAssignments(rows, true)).toEqual(rows)
  })

  it('does not collapse a short list', () => {
    expect(visibleAssignments([1, 2], false)).toEqual([1, 2])
  })
})
