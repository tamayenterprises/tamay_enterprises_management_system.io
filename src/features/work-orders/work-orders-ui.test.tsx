import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkOrderDetailPage } from '@/pages/work-order-detail'
import type {
  SubcontractorReadiness,
  WorkOrderFileRecord,
  WorkOrderOfferRecord,
  WorkOrderRecord,
  WorkOrderUpdateRecord,
} from '@/types/database'
import { MyWorkOrderGroups } from './my-work-order-groups'
import { ProjectWorkOrdersSection } from './project-work-orders-section'

const state = vi.hoisted(() => ({
  profile: { id: 'sub-1', role: 'subcontractor' } as { id: string; role: string },
  workOrder: null as WorkOrderRecord | null,
  workOrders: [] as WorkOrderRecord[],
  updates: [] as WorkOrderUpdateRecord[],
  files: [] as WorkOrderFileRecord[],
  offers: [] as WorkOrderOfferRecord[],
  readiness: null as SubcontractorReadiness | null,
  updateStatus: vi.fn(),
  respond: vi.fn(),
  sendOffers: vi.fn(),
  review: vi.fn(),
  addUpdate: vi.fn(),
  save: vi.fn(),
  confirm: vi.fn(() => true),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('sonner', () => ({ toast }))
vi.mock('@/features/auth/auth-hooks', () => ({ useAuth: () => ({ profile: state.profile }) }))
vi.mock('@/lib/uploads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/uploads')>()),
  confirmAction: state.confirm,
}))
vi.mock('@/features/subcontractors/hooks', () => ({
  useMyReadiness: () => ({ readiness: state.readiness, installed: true, isLoading: false, isError: false }),
  useSubcontractorReadiness: () => ({
    data: new Map([['sub-2', { profile_id: 'sub-2', status: 'setup_required', missing_labels: ['W-9'], attention_labels: [], pending_labels: [] }]]),
  }),
}))
vi.mock('@/features/data/hooks', () => ({
  useProfiles: () => ({
    data: [
      { id: 'sub-1', first_name: 'Ana', last_name: 'Ruiz', company_name: 'Ruiz Plumbing', trade_specialization: 'Plumbing', approval_status: 'approved', is_active: true, archived_at: null },
      { id: 'sub-2', first_name: 'Ben', last_name: 'Cole', company_name: null, trade_specialization: 'Plumbing', approval_status: 'approved', is_active: true, archived_at: null },
    ],
  }),
}))
const mutation = (fn: unknown) => ({ mutateAsync: fn, isPending: false })
vi.mock('@/features/work-orders/hooks', () => ({
  useWorkOrder: () => ({ data: state.workOrder, isLoading: false }),
  useProjectWorkOrders: () => ({ data: state.workOrders, isLoading: false }),
  useWorkOrderProjectSummaries: (ids: string[]) => ({
    data: new Map(ids.map((id) => [id, { work_order_id: id, project_id: 'p1', project_name: 'Kim Bathroom', job_address: '12 Elm St, New Haven, CT' }])),
  }),
  useLatestWorkOrderUpdates: () => ({
    data: new Map([['wo-1', { id: 'u1', work_order_id: 'wo-1', completed_today: 'Rough-in done', next_steps: null, issue_question: null, created_at: new Date().toISOString() }]]),
  }),
  useWorkOrderOffers: () => ({ data: state.offers }),
  useWorkOrderUpdates: () => ({ data: state.updates, isLoading: false }),
  useWorkOrderFiles: () => ({ data: state.files, isLoading: false }),
  useWorkOrderPhotoUrls: () => ({ data: new Map() }),
  useUpdateWorkOrderStatus: () => mutation(state.updateStatus),
  useRespondToWorkOrder: () => mutation(state.respond),
  useSendWorkOrderOffers: () => mutation(state.sendOffers),
  useReviewWorkOrderDocument: () => mutation(state.review),
  useSubmitWorkOrderDocument: () => mutation(vi.fn()),
  useAddWorkOrderUpdate: () => mutation(state.addUpdate),
  useSaveWorkOrder: () => mutation(state.save),
  useUploadWorkOrderReferences: () => mutation(vi.fn()),
  useRemoveWorkOrderFile: () => mutation(vi.fn()),
  openWorkOrderFile: vi.fn(() => Promise.resolve()),
}))

