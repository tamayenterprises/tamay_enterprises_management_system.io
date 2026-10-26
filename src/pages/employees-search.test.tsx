import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/types/database'
import { EmployeesPage } from './employees'

const useProfiles = vi.fn()
const updateMutate = vi.fn()
let viewerRole = 'admin'

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'viewer', role: viewerRole } }),
}))
vi.mock('@/features/admin/profile-assignments-panel', () => ({
  ProfileAssignmentsPanel: () => null,
}))
vi.mock('@/features/data/hooks', () => ({
  useProfiles: (args: unknown) => useProfiles(args),
  useUpdateProfile: () => ({ mutateAsync: updateMutate }),
  useAdminSetUserAccess: () => ({ mutateAsync: vi.fn() }),
  useSetWorkerStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWorkerEligibility: () => ({ data: undefined }),
  useWorkerStatusHistory: () => ({ data: [] }),
  useCertifications: () => ({ data: [], isLoading: false, isError: false }),
  useDocuments: () => ({ data: [], isLoading: false, isError: false }),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCertification: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  createCertificationProofUrl: vi.fn(),
  viewDocumentFile: vi.fn(),
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
  viewerRole = 'admin'
  updateMutate.mockReset()
  updateMutate.mockResolvedValue(undefined)
  useProfiles.mockReset()
  useProfiles.mockReturnValue({ data: [employee], isLoading: false, isError: false })
})

describe('Employees search', () => {
  it('shows All, Active, Inactive, and Removed filters', () => {
    render(<EmployeesPage />)
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inactive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Removed' })).toBeInTheDocument()
  })

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

describe('Employees private fields by viewer', () => {
  async function openEditor() {
    await userEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
    return screen.findByRole('dialog')
  }

  it('admin sees and edits hire date, emergency contact and notes', async () => {
    render(<EmployeesPage />)
    expect(screen.getByText(/Hire date:/)).toBeInTheDocument()
    expect(screen.getByText(/Emergency contact:/)).toBeInTheDocument()
    const dialog = await openEditor()
    expect(within(dialog).getByText('Hire date')).toBeInTheDocument()
    expect(within(dialog).getByText('Internal notes')).toBeInTheDocument()
  })

  it('project manager sees none of them and the save never sends them', async () => {
    viewerRole = 'project_manager'
    render(<EmployeesPage />)
    expect(screen.queryByText(/Hire date:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Emergency contact:/)).not.toBeInTheDocument()
    expect(screen.getByText(/Phone:/)).toBeInTheDocument()

    const dialog = await openEditor()
    for (const label of ['Hire date', 'Emergency contact', 'Emergency phone', 'Internal notes']) {
      expect(within(dialog).queryByText(label)).not.toBeInTheDocument()
    }
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(updateMutate).toHaveBeenCalledTimes(1)
    const { values } = updateMutate.mock.calls[0][0] as { values: Record<string, unknown> }
    for (const field of ['hire_date', 'emergency_contact_name', 'emergency_contact_phone', 'internal_notes']) {
      expect(values).not.toHaveProperty(field)
    }
    expect(values).toMatchObject({ first_name: 'Ana', last_name: 'Kim' })
  })
})
