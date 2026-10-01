import { describe, expect, it } from 'vitest'
import { resolvePrimaryClient } from './primary-client'

function assignment(
  id: string,
  options: {
    role?: string
    assignedAt?: string
    primary?: boolean
    active?: boolean
    archived?: boolean
  } = {},
) {
  return {
    id,
    assigned_at: options.assignedAt ?? '2026-09-01T12:00:00Z',
    is_active: options.active ?? true,
    is_primary_client: options.primary ?? false,
    profile: {
      role: (options.role ?? 'client') as 'client',
      archived_at: options.archived ? '2026-09-20T00:00:00Z' : null,
    },
  }
}

describe('resolvePrimaryClient', () => {
  it('uses the only client when there is one', () => {
    const result = resolvePrimaryClient([
      assignment('worker', { role: 'employee', assignedAt: '2026-08-01T00:00:00Z' }),
      assignment('stephanie'),
    ])
    expect(result.contact?.id).toBe('stephanie')
    expect(result.status).toBe('sole')
  })

  it('reports primary when the only client is flagged', () => {
    const result = resolvePrimaryClient([assignment('stephanie', { primary: true })])
    expect(result.status).toBe('primary')
  })

  it('Carlos assigned first, homeowner primary: homeowner is the contact', () => {
    const result = resolvePrimaryClient([
      assignment('carlos', { assignedAt: '2026-08-01T00:00:00Z' }),
      assignment('stephanie', { assignedAt: '2026-09-01T00:00:00Z', primary: true }),
    ])
    expect(result.contact?.id).toBe('stephanie')
    expect(result.status).toBe('primary')
    expect(result.clients.map((c) => c.id)).toEqual(['stephanie', 'carlos'])
  })

  it('falls back to the earliest client and asks for a selection when several have no primary', () => {
    const result = resolvePrimaryClient([
      assignment('john', { assignedAt: '2026-09-03T00:00:00Z' }),
      assignment('carlos', { assignedAt: '2026-08-01T00:00:00Z' }),
      assignment('stephanie', { assignedAt: '2026-09-01T00:00:00Z' }),
    ])
    expect(result.contact?.id).toBe('carlos')
    expect(result.status).toBe('needs_selection')
  })

  it('ignores inactive, archived and non-client assignments', () => {
    const result = resolvePrimaryClient([
      assignment('removed', { active: false, assignedAt: '2026-01-01T00:00:00Z' }),
      assignment('archived', { archived: true, assignedAt: '2026-01-02T00:00:00Z' }),
      assignment('pm', { role: 'project_manager', assignedAt: '2026-01-03T00:00:00Z' }),
      assignment('stephanie'),
    ])
    expect(result.clients.map((c) => c.id)).toEqual(['stephanie'])
    expect(result.status).toBe('sole')
  })

  it('treats a missing flag (column not migrated yet) as not primary', () => {
    const legacy = { ...assignment('carlos', { assignedAt: '2026-08-01T00:00:00Z' }), is_primary_client: undefined }
    const result = resolvePrimaryClient([legacy, assignment('stephanie')])
    expect(result.contact?.id).toBe('carlos')
    expect(result.status).toBe('needs_selection')
  })

  it('returns none without clients', () => {
    expect(resolvePrimaryClient([assignment('worker', { role: 'employee' })])).toMatchObject({
      contact: null,
      status: 'none',
    })
  })
})
