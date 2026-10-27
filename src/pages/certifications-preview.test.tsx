import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Certification, DocumentRecord } from '@/types/database'
import { CertificationsPage } from './certifications'

const auth = vi.hoisted(() => ({ role: 'employee' as string }))

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'u1', role: auth.role, organization_id: 'org' } }),
}))
vi.mock('@/features/data/hooks', () => ({
  useCertifications: () => ({
    data: [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `c${n}`,
      name: `Cert ${n}`,
      certification_type: n <= 3 ? 'OSHA' : 'CPR',
      status: 'valid',
      profile_id: 'u1',
      created_by: n <= 3 ? 'admin' : 'u1',
      document_url: 'proof.pdf',
    })) as Certification[],
    isLoading: false,
    isError: false,
  }),
  useProfiles: () => ({ data: [] }),
  useCreateCertification: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCertification: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCertification: () => ({ mutateAsync: vi.fn(), isPending: false }),
  createCertificationProofUrl: vi.fn(),
  useProjects: () => ({ data: [] }),
  useDocuments: () => ({
    data: [
      {
        id: 'w2',
        name: 'w-2',
        category: 'miscellaneous',
        project_id: null,
        owner_id: 'u1',
        uploaded_by: 'admin',
        mime_type: 'image/webp',
        uploader: { first_name: 'Carlos', last_name: 'Tamay' },
      },
      {
        id: 'own',
        name: 'My file.pdf',
        category: 'project_file',
        project_id: null,
        owner_id: 'u1',
        uploaded_by: 'u1',
        mime_type: 'application/pdf',
      },
    ] as DocumentRecord[],
    isLoading: false,
    isError: false,
    isFetching: false,
  }),
  useUploadDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePendingDocumentDeleteRequests: () => ({ data: [] }),
  useRequestDocumentDelete: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRequestCertificationDelete: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReviewDocumentDelete: () => ({ mutateAsync: vi.fn(), isPending: false }),
  viewDocumentFile: vi.fn(),
  downloadDocumentFile: vi.fn(),
}))
vi.mock('@/lib/uploads', async () => {
  const actual = await vi.importActual<typeof import('@/lib/uploads')>('@/lib/uploads')
  return { ...actual, confirmAction: () => true }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('Certifications list', () => {
  it('separates Tamay uploads from the worker’s own certifications', async () => {
    auth.role = 'employee'
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CertificationsPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Uploaded by Tamay' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your certifications' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Personal Documents' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload Signed Documents' })).toBeInTheDocument()
    expect(screen.getByText('w-2')).toBeInTheDocument()
    expect(screen.getByText('My file.pdf')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Delete' }).length).toBeGreaterThan(1)
    expect(screen.getByText(/Carlos Tamay/)).toBeInTheDocument()

    expect(screen.getByText('Cert 1')).toBeInTheDocument()
    expect(screen.getByText('Cert 2')).toBeInTheDocument()
    expect(screen.queryByText('Cert 3')).not.toBeInTheDocument()
    expect(screen.getByText('Cert 4')).toBeInTheDocument()
    expect(screen.getByText('Cert 5')).toBeInTheDocument()
    expect(screen.queryByText('Cert 6')).not.toBeInTheDocument()

    const moreButtons = screen.getAllByRole('button', { name: /See 1 more/i })
    await user.click(moreButtons[0]!)
    expect(screen.getByText('Cert 3')).toBeInTheDocument()
    expect(screen.queryByText('Cert 6')).not.toBeInTheDocument()
  })

  it('gives project managers the same worker certifications layout', () => {
    auth.role = 'project_manager'
    render(
      <MemoryRouter>
        <CertificationsPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Uploaded by Tamay' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your certifications' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Personal Documents' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload Signed Documents' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeInTheDocument()
    expect(screen.getByText('w-2')).toBeInTheDocument()
    expect(screen.getByText('My file.pdf')).toBeInTheDocument()
  })

  it('limits the list to one certification type, and All types shows everything', async () => {
    auth.role = 'employee'
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CertificationsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('w-2')).toBeInTheDocument()
    expect(screen.getByText('Cert 1')).toBeInTheDocument()
    expect(screen.getByText('Cert 4')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'CPR')

    expect(screen.queryByText('w-2')).not.toBeInTheDocument()
    expect(screen.queryByText('Cert 1')).not.toBeInTheDocument()
    expect(screen.getByText('Cert 4')).toBeInTheDocument()
    expect(screen.getByText('Cert 5')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'all')

    expect(screen.getByText('w-2')).toBeInTheDocument()
    expect(screen.getByText('Cert 1')).toBeInTheDocument()
    expect(screen.getByText('Cert 4')).toBeInTheDocument()
  })
})
