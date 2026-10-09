import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canManageProjectCover, isProjectCoverEligible } from '@/lib/document-visibility'
import type { DocumentRecord, Project } from '@/types/database'
import { ProjectCoverPhoto } from './project-cover-photo'

const setCover = vi.fn()
const uploadCover = vi.fn()

vi.mock('@/features/projects/project-cover-hooks', () => ({
  useSetProjectCover: () => ({ mutateAsync: setCover, isPending: false }),
  useUploadProjectCover: () => ({ upload: uploadCover, isPending: false }),
}))
vi.mock('@/features/projects/my-projects-hooks', () => ({
  useProjectCoverUrl: () => ({ data: null }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function doc(overrides: Partial<DocumentRecord>): DocumentRecord {
  return {
    id: 'x',
    organization_id: 'org',
    project_id: 'p1',
    category: 'work_photo',
    mime_type: 'image/jpeg',
    kind_label: 'Progress',
    created_at: '2026-10-01T10:00:00Z',
    team_visible: false,
    ...overrides,
  } as DocumentRecord
}

const kitchen = doc({ id: 'kitchen', name: 'kitchen.jpg', created_at: '2026-10-01T10:00:00Z' })
const bath = doc({ id: 'bath', name: 'bath.jpg', created_at: '2026-10-03T10:00:00Z' })
const receipt = doc({ id: 'receipt', name: 'IMG_2041.jpg', kind_label: 'Receipt', created_at: '2026-10-05T10:00:00Z' })
const breakdown = doc({ id: 'breakdown', name: 'breakdown.png', category: 'project_file', mime_type: 'image/png', kind_label: 'Project Breakdown' })
const contractScan = doc({ id: 'contract', name: 'contract.jpg', category: 'contract', kind_label: null })
const idScan = doc({ id: 'id', name: 'license.jpg', category: 'identification', kind_label: null })
const pdf = doc({ id: 'pdf', name: 'estimate.pdf', category: 'project_file', mime_type: 'application/pdf', kind_label: null })
const documents = [kitchen, bath, receipt, breakdown, contractScan, idScan, pdf]

function project(cover: string | null = null) {
  return { id: 'p1', name: 'Apartment Renovation (Philip & Bona)', cover_photo_document_id: cover } as Project
}

async function openPicker(label: 'Choose Cover Photo' | 'Change Cover Photo') {
  await userEvent.click(screen.getByRole('button', { name: label }))
  return screen.getByRole('list', { name: 'Eligible project photos' })
}

beforeEach(() => {
  setCover.mockReset().mockResolvedValue(undefined)
  uploadCover.mockReset().mockResolvedValue(undefined)
})

describe('ProjectCoverPhoto (management)', () => {
  it('without an explicit cover: "Using automatic project photo" and Choose Cover Photo', () => {
    render(<ProjectCoverPhoto project={project()} documents={documents} />)
    const row = screen.getByTestId('project-cover-photo')
    expect(within(row).getByText('PROJECT COVER PHOTO')).toBeInTheDocument()
    expect(within(row).getByText(/Using automatic project photo/)).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Choose Cover Photo' })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Use Automatic Cover' })).not.toBeInTheDocument()
  })

  it('with an explicit cover: preview, Change Cover Photo and Use Automatic Cover', () => {
    render(<ProjectCoverPhoto project={project('kitchen')} documents={documents} />)
    const row = screen.getByTestId('project-cover-photo')
    expect(within(row).getByText('Chosen by management')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Change Cover Photo' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Use Automatic Cover' })).toBeInTheDocument()
  })

  it('CASE 5: the selector lists only eligible project photos, never receipts or documents', async () => {
    render(<ProjectCoverPhoto project={project()} documents={documents} />)
    const list = await openPicker('Choose Cover Photo')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(list).getAllByRole('button', { name: 'Set as Project Cover' })).toHaveLength(2)
    expect(within(list).queryByText(/Receipt/)).not.toBeInTheDocument()
    expect(within(list).queryByText(/Project Breakdown/)).not.toBeInTheDocument()
  })

  it('Set as Project Cover saves that photo id; the current cover is marked ★ Project Cover', async () => {
    render(<ProjectCoverPhoto project={project('kitchen')} documents={documents} />)
    const list = await openPicker('Change Cover Photo')
    const [newest, current] = within(list).getAllByRole('listitem')
    expect(within(current).getByText('Project Cover')).toBeInTheDocument()
    expect(within(current).queryByRole('button', { name: 'Set as Project Cover' })).not.toBeInTheDocument()
    await userEvent.click(within(newest).getByRole('button', { name: 'Set as Project Cover' }))
    expect(setCover).toHaveBeenCalledWith('bath')
  })

  it('CASE 4: Use Automatic Cover clears the explicit cover (null) without deleting anything', async () => {
    render(<ProjectCoverPhoto project={project('kitchen')} documents={documents} />)
    await userEvent.click(within(screen.getByTestId('project-cover-photo')).getByRole('button', { name: 'Use Automatic Cover' }))
    expect(setCover).toHaveBeenCalledWith(null)
  })

  it('a stale choice (photo removed) says so and falls back to automatic', () => {
    render(<ProjectCoverPhoto project={project('deleted-photo')} documents={documents} />)
    expect(screen.getByText(/no longer available\. Using automatic project photo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose Cover Photo' })).toBeInTheDocument()
  })

  it('no eligible photos: Tamay fallback message and an upload prompt', async () => {
    render(<ProjectCoverPhoto project={project()} documents={[receipt, breakdown, pdf]} />)
    expect(screen.getByText(/No eligible photos yet, so the Tamay logo is shown/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Choose Cover Photo' }))
    expect(screen.getByText('No project photos yet. Upload a cover photo to get started.')).toBeInTheDocument()
    expect(screen.getByLabelText('Upload Cover Photo')).toBeInTheDocument()
  })

  it('Upload Cover Photo uploads the image through the project photo path and sets it as cover', async () => {
    render(<ProjectCoverPhoto project={project()} documents={documents} />)
    await userEvent.click(screen.getByRole('button', { name: 'Choose Cover Photo' }))
    const image = new File(['x'], 'front.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText('Upload Cover Photo'), image)
    expect(uploadCover).toHaveBeenCalledWith(image)
  })

  it('Upload Cover Photo refuses non-image files', async () => {
    render(<ProjectCoverPhoto project={project()} documents={documents} />)
    await userEvent.click(screen.getByRole('button', { name: 'Choose Cover Photo' }))
    const input = screen.getByLabelText('Upload Cover Photo')
    fireEvent.change(input, { target: { files: [new File(['x'], 'estimate.pdf', { type: 'application/pdf' })] } })
    await Promise.resolve()
    expect(uploadCover).not.toHaveBeenCalled()
  })
})

describe('cover permissions and eligibility helpers', () => {
  it('CASE 7/8: only approved management roles get cover controls', () => {
    expect(canManageProjectCover({ id: 'a', role: 'admin' })).toBe(true)
    expect(canManageProjectCover({ id: 'b', role: 'project_manager' })).toBe(true)
    expect(canManageProjectCover({ id: 'c', role: 'employee' })).toBe(false)
    expect(canManageProjectCover({ id: 'd', role: 'subcontractor' })).toBe(false)
    expect(canManageProjectCover({ id: 'e', role: 'client' })).toBe(false)
    expect(canManageProjectCover(null)).toBe(false)
  })

  it('CASE 5: receipts, formal documents, private categories and non-images are not eligible', () => {
    expect(isProjectCoverEligible(kitchen)).toBe(true)
    expect(isProjectCoverEligible(doc({ category: 'project_file', kind_label: 'Approved Design' }))).toBe(true)
    for (const bad of [receipt, breakdown, contractScan, idScan, pdf]) {
      expect(isProjectCoverEligible(bad)).toBe(false)
    }
    expect(isProjectCoverEligible(doc({ category: 'insurance' }))).toBe(false)
    expect(isProjectCoverEligible(doc({ category: 'certification' }))).toBe(false)
    expect(isProjectCoverEligible(doc({ category: 'license' }))).toBe(false)
  })
})
