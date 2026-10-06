import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentRecord } from '@/types/database'
import { DocumentTeamAccess } from './document-team-access'

const setVisibility = vi.fn()

vi.mock('@/features/data/hooks', () => ({
  useSetDocumentTeamVisibility: () => ({ mutateAsync: setVisibility, isPending: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function doc(teamVisible: boolean) {
  return {
    id: 'd1',
    project_id: 'p1',
    name: 'Project Breakdown.pdf',
    category: 'project_file',
    mime_type: 'application/pdf',
    team_visible: teamVisible,
  } as DocumentRecord
}

const toggle = () => screen.getByRole('switch', { name: 'Visible to Project Team' })

beforeEach(() => {
  setVisibility.mockReset()
  setVisibility.mockResolvedValue(undefined)
})

describe('DocumentTeamAccess', () => {
  it('shows the private default', () => {
    render(<DocumentTeamAccess doc={doc(false)} />)
    expect(screen.getByText('Visibility: Management & Client')).toBeInTheDocument()
    expect(screen.getByText('Only authorized management and the client can view this document.')).toBeInTheDocument()
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
  })

  it('asks for confirmation before sharing, and Cancel changes nothing', async () => {
    render(<DocumentTeamAccess doc={doc(false)} />)
    await userEvent.click(toggle())
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Share document with project team?')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Assigned team members on this project will be able to open this document. Client and management access will remain unchanged.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(setVisibility).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Share with Team turns access on', async () => {
    render(<DocumentTeamAccess doc={doc(false)} />)
    await userEvent.click(toggle())
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Share with Team' }))
    expect(setVisibility).toHaveBeenCalledWith({ doc: expect.objectContaining({ id: 'd1' }), teamVisible: true })
  })

  it('a failed save leaves the switch OFF (no optimistic state)', async () => {
    setVisibility.mockRejectedValue(new Error('permission denied'))
    render(<DocumentTeamAccess doc={doc(false)} />)
    await userEvent.click(toggle())
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Share with Team' }))
    expect(setVisibility).toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('switch', { hidden: true })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Visibility: Management & Client')).toBeInTheDocument()
  })

  it('turning access off is immediate', async () => {
    render(<DocumentTeamAccess doc={doc(true)} />)
    expect(screen.getByText('Visibility: Management, Client & Project Team')).toBeInTheDocument()
    expect(screen.getByText('Assigned project team members can view this document.')).toBeInTheDocument()
    await userEvent.click(toggle())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(setVisibility).toHaveBeenCalledWith({ doc: expect.objectContaining({ id: 'd1' }), teamVisible: false })
  })
})