const SUB = { id: 'sub-1', first_name: 'Ana', last_name: 'Ruiz', company_name: 'Ruiz Plumbing' } as WorkOrderRecord['subcontractor']

function workOrder(overrides: Partial<WorkOrderRecord> = {}): WorkOrderRecord {
  return {
    id: 'wo-1',
    work_order_number: 1001,
    organization_id: 'org',
    project_id: 'p1',
    subcontractor_id: 'sub-1',
    insurance_required: false,
    certificate_holder: null,
    accepted_by: null,
    acceptance_statement: null,
    trade: 'Plumbing',
    title: 'Rough-in plumbing, 2nd floor bath',
    scope_of_work: 'Supply and drain lines for vanity and shower',
    measurements_and_specs: 'Vanity 36in, shower valve Moen T2903',
    important_requirements: 'Photos before covering concealed work',
    agreed_price: 4500,
    start_date: '2026-11-10',
    target_completion_date: '2026-11-21',
    payment_notes: null,
    warranty_applies: true,
    warranty_notes: 'Workmanship responsibility for this assigned scope.',
    status: 'assigned',
    accepted_at: null,
    started_at: null,
    completed_at: null,
    closed_at: null,
    created_by: 'pm-1',
    updated_by: 'pm-1',
    created_at: '2026-11-01T12:00:00Z',
    updated_at: '2026-11-01T12:00:00Z',
    subcontractor: SUB,
    ...overrides,
  }
}

function file(overrides: Partial<WorkOrderFileRecord>): WorkOrderFileRecord {
  return {
    id: 'f1', work_order_id: 'wo-1', update_id: null, organization_id: 'org', uploaded_by: 'sub-1', kind: 'subcontractor_document',
    category: 'insurance', review_status: 'submitted', review_note: null, reviewed_by: null, reviewed_at: null,
    name: 'COI.pdf', storage_path: 'wo-1/subcontractor/coi.pdf', mime_type: 'application/pdf', file_size: 10, created_at: '2026-11-03T12:00:00Z',
    ...overrides,
  }
}

function readiness(status: SubcontractorReadiness['status']): SubcontractorReadiness {
  return { profile_id: 'sub-1', status, required_count: 5, approved_count: 5, missing_labels: [], attention_labels: [], pending_labels: [], payment_status: null }
}

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/work-orders/wo-1']}>
      <Routes>
        <Route path="/work-orders/:workOrderId" element={<WorkOrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  state.confirm.mockReturnValue(true)
  state.profile = { id: 'sub-1', role: 'subcontractor' }
  state.workOrder = workOrder()
  state.workOrders = []
  state.updates = []
  state.files = []
  state.offers = []
  state.readiness = readiness('ready')
})

