import { describe, expect, it } from 'vitest'
import { isTallClientUpdate } from '@/features/client/project-updates'
import type { ProjectNote } from '@/types/database'

function note(partial: Partial<ProjectNote> & { id: string }): ProjectNote {
  return {
    project_id: 'proj',
    author_id: 'a',
    content: null,
    photo_path: null,
    parent_id: null,
    visible_to_client: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

describe('isTallClientUpdate', () => {
  it('treats short text-only updates as compact', () => {
    const update = note({ id: '1', content: 'Quick progress note.' })
    expect(isTallClientUpdate(update, [])).toBe(false)
  })

  it('flags many photos as tall', () => {
    const update = note({ id: '1', content: 'Photos', photo_path: 'a.jpg' })
    const replies = [
      note({ id: '2', parent_id: '1', content: '', photo_path: 'b.jpg' }),
      note({ id: '3', parent_id: '1', content: '', photo_path: 'c.jpg' }),
    ]
    expect(isTallClientUpdate(update, replies)).toBe(true)
  })

  it('flags long content as tall', () => {
    const update = note({ id: '1', content: 'x'.repeat(220) })
    expect(isTallClientUpdate(update, [])).toBe(true)
  })
})
