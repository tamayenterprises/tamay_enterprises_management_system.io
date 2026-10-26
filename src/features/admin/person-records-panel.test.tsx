import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PersonRecordsPanel } from './person-records-panel'

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'admin-1', role: 'admin', organization_id: 'org' } }),
}))

vi.mock('@/features/data/hooks', () => ({
  useCertifications: () => ({
    data: [
      {
        id: 'cert-1',
        name: 'ITin number',
        certification_type: 'Other',
        status: 'missing',
        expiration_date: null,
        document_url: 'path/itin.jpg',
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useDocuments: () => ({
    data: [
      {
        id: 'doc-proof',
        name: 'ITin number proof - itin.jpg',
        category: 'certification',
        created_at: '2026-10-15T00:00:00Z',
        owner_id: 'person-1',
        uploaded_by: 'person-1',
        project_id: null,
        mime_type: 'image/jpeg',
        team_visible: false,
      },
      {
        id: 'doc-photo',
        name: 'site.jpg',
        category: 'work_photo',
        created_at: '2026-10-15T00:00:00Z',
        owner_id: 'person-1',
        uploaded_by: 'person-1',
        project_id: null,
        mime_type: 'image/jpeg',
        team_visible: true,
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCertification: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  createCertificationProofUrl: vi.fn(),
  viewDocumentFile: vi.fn(),
}))

describe('PersonRecordsPanel', () => {
  it('shows an Upload button for admin', () => {
    render(<PersonRecordsPanel profileId="person-1" personLabel="Santiago" />)
    expect(screen.getAllByRole('button', { name: 'Upload' }).length).toBeGreaterThan(0)
  })

  it('lets admin type a document name instead of picking a type', async () => {
    const user = userEvent.setup()
    render(<PersonRecordsPanel profileId="person-1" personLabel="Santiago" />)
    await user.click(screen.getAllByRole('button', { name: 'Upload' })[0]!)
    expect(screen.getByLabelText('Document name')).toBeInTheDocument()
    expect(screen.queryByLabelText('Document type')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/W-2/)).toBeInTheDocument()
  })

  it('keeps certification proofs out of the Documents list', async () => {
    const user = userEvent.setup()
    render(<PersonRecordsPanel profileId="person-1" personLabel="Santiago" />)

    await user.click(screen.getByRole('button', { name: 'View files' }))

    expect(screen.getByText('Certifications (1)')).toBeInTheDocument()
    expect(screen.getByText('ITin number')).toBeInTheDocument()
    expect(screen.getByText('Documents (1)')).toBeInTheDocument()
    expect(screen.getByText('site.jpg')).toBeInTheDocument()
    expect(screen.queryByText('ITin number proof - itin.jpg')).not.toBeInTheDocument()
    expect(screen.queryByText('Certification · Oct 15, 2026')).not.toBeInTheDocument()
  })
})