describe('Work order offer (subcontractor)', () => {
  it('shows the offer with everything needed to decide, and Accept / Decline', () => {
    state.workOrder = workOrder({ status: 'offered', subcontractor_id: null, subcontractor: null })
    renderDetail()
    expect(screen.getByText('New Offer')).toBeInTheDocument()
    expect(screen.getByText(/first to accept gets it/)).toBeInTheDocument()
    expect(screen.getByText('Kim Bathroom · 12 Elm St, New Haven, CT')).toBeInTheDocument()
    expect(screen.getByText('$4,500.00')).toBeInTheDocument()
    expect(screen.getByText('Important Job Requirements')).toBeInTheDocument()
    expect(screen.getByText('Contract & Documents')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept Work Order' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
    expect(screen.queryByText('Work Updates')).not.toBeInTheDocument()
    expect(screen.queryByText('Subcontractor Documents')).not.toBeInTheDocument()
  })

  it('accepting is formal: the agreement box must be checked', async () => {
    state.workOrder = workOrder({ status: 'offered', subcontractor_id: null, subcontractor: null })
    state.respond.mockResolvedValue('accepted')
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Accept Work Order' }))
    const dialog = await screen.findByRole('dialog')
    const accept = within(dialog).getByRole('button', { name: 'Accept Work Order' })
    expect(accept).toBeDisabled()
    await userEvent.click(within(dialog).getByRole('checkbox'))
    expect(within(dialog).getByText(/I have read and agree to the scope of work/)).toBeInTheDocument()
    await userEvent.click(accept)
    expect(state.respond).toHaveBeenCalledWith({ workOrderId: 'wo-1', accept: true, agree: true })
  })

  it('declines with an optional reason', async () => {
    state.respond.mockResolvedValue('declined')
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Reason (optional)'), 'Price too low')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Decline Work Order' }))
    expect(state.respond).toHaveBeenCalledWith({ workOrderId: 'wo-1', accept: false, reason: 'Price too low' })
  })

  it('tells the offered subcontractor which Certificate Holder the insurance needs', () => {
    state.workOrder = workOrder({ status: 'offered', subcontractor_id: null, subcontractor: null, insurance_required: true, certificate_holder: 'Kim Family\n12 Elm St, New Haven, CT' })
    renderDetail()
    expect(screen.getByText('Insurance certificate required')).toBeInTheDocument()
    expect(screen.getByText(/Kim Family/)).toBeInTheDocument()
  })
})

