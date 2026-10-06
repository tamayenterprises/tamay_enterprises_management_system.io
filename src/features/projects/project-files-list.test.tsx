import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentRecord, Profile } from '@/types/database'
import { ProjectFilesList } from './project-files-list'

const viewFile = vi.fn()
const downloadFile = vi.fn()
const removeDoc = vi.fn()

vi.mock('@/features/data/hooks', () => ({
  useDeleteDocument: () => ({ mutateAsync: removeDoc, isPending: false }),
  useSetDocumentTeamVisibility: () => ({ mutateAsync: vi.fn(), isPending: false }),
  viewDocumentFile: (doc: DocumentRecord) => viewFile(doc),
  downloadDocumentFile: (doc: DocumentRecord) => downloadFile(doc),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const EMPLOYEE = { id: 'emp-1', role: 'employee' } as Pick<Profile, 'id' | 'role'>
const ADMIN = { id: 'admin-1', role: 'admin' } as Pick<Profile, 'id' | 'role'>

function file(overrides: Partial<DocumentRecord>): DocumentRecord {
  return {
    id: 'x',
    organization_id: 'org',
    project_id: 'project-1',
    category: 'project_file',
    mime_type: 'application/pdf',
    created_at: new Date().toISOString(),
    team_visible: false,
    ...overrides,
  } as DocumentRecord
}

// Carlos's Development screenshots: A shared with the team, B not. Both were uploaded from the
// employee account, which is why the old rules showed both, each with a Remove button.
const documentA = file({
  id: 'doc-a',
  name: 'Project Breakdown.pdf',
  team_visible: true,
  owner_id: EMPLOYEE.id,
  uploaded_by: EMPLOYEE.id,
})
const documentB = file({
  id: 'doc-b',
  name: 'Agreement.pdf',
  category: 'contract',
  team_visible: false,
  owner_id: EMPLOYEE.id,
  uploaded_by: EMPLOYEE.id,
})

async function openDocuments() {
  await userEvent.click(screen.getByRole('button', { name: 'View Documents ▼' }))
}

beforeEach(() => {
  viewFile.mockReset().mockResolvedValue(undefined)
  downloadFile.mockReset().mockResolvedValue(undefined)
  removeDoc.mockReset().mockResolvedValue(undefined)
})

describe('ProjectFilesList — assigned employee', () => {
  it('renders only the shared document, with View and Download but no Remove', async () => {
    render(<ProjectFilesList documents={[documentA, documentB]} viewer={EMPLOYEE} />)
    expect(screen.getByText('1 project document')).toBeInTheDocument()
    await openDocuments()

    const rowA = screen.getByText('Project Breakdown.pdf').closest('[id="doc-doc-a"]') as HTMLElement
    expect(within(rowA).getByRole('button', { name: 'View' })).toBeInTheDocument()
    expect(within(rowA).getByRole('button', { name: 'Download' })).toBeInTheDocument()

    expect(screen.queryByText('Agreement.pdf')).not.toBeInTheDocument()
    expect(document.getElementById('doc-doc-b')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText(/Visibility:/)).not.toBeInTheDocument()
  })

  it('View and Download act on the shared document only', async () => {
    render(<ProjectFilesList documents={[documentA, documentB]} viewer={EMPLOYEE} />)
    await openDocuments()
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await userEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(viewFile).toHaveBeenCalledWith(documentA)
    expect(downloadFile).toHaveBeenCalledWith(documentA)
  })

  it('reversed: Agreement ON and Project Breakdown OFF shows only Agreement', async () => {
    const docs = [{ ...documentA, team_visible: false }, { ...documentB, team_visible: true }]
    render(<ProjectFilesList documents={docs} viewer={EMPLOYEE} />)
    expect(screen.getByText('1 project document')).toBeInTheDocument()
    await openDocuments()
    expect(screen.getByText('Agreement.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Project Breakdown.pdf')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('subcontractors follow the same rule', async () => {
    render(<ProjectFilesList documents={[documentA, documentB]} viewer={{ id: 'sub-1', role: 'subcontractor' }} />)
    await openDocuments()
    expect(screen.getByText('Project Breakdown.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Agreement.pdf')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('photos stay visible regardless of team access', async () => {
    const photos = [
      file({ id: 'p1', name: 'Site progress.jpg', category: 'work_photo', mime_type: 'image/jpeg', uploaded_by: 'admin-1', owner_id: 'admin-1' }),
      file({ id: 'p2', name: 'Vanity mockup.png', mime_type: 'image/png', uploaded_by: 'admin-1', owner_id: 'admin-1' }),
      file({ id: 'p3', name: 'Inspiration.webp', category: 'work_photo', mime_type: 'image/webp', uploaded_by: 'client-1', owner_id: 'client-1' }),
      file({ id: 'p4', name: 'Signed contract.jpg', category: 'contract', mime_type: 'image/jpeg' }),
    ]
    render(<ProjectFilesList documents={[...photos, documentB]} viewer={EMPLOYEE} />)
    expect(screen.getByText('3 project photos')).toBeInTheDocument()
    expect(screen.getByText('No project documents yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'View Photos ▼' }))
    for (const name of ['Site progress.jpg', 'Vanity mockup.png', 'Inspiration.webp']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(screen.queryByText('Signed contract.jpg')).not.toBeInTheDocument()
  })

  it('an employee can still remove a photo they took themselves', async () => {
    const own = file({ id: 'p9', name: 'My photo.jpg', category: 'work_photo', mime_type: 'image/jpeg', owner_id: EMPLOYEE.id, uploaded_by: EMPLOYEE.id })
    render(<ProjectFilesList documents={[own]} viewer={EMPLOYEE} />)
    await userEvent.click(screen.getByRole('button', { name: 'View Photos ▼' }))
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })
})

describe('ProjectFilesList — management', () => {
  it('renders both documents with visibility controls and Remove', async () => {
    render(<ProjectFilesList documents={[documentA, documentB]} viewer={ADMIN} />)
    expect(screen.getByText('2 project documents')).toBeInTheDocument()
    await openDocuments()
    expect(screen.getByText('Project Breakdown.pdf')).toBeInTheDocument()
    expect(screen.getByText('Agreement.pdf')).toBeInTheDocument()
    expect(screen.getAllByRole('switch', { name: 'Visible to Project Team' })).toHaveLength(2)
    expect(screen.getByText('Visibility: Management, Client & Project Team')).toBeInTheDocument()
    expect(screen.getByText('Visibility: Management & Client')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(2)
  })

  it('project managers get the same management view', async () => {
    render(<ProjectFilesList documents={[documentA, documentB]} viewer={{ id: 'pm-1', role: 'project_manager' }} />)
    await openDocuments()
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)
  })
})

describe('ProjectFilesList — no profile yet', () => {
  it('fails closed and renders no documents', () => {
    render(<ProjectFilesList documents={[documentA, documentB]} viewer={null} />)
    expect(screen.getByText('No project documents yet')).toBeInTheDocument()
  })
})
