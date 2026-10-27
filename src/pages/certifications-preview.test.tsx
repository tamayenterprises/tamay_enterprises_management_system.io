import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Certification } from '@/types/database'
import { CertificationsPage } from './certifications'

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'u1', role: 'employee', organization_id: 'org' } }),
}))
vi.mock('@/features/data/hooks', () => ({
  useCertifications: () => ({
    data: [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `c${n}`,
      name: `Cert ${n}`,
      certification_type: 'OSHA',
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
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
  }),
  useUploadDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
    const user = userEvent.setup()
    render(<CertificationsPage />)

    expect(screen.getByRole('heading', { name: 'Uploaded by Tamay' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your certifications' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload document' })).toBeInTheDocument()

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
})
