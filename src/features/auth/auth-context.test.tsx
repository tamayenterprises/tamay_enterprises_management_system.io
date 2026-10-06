import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectDocuments } from '@/features/data/documents'
import { useAuth } from './auth-hooks'
import { AuthProvider } from './auth-context'

type Session = { user: { id: string } } | null

const PROFILES: Record<string, { id: string; role: string }> = {
  admin: { id: 'admin', role: 'admin' },
  employee: { id: 'employee', role: 'employee' },
}
// What the database returns to each user (row-level security), never the client's choice.
const DOCS_BY_USER: Record<string, Array<{ id: string; name: string; team_visible: boolean }>> = {
  admin: [
    { id: 'doc-a', name: 'Project Breakdown.pdf', team_visible: true },
    { id: 'doc-b', name: 'Agreement.pdf', team_visible: false },
  ],
  employee: [{ id: 'doc-a', name: 'Project Breakdown.pdf', team_visible: true }],
}

let currentUser: string | null = 'admin'
let authListener: ((event: string, session: Session) => void) | null = null

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: currentUser ? { user: { id: currentUser } } : null } }),
      onAuthStateChange: (cb: (event: string, session: Session) => void) => {
        authListener = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: async () => {
        currentUser = null
        return { error: null }
      },
    },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (_col: string, value: string) => {
          if (table === 'profiles') {
            return { maybeSingle: async () => ({ data: PROFILES[value] ?? null, error: null }) }
          }
          return chain
        },
        order: async () => ({ data: currentUser ? DOCS_BY_USER[currentUser] : [], error: null }),
      }
      return chain
    },
  },
}))

function ProjectDocumentNames() {
  const { profile, signOut } = useAuth()
  const { data = [] } = useProjectDocuments('project-1')
  return (
    <div>
      <p>user: {profile?.id ?? 'none'}</p>
      <ul>
        {data.map((doc) => (
          <li key={doc.id}>{doc.name}</li>
        ))}
      </ul>
      <button onClick={() => void signOut()}>sign out</button>
    </div>
  )
}

function renderApp(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProjectDocumentNames />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

const cachedNames = (queryClient: QueryClient) =>
  JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data ?? null))

beforeEach(() => {
  currentUser = 'admin'
  authListener = null
})

describe('account switch: Admin → sign out → Employee', () => {
  it('drops every cached Admin document before the Employee session starts', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    renderApp(queryClient)
    expect(await screen.findByText('Agreement.pdf')).toBeInTheDocument()
    expect(screen.getByText('user: admin')).toBeInTheDocument()

    await act(async () => {
      currentUser = null
      authListener?.('SIGNED_OUT', null)
    })
    expect(queryClient.getQueryCache().getAll().every((q) => q.state.data === undefined)).toBe(true)
    expect(screen.queryByText('Agreement.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText('Project Breakdown.pdf')).not.toBeInTheDocument()

    await act(async () => {
      currentUser = 'employee'
      authListener?.('SIGNED_IN', { user: { id: 'employee' } })
    })
    expect(await screen.findByText('user: employee')).toBeInTheDocument()
    expect(await screen.findByText('Project Breakdown.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Agreement.pdf')).not.toBeInTheDocument()
    expect(cachedNames(queryClient)).not.toContain('Agreement.pdf')
  })

  it('a direct account switch without a sign-out event also clears the cache', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    renderApp(queryClient)
    expect(await screen.findByText('Agreement.pdf')).toBeInTheDocument()

    await act(async () => {
      currentUser = 'employee'
      authListener?.('SIGNED_IN', { user: { id: 'employee' } })
    })
    expect(await screen.findByText('user: employee')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Project Breakdown.pdf')).toBeInTheDocument())
    expect(screen.queryByText('Agreement.pdf')).not.toBeInTheDocument()
    expect(cachedNames(queryClient)).not.toContain('Agreement.pdf')
  })

  it('signOut() from the app clears the cache immediately', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderApp(queryClient)
    expect(await screen.findByText('Agreement.pdf')).toBeInTheDocument()
    await act(async () => {
      screen.getByRole('button', { name: 'sign out' }).click()
    })
    expect(cachedNames(queryClient)).not.toContain('Agreement.pdf')
    expect(screen.queryByText('Agreement.pdf')).not.toBeInTheDocument()
  })

  it('a token refresh for the same user keeps the cache', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderApp(queryClient)
    expect(await screen.findByText('Agreement.pdf')).toBeInTheDocument()
    await act(async () => {
      authListener?.('TOKEN_REFRESHED', { user: { id: 'admin' } })
    })
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0)
  })
})
