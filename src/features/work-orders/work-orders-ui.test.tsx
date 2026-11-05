import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkOrderDetailPage } from '@/pages/work-order-detail'
import type { SubcontractorReadiness, WorkOrderFileRecord, WorkOrderRecord, WorkOrderUpdateRecord } from '@/types/database'
import { MyWorkOrderGroups } from './my-work-order-groups'
import { ProjectWorkOrdersSection } from './project-work-orders-section'

const state = vi.hoisted(() => ({
  profile: { id: 'sub-1', role: 'subcontractor' } as { id: string; role: string },
  workOrder: null as WorkOrderRecord | null,
  workOrders: [] as WorkOrderRecord[],
  updates: [] as WorkOrderUpdateRecord[],
  files: [] as WorkOrderFileRecord[],
  readiness: null as SubcontractorReadiness | null,
  updateStatus: vi.fn(),
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
      { id: 'sub-2', first_name: 'Ben', last_name: 'Cole', company_name: null, trade_specialization: 'Electrical', approval_status: 'approved', is_active: true, archived_at: null },
    ],
  }),
}))
vi.mock('@/features/work-orders/hooks', () => ({
  useWorkOrder: () => ({ data: state.workOrder, isLoading: false }),
  useProjectWorkOrders: () => ({ data: state.workOrders, isLoading: false }),
  useWorkOrderProjectSummaries: (ids: string[]) => ({
    data: new Map(ids.map((id) => [id, { work_order_id: id, project_id: 'p1', project_name: 'Kim Bathroom', job_address: '12 Elm St, New Haven, CT' }])),
  }),
  useLatestWorkOrderUpdates: () => ({
    data: new Map([['wo-1', { id: 'u1', work_order_id: 'wo-1', completed_today: 'Rough-in done', next_steps: null, issue_question: null, created_at: new Date().toISOString() }]]),
  }),
  useWorkOrderUpdates: () => ({ data: state.updates, isLoading: false }),
  useWorkOrderFiles: () => ({ data: state.files }),
  useWorkOrderPhotoUrls: () => ({ data: new Map() }),
  useUpdateWorkOrderStatus: () => ({ mutateAsync: state.updateStatus, isPending: false }),
  useAddWorkOrderUpdate: () => ({ mutateAsync: state.addUpdate, isPending: false }),
  useSaveWorkOrder: () => ({ mutateAsync: state.save, isPending: false }),
  useUploadWorkOrderReferences: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveWorkOrderFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  openWorkOrderFile: vi.fn(() => Promise.resolve()),
}))

function workOrder(overrides: Partial<WorkOrderRecord> = {}): WorkOrderRecord {
  return {
    id: 'wo-1',
    work_order_number: 1001,
    organization_id: 'org',
    project_id: 'p1',
    subcontractor_id: 'sub-1',
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
    subcontractor: { id: 'sub-1', first_name: 'Ana', last_name: 'Ruiz', company_name: 'Ruiz Plumbing' } as WorkOrderRecord['subcontractor'],
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
  state.readiness = readiness('ready')
})

