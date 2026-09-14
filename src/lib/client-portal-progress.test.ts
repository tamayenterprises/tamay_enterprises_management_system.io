import { describe, expect, it } from 'vitest'
import { pickPrimaryClientProject } from '@/lib/client-portal-progress'

describe('pickPrimaryClientProject', () => {
  it('prefers in_progress over waiting and completed', () => {
    const primary = pickPrimaryClientProject([
      { status: 'completed', updated_at: '2026-09-10T00:00:00Z' },
      { status: 'waiting', updated_at: '2026-09-11T00:00:00Z' },
      { status: 'in_progress', updated_at: '2026-09-01T00:00:00Z' },
    ])
    expect(primary?.status).toBe('in_progress')
  })

  it('returns null for empty list', () => {
    expect(pickPrimaryClientProject([])).toBeNull()
  })
})
