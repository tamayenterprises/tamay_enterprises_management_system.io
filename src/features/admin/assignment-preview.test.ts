import { describe, expect, it } from 'vitest'
import { ASSIGNED_PROJECTS_PREVIEW, growPreview, visibleAssignments } from './assignment-preview'

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

describe('growPreview', () => {
  it('adds three rows each time until the end', () => {
    expect(growPreview(3, 10)).toBe(6)
    expect(growPreview(6, 10)).toBe(9)
    expect(growPreview(9, 10)).toBe(10)
    expect(growPreview(10, 10)).toBe(10)
  })

  it('adds five rows for directory lists', () => {
    expect(growPreview(5, 18, 5)).toBe(10)
    expect(growPreview(15, 18, 5)).toBe(18)
  })
})
