import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { CompanyUpdate } from '@/types/database'
import { UpdatesPage } from './updates'

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'u1', role: 'employee', organization_id: 'org' } }),
}))
vi.mock('@/features/data/hooks', () => ({
  useProfiles: () => ({ data: [] }),
  useProjects: () => ({ data: [] }),
}))
vi.mock('@/features/updates/hooks', () => ({
  useCompanyUpdates: () => ({
    data: [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `u${n}`,
      organization_id: 'org',
      author_id: 'a1',
      parent_id: null,
      content: `Update ${n}`,
      photo_path: null,
      audience_type: 'all_internal',
      replies_enabled: true,
      requires_attention: false,
      notify_project_team: false,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      author: { first_name: 'Pat', last_name: 'Lee' },
    })) as CompanyUpdate[],
    isLoading: false,
    isError: false,
  }),
  useCreateCompanyUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMyProjectUpdatesFeed: () => ({ data: [], isLoading: false }),
  createUpdatePhotoSignedUrl: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('Employee company updates', () => {
  it('shows two updates, then three more at a time', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Update 1')).toBeInTheDocument()
    expect(screen.getByText('Update 2')).toBeInTheDocument()
    expect(screen.queryByText('Update 3')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 3 more/i }))
    expect(screen.getByText('Update 5')).toBeInTheDocument()
    expect(screen.queryByText('Update 6')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 1 more/i }))
    expect(screen.getByText('Update 6')).toBeInTheDocument()
  })
})
