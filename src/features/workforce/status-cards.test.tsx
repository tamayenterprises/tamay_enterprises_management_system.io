import { render, screen } from '@testing-library/react'
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
  it('starts collapsed, then shows counts and two names, then three more at a time', async () => {
    const user = userEvent.setup()
    render(<WorkforceStatusPanel />)

    expect(screen.getByText('Workforce status')).toBeInTheDocument()
    expect(screen.getByText(/Live availability across employees/)).toBeInTheDocument()
    expect(screen.queryByText('On Site')).not.toBeInTheDocument()
    expect(screen.queryByText('Worker 1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'See more' }))
    expect(screen.getByText('On Site')).toBeInTheDocument()
    expect(screen.getByText('Traveling')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('Worker 1')).toBeInTheDocument()
    expect(screen.getByText('Worker 2')).toBeInTheDocument()
    expect(screen.queryByText('Worker 3')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 3 more/i }))
    expect(screen.getByText('Worker 5')).toBeInTheDocument()
    expect(screen.queryByText('Worker 6')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 1 more/i }))
    expect(screen.getByText('Worker 6')).toBeInTheDocument()
  })
})