describe('Work order (assigned subcontractor)', () => {
  it('accepted: Start Work locked until Ready to Work', () => {
    state.workOrder = workOrder({ status: 'accepted' })
    state.readiness = readiness('action_required')
    renderDetail()
    expect(screen.getByRole('button', { name: 'Start Work' })).toBeDisabled()
    expect(screen.getByText('Complete your setup (documents approved) before starting work.')).toBeInTheDocument()
  })

  it('accepted: Start Work locked until Tamay approves the insurance certificate', async () => {
    state.workOrder = workOrder({ status: 'accepted', insurance_required: true, certificate_holder: 'Kim Family, 12 Elm St' })
    state.files = [file({ review_status: 'submitted' })]
    const { unmount } = renderDetail()
    expect(screen.getByRole('button', { name: 'Start Work' })).toBeDisabled()
    expect(screen.getByText(/Work can start once Tamay approves it/)).toBeInTheDocument()
    expect(within(screen.getByTestId('insurance-requirement')).getByText('Waiting for Tamay review')).toBeInTheDocument()
    expect(screen.getByLabelText('Document type')).toBeInTheDocument()
    unmount()

    state.files = [file({ review_status: 'approved' })]
    state.updateStatus.mockResolvedValue('in_progress')
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Start Work' }))
    expect(state.updateStatus).toHaveBeenCalledWith({ workOrderId: 'wo-1', action: 'start' })
  })

  it('shows the acceptance record', () => {
    state.workOrder = workOrder({ status: 'accepted', accepted_at: '2026-11-05T15:00:00Z', accepted_by: 'sub-1', acceptance_statement: 'I have read and agree to the scope.' })
    renderDetail()
    expect(screen.getByText('Acceptance')).toBeInTheDocument()
    expect(screen.getByText('"I have read and agree to the scope."')).toBeInTheDocument()
  })

  it('in progress: Add Update and Mark Work Completed (with confirmation)', async () => {
    state.workOrder = workOrder({ status: 'in_progress' })
    renderDetail()
    expect(screen.getByText('Add Update')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mark Work Completed' }))
    expect(state.confirm).toHaveBeenCalled()
    expect(state.updateStatus).toHaveBeenCalledWith({ workOrderId: 'wo-1', action: 'complete' })
  })

  it('sends an update with Completed Today / Next / Issue', async () => {
    state.workOrder = workOrder({ status: 'in_progress' })
    state.addUpdate.mockResolvedValue('u-new')
    renderDetail()
    await userEvent.type(screen.getByLabelText('Completed today'), 'Drains set')
    await userEvent.type(screen.getByLabelText('Next'), 'Pressure test')
    await userEvent.type(screen.getByLabelText('Issue / question'), 'Valve location?')
    await userEvent.click(screen.getByRole('button', { name: 'Send update' }))
    expect(state.addUpdate).toHaveBeenCalledWith({ workOrderId: 'wo-1', completedToday: 'Drains set', nextSteps: 'Pressure test', issueQuestion: 'Valve location?', photos: [] })
  })

  it('work completed is read-only for the subcontractor', () => {
    state.workOrder = workOrder({ status: 'work_completed' })
    renderDetail()
    expect(screen.getByText('Work Completed — waiting for Tamay to review.')).toBeInTheDocument()
    for (const name of ['Accept Work Order', 'Decline', 'Start Work', 'Mark Work Completed', 'Send update', 'Close Work Order']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })
})

describe('Work order (management)', () => {
  beforeEach(() => {
    state.profile = { id: 'pm-1', role: 'project_manager' }
  })

  it('offered: shows who it was offered to, decline reasons, and Send to subcontractors', async () => {
    state.workOrder = workOrder({ status: 'offered', subcontractor_id: null, subcontractor: null })
    state.offers = [
      { id: 'o1', work_order_id: 'wo-1', organization_id: 'org', subcontractor_id: 'sub-1', status: 'pending', decline_reason: null, responded_at: null, created_by: 'pm-1', created_at: '2026-11-01', subcontractor: SUB },
      { id: 'o2', work_order_id: 'wo-1', organization_id: 'org', subcontractor_id: 'sub-2', status: 'declined', decline_reason: 'Too cheap', responded_at: '2026-11-02', created_by: 'pm-1', created_at: '2026-11-01', subcontractor: { id: 'sub-2', first_name: 'Ben', last_name: 'Cole', company_name: null } as WorkOrderRecord['subcontractor'] },
    ]
    state.sendOffers.mockResolvedValue(1)
    renderDetail()
    const offers = screen.getByTestId('work-order-offers')
    expect(within(offers).getByText('Waiting for answer')).toBeInTheDocument()
    expect(within(offers).getByText('"Too cheap"')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept Work Order' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Send to subcontractors' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('Ruiz Plumbing')).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByLabelText('Ben Cole'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }))
    expect(state.sendOffers).toHaveBeenCalledWith({ workOrderId: 'wo-1', subcontractorIds: ['sub-2'] })
  })

  it('approves or rejects the insurance certificate', async () => {
    state.workOrder = workOrder({ status: 'accepted', insurance_required: true, certificate_holder: 'Kim Family' })
    state.files = [file({})]
    state.review.mockResolvedValue('rejected')
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await userEvent.type(screen.getByLabelText('Reason (sent to the subcontractor)'), 'Client must be Certificate Holder')
    await userEvent.click(screen.getByRole('button', { name: 'Reject certificate' }))
    expect(state.review).toHaveBeenCalledWith({ file: expect.objectContaining({ id: 'f1' }), approve: false, note: 'Client must be Certificate Holder' })
  })

  it('lists the contract first with its type, plus receipts and permits from the subcontractor', () => {
    state.workOrder = workOrder({ status: 'in_progress' })
    state.files = [
      file({ id: 'r2', kind: 'reference', category: 'photo', review_status: null, name: 'site.jpg', created_at: '2026-11-01T10:00:00Z' }),
      file({ id: 'r1', kind: 'reference', category: 'contract', review_status: null, name: 'Signed contract.pdf', created_at: '2026-11-02T10:00:00Z' }),
      file({ id: 's1', category: 'receipt', review_status: null, name: 'Home Depot.jpg' }),
    ]
    renderDetail()
    const rows = screen.getAllByTestId('work-order-file')
    expect(within(rows[0]!).getByText('Signed contract.pdf')).toBeInTheDocument()
    expect(within(rows[0]!).getByText(/Contract \/ Agreement/)).toBeInTheDocument()
    expect(screen.getByText(/Receipt \/ Invoice/)).toBeInTheDocument()
  })

  it('sees Edit and Close, but no subcontractor actions', async () => {
    state.workOrder = workOrder({ status: 'work_completed' })
    state.updateStatus.mockResolvedValue('closed')
    renderDetail()
    expect(screen.getByText('Subcontractor: Ruiz Plumbing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close Work Order' }))
    expect(state.updateStatus).toHaveBeenCalledWith({ workOrderId: 'wo-1', action: 'close' })
  })
})

