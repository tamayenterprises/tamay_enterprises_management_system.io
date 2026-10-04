import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAssignWorker } from './assignments'
import projectsSource from './projects.ts?raw'

const writes: string[] = []
let existingActive: Record<string, unknown> | null = null

vi.mock('@/features/auth/auth-hooks', () => ({ useAuth: () => ({ profile: { id: 'admin' } }) }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: existingActive, error: null }),
        single: async () => ({ data: { id: 'new', is_primary_client: false }, error: null }),
        upsert: () => {
          writes.push(`${table}.upsert`)
          return chain
        },
        insert: async () => {
          writes.push(`${table}.insert`)
          return { error: null }
        },
      }
      return chain
    },
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => {
  writes.length = 0
  existingActive = null
})

describe('useAssignWorker', () => {
  it('does not re-assign, log history or notify when the person is already active on the project', async () => {
    existingActive = { id: 'a-bona', is_active: true, is_primary_client: false }
    const { result } = renderHook(() => useAssignWorker(), { wrapper })
    const row = await result.current.mutateAsync({ projectId: 'p1', profileId: 'bona' })
    expect(row).toMatchObject({ id: 'a-bona' })
    expect(writes).toEqual([])
  })

  it('assigns and records history when the person is not active on the project', async () => {
    const { result } = renderHook(() => useAssignWorker(), { wrapper })
    await result.current.mutateAsync({ projectId: 'p1', profileId: 'bona' })
    expect(writes).toContain('project_assignments.upsert')
    expect(writes).toContain('assignment_history.insert')
  })
})

describe('useProjectAssignments query', () => {
  it('names the profile_id relationship (project_assignments has two foreign keys to profiles)', () => {
    const fn = projectsSource.slice(projectsSource.indexOf('export function useProjectAssignments'))
    expect(fn.slice(0, fn.indexOf('\n}\n'))).toContain("profile:profiles!profile_id(*)")
  })
})