describe('Work order detail (subcontractor)', () => {
  it('shows what the subcontractor needs and Accept Work Order when assigned', async () => {
    renderDetail()
    expect(screen.getByText('WO-1001 · Plumbing')).toBeInTheDocument()
    expect(screen.getByText('Kim Bathroom · 12 Elm St, New Haven, CT')).toBeInTheDocument()
    expect(screen.getByText('$4,500.00')).toBeInTheDocument()
    expect(screen.getByText('Nov 10, 2026')).toBeInTheDocument()
    expect(screen.getByText('Vanity 36in, shower valve Moen T2903')).toBeInTheDocument()
    expect(screen.getByText('Important Job Requirements')).toBeInTheDocument()
    expect(screen.getByText('Photos before covering concealed work')).toBeInTheDocument()
    expect(screen.getByText('Applies')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close Work Order' })).not.toBeInTheDocument()
    expect(screen.queryByText('Add Update')).not.toBeInTheDocument()

    state.updateStatus.mockResolvedValue('accepted')
    await userEvent.click(screen.getByRole('button', { name: 'Accept Work Order' }))
    expect(state.updateStatus).toHaveBeenCalledWith({ workOrderId: 'wo-1', action: 'accept' })
  })

  it('accepted: Start Work, blocked until Ready to Work', async () => {
    state.workOrder = workOrder({ status: 'accepted' })
    state.readiness = readiness('action_required')
    const { unmount } = renderDetail()
    expect(screen.getByRole('button', { name: 'Start Work' })).toBeDisabled()
    expect(screen.getByText('Complete your setup (documents approved) before starting work.')).toBeInTheDocument()
    unmount()

    state.readiness = readiness('ready')
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Start Work' }))
    expect(state.updateStatus).toHaveBeenCalledWith({ workOrderId: 'wo-1', action: 'start' })
  })

  it('in progress: Add Update and Mark Work Completed (with confirmation)', async () => {
    state.workOrder = workOrder({ status: 'in_progress' })
    renderDetail()
    expect(screen.getByText('Add Update')).toBeInTheDocument()
    expect(screen.getByText('Updates are for Tamay only. Clients do not see them.')).toBeInTheDocument()

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
    expect(state.addUpdate).toHaveBeenCalledWith({
      workOrderId: 'wo-1',
      completedToday: 'Drains set',
      nextSteps: 'Pressure test',
      issueQuestion: 'Valve location?',
      photos: [],
    })
    expect(toast.success).toHaveBeenCalledWith('Update sent to Tamay')
  })

  it('work completed is read-only for the subcontractor', () => {
    state.workOrder = workOrder({ status: 'work_completed', completed_at: '2026-11-20T12:00:00Z' })
    renderDetail()
    expect(screen.getByText('Work Completed — waiting for Tamay to review.')).toBeInTheDocument()
    for (const name of ['Accept Work Order', 'Start Work', 'Mark Work Completed', 'Send update', 'Close Work Order']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('shows updates with issues highlighted and photos management can open', () => {
    state.profile = { id: 'pm-1', role: 'project_manager' }
    state.workOrder = workOrder({ status: 'in_progress' })
    state.updates = [
      { id: 'u1', work_order_id: 'wo-1', organization_id: 'org', author_id: 'sub-1', completed_today: 'Drains set', next_steps: null, issue_question: 'Valve location?', created_at: '2026-11-12T15:00:00Z', author: { id: 'sub-1', first_name: 'Ana', last_name: 'Ruiz', company_name: 'Ruiz Plumbing' } as WorkOrderUpdateRecord['author'] },
    ]
    state.files = [
      { id: 'f1', work_order_id: 'wo-1', update_id: 'u1', organization_id: 'org', uploaded_by: 'sub-1', kind: 'update_photo', name: 'drain.jpg', storage_path: 'wo-1/updates/1-a-drain.jpg', mime_type: 'image/jpeg', file_size: 10, created_at: '2026-11-12T15:00:00Z' },
    ]
    renderDetail()
    const update = screen.getByTestId('work-order-update')
    expect(within(update).getByText('Valve location?')).toBeInTheDocument()
    expect(within(update).getByRole('button', { name: 'Open drain.jpg' })).toBeInTheDocument()
    expect(screen.queryByText('Add Update')).not.toBeInTheDocument()
  })
})

describe('Work order detail (management)', () => {
  it('sees the subcontractor, Edit and Close, but no subcontractor actions', async () => {
    state.profile = { id: 'pm-1', role: 'project_manager' }
    state.workOrder = workOrder({ status: 'work_completed' })
    state.updateStatus.mockResolvedValue('closed')
    renderDetail()
    expect(screen.getByText('Subcontractor: Ruiz Plumbing')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Project' })).toHaveAttribute('href', '/projects/p1')
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept Work Order' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close Work Order' }))
    expect(state.updateStatus).toHaveBeenCalledWith({ workOrderId: 'wo-1', action: 'close' })
  })
})

describe('Project Detail: Work Orders section', () => {
  it('lists compact cards: subcontractor, title, price, status, target, latest update, View Work Order', () => {
    state.profile = { id: 'pm-1', role: 'admin' }
    state.workOrders = [workOrder({ status: 'in_progress' }), workOrder({ id: 'wo-2', work_order_number: 1002, title: 'Panel upgrade', trade: 'Electrical' })]
    render(
      <MemoryRouter>
        <ProjectWorkOrdersSection projectId="p1" />
      </MemoryRouter>,
    )
    const cards = screen.getAllByTestId('work-order-card')
    expect(cards).toHaveLength(2)
    const first = within(cards[0]!)
    expect(first.getByText('Rough-in plumbing, 2nd floor bath')).toBeInTheDocument()
    expect(first.getByText('Ruiz Plumbing')).toBeInTheDocument()
    expect(first.getByText('In Progress')).toBeInTheDocument()
    expect(first.getByText(/Price \$4,500\.00 · Starts Nov 10, 2026 · Target Nov 21, 2026/)).toBeInTheDocument()
    expect(first.getByText(/Rough-in done/)).toBeInTheDocument()
    expect(first.getByRole('link', { name: 'View Work Order' })).toHaveAttribute('href', '/work-orders/wo-1')
  })

  it('creates a work order with warranty and the agreed price', async () => {
    state.save.mockResolvedValue('wo-new')
    render(
      <MemoryRouter>
        <ProjectWorkOrdersSection projectId="p1" />
      </MemoryRouter>,
    )
    expect(screen.getByText(/No work orders yet/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create Work Order' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByLabelText('Subcontractor'), 'sub-1')
    expect(within(dialog).getByLabelText('Trade / specialty')).toHaveValue('Plumbing')
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Rough-in plumbing')
    await userEvent.type(within(dialog).getByLabelText('Agreed subcontractor price ($)'), '$4,500')
    await userEvent.click(within(dialog).getByLabelText('Applies'))
    expect((within(dialog).getByLabelText('Warranty notes') as HTMLTextAreaElement).value).toContain('workmanship responsibility')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create Work Order' }))
    expect(state.save).toHaveBeenCalledWith({
      id: undefined,
      values: expect.objectContaining({
        project_id: 'p1',
        subcontractor_id: 'sub-1',
        trade: 'Plumbing',
        title: 'Rough-in plumbing',
        agreed_price: '$4,500',
        warranty_applies: true,
      }),
    })
  })

  it('warns when the chosen subcontractor is not Ready to Work', async () => {
    render(
      <MemoryRouter>
        <ProjectWorkOrdersSection projectId="p1" />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Create Work Order' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByLabelText('Subcontractor'), 'sub-2')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('NOT READY TO WORK — W-9')
  })
})

describe('My Work Orders groups', () => {
  it('groups Assigned (incl. Accepted), In Progress and Work Completed', () => {
    render(
      <MemoryRouter>
        <MyWorkOrderGroups
          workOrders={[
            workOrder({ id: 'a', status: 'assigned' }),
            workOrder({ id: 'b', status: 'accepted' }),
            workOrder({ id: 'c', status: 'in_progress' }),
            workOrder({ id: 'd', status: 'work_completed' }),
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Assigned (2)')).toBeInTheDocument()
    expect(screen.getByText('In Progress (1)')).toBeInTheDocument()
    expect(screen.getByText('Work Completed (1)')).toBeInTheDocument()
    expect(screen.getAllByText('Kim Bathroom · 12 Elm St, New Haven, CT')).toHaveLength(4)
    expect(screen.queryByText(/Project Assignments/i)).not.toBeInTheDocument()
  })
})
