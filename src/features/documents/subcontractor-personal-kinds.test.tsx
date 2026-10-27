import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { DocumentRecord } from '@/types/database'
import { DocumentsLibrary } from './documents-library'

const auth = vi.hoisted(() => ({ role: 'subcontractor' as string }))

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'u1', role: auth.role, organization_id: 'org' } }),
}))
vi.mock('@/features/data/hooks', () => ({
  useProjects: () => ({ data: [] }),
  useDocuments: () => ({
    data: [
      {
        id: 'w9',
        name: 'w9.pdf',
        category: 'identification',
        kind_label: 'W-9',
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
  useReviewDocumentDelete: () => ({ mutateAsync: vi.fn(), isPending: false }),
  viewDocumentFile: vi.fn(),
  downloadDocumentFile: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderLibrary() {
  return render(
    <MemoryRouter>
      <DocumentsLibrary variant="personal" uploader="self" />
    </MemoryRouter>,
  )
}

describe('subcontractor personal document categories', () => {
  it('lists business document types for subcontractors', () => {
    auth.role = 'subcontractor'
    renderLibrary()
    const select = screen.getByRole('combobox', { name: 'Category' })
    expect(select).toHaveDisplayValue('All categories')
    expect(screen.getByRole('option', { name: 'W-9' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'EIN/ITN' })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Business Info(Phone #, Address, email)' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Business Registration' })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Certificate of General Liability Insurance' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Workers Compensation Certificate' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Commercial Auto Insurance' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Certification' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Tamay Enterprises MUST BE listed as a Certification Holder'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Files you uploaded yourself — W-2s, licenses, and other personal paperwork.'),
    ).not.toBeInTheDocument()
  })

  it('keeps generic categories for employees', () => {
    auth.role = 'employee'
    renderLibrary()
    expect(screen.getByRole('option', { name: 'Certification' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Urgent' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Commercial Auto Insurance' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Files you uploaded yourself — W-2s, licenses, and other personal paperwork.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Tamay Enterprises MUST BE listed as a Certification Holder'),
    ).not.toBeInTheDocument()
  })
})
