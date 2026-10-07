import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/types/database'
import { EmployeesPage } from './employees'

const useProfiles = vi.fn()

vi.mock('@/features/admin/profile-assignments-panel', () => ({
  ProfileAssignmentsPanel: () => null,
}))
vi.mock('@/features/data/hooks', () => ({
  useProfiles: (args: unknown) => useProfiles(args),
  useUpdateProfile: () => ({ mutateAsync: vi.fn() }),
  useAdminSetUserAccess: () => ({ mutateAsync: vi.fn() }),
  useSetWorkerStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWorkerEligibility: () => ({ data: undefined }),
  useWorkerStatusHistory: () => ({ data: [] }),
}))

const employee = {
  id: 'e1',
  first_name: 'Ana',
  last_name: 'Kim',
  email: 'ana@tamay.test',
  phone: null,
  role: 'employee',
  approval_status: 'approved',
  is_active: true,
  archived_at: null,
  position: 'Carpenter',
  hire_date: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  internal_notes: null,
  avatar_url: null,
  company_name: null,
} as unknown as Profile

beforeEach(() => {
  useProfiles.mockReset()
  useProfiles.mockReturnValue({ data: [employee], isLoading: false, isError: false })
})

describe('Employees search', () => {
  it('keeps the search box mounted while a new query is fetching', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<EmployeesPage />)

    const input = screen.getByPlaceholderText('Search employees...')
    await user.type(input, 'a')
    expect(input).toHaveValue('a')

    useProfiles.mockReturnValue({ data: [employee], isLoading: true, isError: false })
    rerender(<EmployeesPage />)

    const stillThere = screen.getByPlaceholderText('Search employees...')
    expect(stillThere).toBeInTheDocument()
    expect(stillThere).toHaveValue('a')
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
})
