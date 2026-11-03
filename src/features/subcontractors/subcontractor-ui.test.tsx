import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentRecord, SubcontractorReadiness, SubcontractorRequirementItem } from '@/types/database'
import { RequirementChecklist } from './requirement-checklist'
import { WorkOrderCard } from './work-order-card'
import { SubcontractorHome } from './subcontractor-home'

const state = vi.hoisted(() => ({
  items: [] as SubcontractorRequirementItem[],
  documents: [] as DocumentRecord[],
  readiness: null as SubcontractorReadiness | null,
  installed: true,
  submit: vi.fn(),
  review: vi.fn(),
  setRequired: vi.fn(),
  updateWorkOrder: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('sonner', () => ({ toast }))
vi.mock('@/features/data/documents', () => ({ viewDocumentFile: vi.fn(), downloadDocumentFile: vi.fn(), useDeleteDocument: () => ({}) }))
vi.mock('@/features/dashboard/employee-dashboard', () => ({ EmployeeDashboard: () => <p>Employee dashboard</p> }))
vi.mock('@/features/subcontractors/subcontractor-dashboard', () => ({
  SubcontractorDashboard: ({ readiness }: { readiness: SubcontractorReadiness }) => <p>Subcontractor dashboard {readiness.status}</p>,
}))
vi.mock('@/features/subcontractors/hooks', () => ({
  useRequirementItems: () => ({ data: state.items, isLoading: false, isError: false }),
  useRequirementDocuments: () => ({ data: state.documents }),
  useSubmitRequirementDocument: () => ({ mutateAsync: state.submit, isPending: false }),
  useReviewRequirementDocument: () => ({ mutateAsync: state.review, isPending: false }),
  useSetRequirementRequired: () => ({ mutateAsync: state.setRequired, isPending: false }),
  useAddCustomRequirement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveCustomRequirement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateWorkOrder: () => ({ mutateAsync: state.updateWorkOrder, isPending: false }),
  useMyReadiness: () => ({ readiness: state.readiness, isLoading: false, installed: state.installed, isError: false }),
}))

function item(key: SubcontractorRequirementItem['requirement_key'], status: SubcontractorRequirementItem['status'], overrides: Partial<SubcontractorRequirementItem> = {}) {
  return {
    requirement_key: key,
    requirement_id: null,
    label: key,
    required: true,
    needs_expiration: false,
    expiration_optional: false,
    counts_toward_ready: key !== 'payment_ach',
    sort_order: 1,
    status,
    document_id: null,
    document_name: null,
    kind_label: null,
    submitted_at: null,
    expires_on: null,
    review_note: null,
    reviewed_at: null,
    ...overrides,
  } satisfies SubcontractorRequirementItem
}

const submittedDoc = {
  id: 'doc-wc',
  organization_id: 'org',
  owner_id: 'sub-1',
  project_id: null,
  uploaded_by: 'sub-1',
  name: "Workers' Compensation - wc.pdf",
  category: 'insurance',
  storage_path: 'sub-1/requirements/wc.pdf',
  mime_type: 'application/pdf',
  file_size: 10,
  requirement_key: 'workers_comp',
  review_status: 'submitted',
  created_at: '2026-10-28T12:00:00Z',
  updated_at: '2026-10-28T12:00:00Z',
} as DocumentRecord

beforeEach(() => {
  vi.clearAllMocks()
  state.items = []
  state.documents = []
  state.readiness = null
  state.installed = true
})

describe('RequirementChecklist (subcontractor)', () => {
  it('groups required, optional and payment items with the right actions', () => {
    state.items = [
      item('w9', 'approved', { label: 'W-9' }),
      item('general_liability', 'rejected', { label: 'General Liability Insurance', review_note: 'Tamay must be certificate holder' }),
      item('workers_comp', 'missing', { label: "Workers' Compensation", needs_expiration: true }),
      item('commercial_auto', 'missing', { label: 'Commercial Auto Insurance', required: false }),
      item('payment_ach', 'missing', { label: 'Payment / ACH Information', required: false, counts_toward_ready: false }),
    ]
    render(<RequirementChecklist profileId="sub-1" mode="self" />)

    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(screen.getByText('If it applies to your work')).toBeInTheDocument()
    expect(screen.getByText('Needed to pay you. Only Tamay Admin can see it. It does not affect Ready to Work.')).toBeInTheDocument()

    const gl = screen.getByTestId('requirement-general_liability')
    expect(within(gl).getByText('Rejected')).toBeInTheDocument()
    expect(within(gl).getByText('Reason: Tamay must be certificate holder')).toBeInTheDocument()
    expect(within(gl).getByRole('button', { name: 'Upload Replacement' })).toBeInTheDocument()
    expect(within(screen.getByTestId('requirement-workers_comp')).getByRole('button', { name: 'Upload' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('requires an expiration date before submitting insurance', async () => {
    state.items = [item('workers_comp', 'missing', { label: "Workers' Compensation", needs_expiration: true })]
    render(<RequirementChecklist profileId="sub-1" mode="self" />)
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Expiration date')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit for review' }))
    expect(toast.error).toHaveBeenCalledWith('Choose a file to upload.')
    expect(state.submit).not.toHaveBeenCalled()
  })

  it('Trade License is an accordion where the subcontractor picks the license type', async () => {
    state.items = [item('trade_license', 'missing', { label: 'Trade License', required: false, needs_expiration: true })]
    render(<RequirementChecklist profileId="sub-1" mode="self" />)
    expect(screen.getByText('Choose your license type (Electrical, Plumbing, HVAC…) and upload it.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add license' }))
    const dialog = await screen.findByRole('dialog')
    const select = within(dialog).getByLabelText('License type')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose license type',
      'Electrical',
      'Plumbing',
      'HVAC',
      'Home Improvement Contractor (HIC)',
      'General Contractor',
      'Other',
    ])
  })
})

describe('RequirementChecklist (management)', () => {
  it('shows Approve / Reject on a submitted document and a Required toggle', async () => {
    state.items = [
      item('workers_comp', 'submitted', { label: "Workers' Compensation", document_id: 'doc-wc', submitted_at: '2026-10-28T12:00:00Z' }),
    ]
    state.documents = [submittedDoc]
    state.review.mockResolvedValue('approved')
    render(<RequirementChecklist profileId="sub-1" mode="management" />)

    const row = screen.getByTestId('requirement-workers_comp')
    expect(within(row).getByRole('button', { name: 'View' })).toBeInTheDocument()
    expect(within(row).getByLabelText('Required for this subcontractor')).toBeChecked()
    await userEvent.click(within(row).getByRole('button', { name: 'Approve' }))
    expect(state.review).toHaveBeenCalledWith({ documentId: 'doc-wc', approve: true, note: null })
    expect(screen.getByText('Request another document')).toBeInTheDocument()
  })

  it('rejects with an optional reason', async () => {
    state.items = [item('workers_comp', 'submitted', { label: "Workers' Compensation", document_id: 'doc-wc' })]
    state.documents = [submittedDoc]
    state.review.mockResolvedValue('rejected')
    render(<RequirementChecklist profileId="sub-1" mode="management" />)
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Reason (optional)'), 'Updated certificate required')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))
    expect(state.review).toHaveBeenCalledWith({ documentId: 'doc-wc', approve: false, note: 'Updated certificate required' })
  })
})

describe('WorkOrderCard', () => {
  const workOrder = {
    id: 'wo-1',
    project_id: 'p1',
    profile_id: 'sub-1',
    assigned_by: null,
    assigned_at: '2026-11-01T12:00:00Z',
    removed_at: null,
    is_active: true,
    work_status: 'assigned' as const,
    work_scope: 'Rough-in plumbing',
    project: { id: 'p1', name: 'Kim Bathroom', location: 'New Haven, CT', job_site_address: null, status: 'in_progress', start_date: '2026-11-10', deadline: '2026-11-21', archived_at: null },
  }

  const renderCard = (props: Partial<Parameters<typeof WorkOrderCard>[0]>) =>
    render(
      <MemoryRouter>
        <WorkOrderCard workOrder={workOrder} readyToWork {...props} />
      </MemoryRouter>,
    )

  it('Ready to Start shows Start Work and starts the work order', async () => {
    state.updateWorkOrder.mockResolvedValue('in_progress')
    renderCard({})
    expect(screen.getByText('Ready to Start')).toBeInTheDocument()
    expect(screen.getByText('Scope: Rough-in plumbing')).toBeInTheDocument()
    expect(screen.getByText('Starts Nov 10, 2026 · Target Nov 21, 2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Start Work/ }))
    expect(state.updateWorkOrder).toHaveBeenCalledWith({ assignmentId: 'wo-1', action: 'start', note: null })
  })

  it('not Ready to Work: Assigned, no Start Work, setup warning', () => {
    renderCard({ readyToWork: false })
    expect(screen.getByText('Assigned')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start Work/ })).not.toBeInTheDocument()
    expect(screen.getByText('Complete your setup before starting this work order.')).toBeInTheDocument()
  })

  it('In Progress offers Complete Work with an optional note', async () => {
    state.updateWorkOrder.mockResolvedValue('completed')
    renderCard({ workOrder: { ...workOrder, work_status: 'in_progress' } })
    await userEvent.click(screen.getByRole('button', { name: /Complete Work/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Completion note (optional)'), 'All done')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Complete Work' }))
    expect(state.updateWorkOrder).toHaveBeenCalledWith({ assignmentId: 'wo-1', action: 'complete', note: 'All done' })
  })
})

describe('SubcontractorHome', () => {
  const renderHome = () =>
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<SubcontractorHome />} />
          <Route path="/setup" element={<p>Setup page</p>} />
        </Routes>
      </MemoryRouter>,
    )
  const readiness = (status: SubcontractorReadiness['status']): SubcontractorReadiness => ({
    profile_id: 'sub-1',
    status,
    required_count: 5,
    approved_count: 3,
    missing_labels: [],
    attention_labels: [],
    pending_labels: [],
    payment_status: null,
  })

  it('approved but not Ready to Work goes to setup', () => {
    state.readiness = readiness('setup_required')
    renderHome()
    expect(screen.getByText('Setup page')).toBeInTheDocument()
  })

  it('pending review also stays on setup', () => {
    state.readiness = readiness('pending_review')
    renderHome()
    expect(screen.getByText('Setup page')).toBeInTheDocument()
  })

  it('Ready to Work gets the subcontractor dashboard, not the employee one', () => {
    state.readiness = readiness('ready')
    renderHome()
    expect(screen.getByText('Subcontractor dashboard ready')).toBeInTheDocument()
    expect(screen.queryByText('Employee dashboard')).not.toBeInTheDocument()
  })

  it('before the migration is installed, keeps the previous dashboard', () => {
    state.installed = false
    renderHome()
    expect(screen.getByText('Employee dashboard')).toBeInTheDocument()
  })
})
