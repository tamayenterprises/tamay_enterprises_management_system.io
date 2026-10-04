import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile, ProjectAssignment } from '@/types/database'
import { ProjectClientsSection } from './project-clients-section'

const assignMutate = vi.fn()
const setPrimaryMutate = vi.fn()
const removeMutate = vi.fn()

vi.mock('@/features/data/hooks', () => ({
  useAssignWorker: () => ({ mutateAsync: assignMutate, isPending: false }),
  useSetPrimaryClient: () => ({ mutateAsync: setPrimaryMutate, isPending: false }),
  useRemoveAssignment: () => ({ mutateAsync: removeMutate, isPending: false }),
}))
vi.mock('@/lib/uploads', () => ({ confirmAction: () => true }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function person(id: string, first: string, last: string, phone: string) {
  return {
    id,
    first_name: first,
    last_name: last,
    company_name: null,
    email: `${id}@example.com`,
    phone,
    role: 'client',
    approval_status: 'approved',
    is_active: true,
    archived_at: null,
  } as unknown as Profile
}

const carlos = person('carlos', 'Carlos', 'Tamay', '(203) 220-6678')
const bona = person('bona', 'Bona', 'Kim', '(203) 555-0101')

function assigned(profile: Profile, assignedAt: string, primary = false) {
  return {
    id: `a-${profile.id}`,
    project_id: 'p1',
    profile_id: profile.id,
    assigned_by: null,
    assigned_at: assignedAt,
    removed_at: null,
    is_active: true,
    is_primary_client: primary,
    profile,
  } as ProjectAssignment
}

function renderSection(clientAssignments: ProjectAssignment[], extra: Partial<{ assignmentsError: boolean }> = {}) {
  return render(
    <ProjectClientsSection
      projectId="p1"
      clientAssignments={clientAssignments}
      clientOptions={[carlos, bona]}
      canManage
      {...extra}
    />,
  )
}

const picker = () => screen.getByRole('combobox', { name: 'Select a client' })

beforeEach(() => {
  assignMutate.mockReset()
  setPrimaryMutate.mockReset()
  removeMutate.mockReset()
  assignMutate.mockResolvedValue({ is_primary_client: false })
  setPrimaryMutate.mockResolvedValue(undefined)
})

describe('ProjectClientsSection', () => {
  it('A: first client on an empty project is assigned without a Primary prompt (database makes it Primary)', async () => {
    assignMutate.mockResolvedValue({ is_primary_client: true })
    renderSection([])
    expect(screen.getByText('The first client becomes the Primary Client automatically.')).toBeInTheDocument()
    await userEvent.selectOptions(picker(), 'carlos')
    expect(screen.queryByLabelText('Set as Primary Client')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Assign client' }))
    expect(assignMutate).toHaveBeenCalledWith({ projectId: 'p1', profileId: 'carlos' })
    expect(setPrimaryMutate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('B: selecting a second, unassigned client shows the "Set as Primary Client" checkbox', async () => {
    renderSection([assigned(carlos, '2026-09-01T00:00:00Z', true)])
    await userEvent.selectOptions(picker(), 'bona')
    expect(screen.getByLabelText('Set as Primary Client')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assign client' })).toBeEnabled()
  })

  it('B2: unchecked assigns normally and never changes Primary', async () => {
    renderSection([assigned(carlos, '2026-09-01T00:00:00Z', true)])
    await userEvent.selectOptions(picker(), 'bona')
    await userEvent.click(screen.getByRole('button', { name: 'Assign client' }))
    expect(assignMutate).toHaveBeenCalledWith({ projectId: 'p1', profileId: 'bona' })
    expect(setPrimaryMutate).not.toHaveBeenCalled()
  })

  it('C: checked + confirm assigns the second client, then makes them Primary', async () => {
    renderSection([assigned(carlos, '2026-09-01T00:00:00Z', true)])
    await userEvent.selectOptions(picker(), 'bona')
    await userEvent.click(screen.getByLabelText('Set as Primary Client'))
    await userEvent.click(screen.getByRole('button', { name: 'Assign client' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Set Bona Kim as Primary Client?')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Bona Kim will become the main client contact for employee schedules and project contact information. Other assigned clients will keep their project access.',
      ),
    ).toBeInTheDocument()
    expect(assignMutate).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Set as Primary' }))
    expect(assignMutate).toHaveBeenCalledWith({ projectId: 'p1', profileId: 'bona' })
    expect(setPrimaryMutate).toHaveBeenCalledWith({ projectId: 'p1', profileId: 'bona' })
    expect(assignMutate.mock.invocationCallOrder[0]).toBeLessThan(setPrimaryMutate.mock.invocationCallOrder[0])
  })

  it('D: an already-assigned client is labelled, not re-assigned, and offers "Set as Primary Client"', async () => {
    renderSection([assigned(carlos, '2026-09-01T00:00:00Z'), assigned(bona, '2026-10-01T00:00:00Z')])
    expect(screen.getByRole('option', { name: /Bona Kim .* — assigned/ })).toBeInTheDocument()
    await userEvent.selectOptions(picker(), 'bona')
    expect(screen.queryByLabelText('Set as Primary Client')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assign client' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Set as Primary Client' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Set as Primary' }))
    expect(assignMutate).not.toHaveBeenCalled()
    expect(setPrimaryMutate).toHaveBeenCalledWith({ projectId: 'p1', profileId: 'bona' })
  })

  it('D2: selecting the current Primary shows a disabled "Primary Client" state', async () => {
    renderSection([assigned(carlos, '2026-09-01T00:00:00Z', true), assigned(bona, '2026-10-01T00:00:00Z')])
    await userEvent.selectOptions(picker(), 'carlos')
    expect(screen.getByRole('button', { name: 'Primary Client' })).toBeDisabled()
  })

  it('E: two active clients and no Primary: both listed, warning shown, Set as Primary on both', () => {
    renderSection([assigned(carlos, '2026-09-01T00:00:00Z'), assigned(bona, '2026-10-01T00:00:00Z')])
    const rows = screen.getAllByTestId('client-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Carlos Tamay')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Bona Kim')).toBeInTheDocument()
    expect(screen.getByText('Primary client not selected')).toBeInTheDocument()
    for (const row of rows) {
      expect(within(row).getByText(/Assigned Client/)).toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Set as Primary' })).toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    }
  })

  it('E2: Cancel in the confirmation changes nothing', async () => {
    renderSection([assigned(carlos, '2026-09-01T00:00:00Z'), assigned(bona, '2026-10-01T00:00:00Z')])
    const bonaRow = screen.getAllByTestId('client-row')[1]
    await userEvent.click(within(bonaRow).getByRole('button', { name: 'Set as Primary' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(setPrimaryMutate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('F: after switching, the new Primary gets the star and badge and the previous one stays assigned', () => {
    renderSection([assigned(carlos, '2026-09-01T00:00:00Z'), assigned(bona, '2026-10-01T00:00:00Z', true)])
    const rows = screen.getAllByTestId('client-row')
    expect(within(rows[0]).getByText('Bona Kim')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/Primary Client/)).toBeInTheDocument()
    expect(within(rows[0]).getByLabelText('Primary')).toBeInTheDocument()
    expect(within(rows[0]).getByRole('link', { name: '(203) 555-0101' })).toHaveAttribute('href', 'tel:+12035550101')
    expect(within(rows[0]).queryByRole('button', { name: 'Set as Primary' })).not.toBeInTheDocument()
    expect(within(rows[1]).getByText('Carlos Tamay')).toBeInTheDocument()
    expect(within(rows[1]).getByText(/Assigned Client/)).toBeInTheDocument()
    expect(within(rows[1]).getByRole('button', { name: 'Set as Primary' })).toBeInTheDocument()
    expect(screen.queryByText('Primary client not selected')).not.toBeInTheDocument()
  })

  it('shows an error instead of an empty list when assignments fail to load, and hides assign controls', () => {
    renderSection([], { assignmentsError: true })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the clients on this project')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByText('No clients assigned yet.')).not.toBeInTheDocument()
  })
})
