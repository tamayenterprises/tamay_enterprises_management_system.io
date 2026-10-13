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
}))
vi.mock('@/lib/uploads', async () => {
  const actual = await vi.importActual<typeof import('@/lib/uploads')>('@/lib/uploads')
  return { ...actual, confirmAction: () => true }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('Certifications list', () => {
  it('shows two certifications, then three more at a time', async () => {
    const user = userEvent.setup()
    render(<CertificationsPage />)

    expect(screen.getByText('Cert 1')).toBeInTheDocument()
    expect(screen.getByText('Cert 2')).toBeInTheDocument()
    expect(screen.queryByText('Cert 3')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 3 more/i }))
    expect(screen.getByText('Cert 5')).toBeInTheDocument()
    expect(screen.queryByText('Cert 6')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 1 more/i }))
    expect(screen.getByText('Cert 6')).toBeInTheDocument()
  })
})
