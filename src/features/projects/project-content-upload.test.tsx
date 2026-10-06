import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectContentUploadDialog } from './project-content-upload'

let role = 'employee'
const idle = { isPending: false, mutateAsync: vi.fn() }

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'u1', role, organization_id: 'org' } }),
}))
vi.mock('@/features/data/hooks', () => ({
  useUploadDocument: () => idle,
  usePostProjectPhotosToThread: () => idle,
  usePostProjectDocumentsToThread: () => idle,
}))

function renderDialog() {
  render(<ProjectContentUploadDialog projectId="p1" open onOpenChange={() => {}} />)
}

beforeEach(() => {
  role = 'employee'
})

describe('Project Detail upload choices', () => {
  it.each(['employee', 'subcontractor'])('%s gets Photo only — no Document option', (r) => {
    role = r
    renderDialog()
    expect(screen.getByRole('button', { name: /^Photo/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Document/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Project documents are uploaded by management/)).toBeInTheDocument()
  })

  it.each(['admin', 'project_manager'])('%s gets both Photo and Document', (r) => {
    role = r
    renderDialog()
    expect(screen.getByRole('button', { name: /^Photo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Document/ })).toBeInTheDocument()
    expect(screen.queryByText(/Project documents are uploaded by management/)).not.toBeInTheDocument()
  })
})