describe('Project Detail: Work Orders section', () => {
  it('cards show the subcontractor, or the offers when nobody accepted yet', () => {
    state.profile = { id: 'pm-1', role: 'admin' }
    state.workOrders = [
      workOrder({ status: 'in_progress' }),
      workOrder({ id: 'wo-2', work_order_number: 1002, title: 'Panel upgrade', status: 'offered', subcontractor_id: null, subcontractor: null }),
    ]
    state.offers = [
      { id: 'o1', work_order_id: 'wo-2', organization_id: 'org', subcontractor_id: 'sub-1', status: 'pending', decline_reason: null, responded_at: null, created_by: null, created_at: '' },
      { id: 'o2', work_order_id: 'wo-2', organization_id: 'org', subcontractor_id: 'sub-2', status: 'declined', decline_reason: null, responded_at: null, created_by: null, created_at: '' },
    ]
    render(
      <MemoryRouter>
        <ProjectWorkOrdersSection projectId="p1" />
      </MemoryRouter>,
    )
    const [first, second] = screen.getAllByTestId('work-order-card')
    expect(within(first!).getByText('Ruiz Plumbing')).toBeInTheDocument()
    expect(within(first!).getByText(/Rough-in done/)).toBeInTheDocument()
    expect(within(second!).getByText('Offered — 1 waiting for an answer · 1 declined')).toBeInTheDocument()
    expect(within(second!).getByText('Offered')).toBeInTheDocument()
  })

  it('creates a work order and sends it to several subcontractors, with insurance required', async () => {
    state.save.mockResolvedValue('wo-new')
    render(
      <MemoryRouter>
        <ProjectWorkOrdersSection projectId="p1" />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Create Work Order' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByLabelText('Ruiz Plumbing'))
    await userEvent.click(within(dialog).getByLabelText('Ben Cole'))
    expect(within(dialog).getByText(/NOT READY TO WORK — W-9/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Trade / specialty')).toHaveValue('Plumbing')
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Rough-in plumbing')
    await userEvent.type(within(dialog).getByLabelText('Agreed subcontractor price ($)'), '$4,500')
    await userEvent.click(within(dialog).getByLabelText(/Required for this work order/))
    await userEvent.type(within(dialog).getByLabelText('Certificate Holder (name and address)'), 'Kim Family, 12 Elm St')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create & Send' }))
    expect(state.save).toHaveBeenCalledWith({
      id: undefined,
      values: expect.objectContaining({
        project_id: 'p1',
        subcontractor_ids: ['sub-1', 'sub-2'],
        title: 'Rough-in plumbing',
        agreed_price: '$4,500',
        insurance_required: true,
        certificate_holder: 'Kim Family, 12 Elm St',
      }),
    })
    expect(toast.success).toHaveBeenCalledWith('Work order sent to 2 subcontractors — the first to accept gets it')
  })
})

describe('My Work Orders groups', () => {
  it('groups New Offers, Assigned, In Progress and Work Completed', () => {
    render(
      <MemoryRouter>
        <MyWorkOrderGroups
          workOrders={[
            workOrder({ id: 'a', status: 'offered', subcontractor_id: null }),
            workOrder({ id: 'b', status: 'accepted' }),
            workOrder({ id: 'c', status: 'in_progress' }),
            workOrder({ id: 'd', status: 'work_completed' }),
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('New Offers (1)')).toBeInTheDocument()
    expect(screen.getByText('Assigned (1)')).toBeInTheDocument()
    expect(screen.getByText('In Progress (1)')).toBeInTheDocument()
    expect(screen.getByText('Work Completed (1)')).toBeInTheDocument()
    expect(screen.getByText('New Offer')).toBeInTheDocument()
    expect(screen.queryByText(/Project Assignments/i)).not.toBeInTheDocument()
  })
})
