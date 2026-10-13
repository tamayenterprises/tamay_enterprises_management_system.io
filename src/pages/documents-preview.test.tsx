import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DocumentRecord } from '@/types/database'
import { DocumentsPage } from './documents'

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'u1', role: 'employee', organization_id: 'org' } }),
}))
vi.mock('@/features/data/hooks', () => ({
  useProjects: () => ({ data: [] }),
  useDocuments: () => ({
    data: [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `d${n}`,
      name: `File ${n}.pdf`,
      category: 'project_file',
      mime_type: 'application/pdf',
      owner_id: 'u1',
      uploaded_by: 'u1',
      project_id: null,
      team_visible: true,
    })) as DocumentRecord[],
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

describe('Documents list', () => {
  it('shows two documents, then three more at a time', async () => {
    const user = userEvent.setup()
    render(<DocumentsPage />)

    expect(screen.getByText('File 1.pdf')).toBeInTheDocument()
    expect(screen.getByText('File 2.pdf')).toBeInTheDocument()
    expect(screen.queryByText('File 3.pdf')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 3 more/i }))
    expect(screen.getByText('File 5.pdf')).toBeInTheDocument()
    expect(screen.queryByText('File 6.pdf')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 1 more/i }))
    expect(screen.getByText('File 6.pdf')).toBeInTheDocument()
  })
})
