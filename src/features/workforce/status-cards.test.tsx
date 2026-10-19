import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkforceStatusPanel } from './status-cards'

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'admin-1', role: 'admin', organization_id: 'org' } }),
}))
vi.mock('@/features/data/hooks', () => ({
  useProjects: () => ({ data: [] }),
  useSetWorkerStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/workforce/hooks', () => ({
  useAdminClockOutWorker: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCurrentWorkforceStatuses: () => ({
    data: [1, 2, 3, 4, 5, 6].map((n) => ({
      user_id: `w${n}`,
      first_name: `Worker`,
      last_name: `${n}`,
      avatar_url: null,
      role: 'employee',
      status: 'completed_for_day',
      is_active: true,
      project_name: 'Kitchen',
      updated_at: '2026-10-01T00:00:00Z',
    })),
    isLoading: false,
    isError: false,
  }),
  useMyCurrentStatus: () => ({ data: null, isLoading: false, isError: false }),
  useUpdateWorkerStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/uploads', async () => {
  const actual = await vi.importActual<typeof import('@/lib/uploads')>('@/lib/uploads')
  return { ...actual, confirmAction: () => true }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))

describe('Workforce status panel', () => {
  it('keeps phones collapsed, then shows two names and three more at a time', async () => {
    const user = userEvent.setup()
    render(<WorkforceStatusPanel />)

    expect(screen.getByText('Workforce status')).toBeInTheDocument()
    expect(screen.getByText(/Live availability across employees/)).toBeInTheDocument()
    expect(screen.queryByTestId('workforce-status-mobile')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'See more' })).toHaveClass('lg:hidden')

    await user.click(screen.getByRole('button', { name: 'See more' }))
    const mobile = screen.getByTestId('workforce-status-mobile')
    expect(within(mobile).getByText('On Site')).toBeInTheDocument()
    expect(within(mobile).getByText('Worker 1')).toBeInTheDocument()
    expect(within(mobile).getByText('Worker 2')).toBeInTheDocument()
    expect(within(mobile).queryByText('Worker 3')).not.toBeInTheDocument()

    await user.click(within(mobile).getByRole('button', { name: /See 3 more/i }))
    expect(within(mobile).getByText('Worker 5')).toBeInTheDocument()
    expect(within(mobile).queryByText('Worker 6')).not.toBeInTheDocument()

    await user.click(within(mobile).getByRole('button', { name: /See 1 more/i }))
    expect(within(mobile).getByText('Worker 6')).toBeInTheDocument()
  })

  it('shows five people on desktop and keeps See more for the rest', async () => {
    const user = userEvent.setup()
    render(<WorkforceStatusPanel />)

    const desktop = screen.getByTestId('workforce-status-desktop')
    expect(desktop).toHaveClass('hidden', 'lg:block')
    expect(within(desktop).getByText('On Site')).toBeInTheDocument()
    expect(within(desktop).getByText('Worker 5')).toBeInTheDocument()
    expect(within(desktop).queryByText('Worker 6')).not.toBeInTheDocument()

    await user.click(within(desktop).getByRole('button', { name: /See 1 more/i }))
    expect(within(desktop).getByText('Worker 6')).toBeInTheDocument()
    expect(within(desktop).queryByRole('button', { name: /See .* more/i })).not.toBeInTheDocument()
  })
})
