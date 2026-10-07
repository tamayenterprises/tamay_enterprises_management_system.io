import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectsPage } from './projects'

let role = 'admin'
const useProjects = vi.fn()

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'u1', role, organization_id: 'org' } }),
}))
vi.mock('@/pages/my-projects', () => ({
  MyProjectsPage: () => <div data-testid="employee-my-projects" />,
}))
vi.mock('@/features/drafts/use-form-draft', () => ({
  useFormDraft: () => ({ draft: null, scheduleSave: vi.fn(), clearDraft: vi.fn(), saveNow: vi.fn() }),
}))
vi.mock('@/features/data/hooks', () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })
  return {
    useProjects: (args: unknown) => useProjects(args),
    useProfiles: () => ({ data: [] }),
    useProjectClientAssignees: () => ({ data: undefined }),
    useCreateProject: mutation,
    useAssignWorker: mutation,
    useArchiveProject: mutation,
    useRestoreProject: mutation,
    useHardDeleteProject: mutation,
  }
})

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useProjects.mockReset()
  useProjects.mockReturnValue({ data: [], isLoading: false, isError: false })
})

describe('/projects routing', () => {
  it.each(['admin', 'project_manager'])('%s keeps the existing management page', (r) => {
    role = r
    renderPage()
    expect(screen.queryByTestId('employee-my-projects')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New project/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not Started' })).toBeInTheDocument()
    expect(useProjects).toHaveBeenCalledWith(expect.objectContaining({ assignedOnly: false }))
  })

  it.each(['employee', 'subcontractor'])('%s gets the employee My Projects page', (r) => {
    role = r
    renderPage()
    expect(screen.getByTestId('employee-my-projects')).toBeInTheDocument()
    expect(useProjects).not.toHaveBeenCalled()
  })
})
