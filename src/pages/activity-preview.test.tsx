import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RecentActivityPage } from './activity'

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'u1', role: 'employee', organization_id: 'org' } }),
}))
vi.mock('@/features/data/hooks', () => ({
  useProjects: () => ({ data: [] }),
}))
vi.mock('@/features/notifications/hooks', () => ({
  relevanceLabel: (value: string) => value,
  useProjectActivityFeed: () => ({
    data: [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `a${n}`,
      title: `Activity ${n}`,
      preview_text: `Preview ${n}`,
      activity_type: 'COMMENT_CREATED',
      requires_attention: false,
      project_id: 'p1',
      project: { name: 'Office' },
      actor: { first_name: 'Pat', last_name: 'Lee' },
      created_at: '2026-10-01T00:00:00Z',
      destination_route: '/projects/p1',
    })),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('sonner', () => ({ toast: { message: vi.fn() } }))

describe('Activity timeline', () => {
  it('shows two items, then three more at a time', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <RecentActivityPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Activity 1')).toBeInTheDocument()
    expect(screen.getByText('Activity 2')).toBeInTheDocument()
    expect(screen.queryByText('Activity 3')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 3 more/i }))
    expect(screen.getByText('Activity 5')).toBeInTheDocument()
    expect(screen.queryByText('Activity 6')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 1 more/i }))
    expect(screen.getByText('Activity 6')).toBeInTheDocument()
  })
})
