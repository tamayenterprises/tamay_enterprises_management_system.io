import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '@/types/database'
import { ClientProjectsPage } from './client-projects'

const useProjects = vi.fn()

vi.mock('@/features/data/hooks', () => ({
  useProjects: (args: unknown) => useProjects(args),
}))

function project(id: string, name: string): Project {
  return {
    id,
    name,
    location: 'Miami',
    status: 'in_progress',
    updated_at: '2026-10-01T00:00:00.000Z',
  } as Project
}

beforeEach(() => {
  useProjects.mockReset()
  useProjects.mockReturnValue({
    data: [
      project('p1', 'Kitchen remodel'),
      project('p2', 'Pool house'),
      project('p3', 'Roof repair'),
      project('p4', 'Driveway'),
    ],
    isLoading: false,
    isError: false,
  })
})

describe('Client My projects', () => {
  it('shows two projects, then the rest after See more', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ClientProjectsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Kitchen remodel')).toBeInTheDocument()
    expect(screen.getByText('Pool house')).toBeInTheDocument()
    expect(screen.queryByText('Roof repair')).not.toBeInTheDocument()
    expect(screen.queryByText('Driveway')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 2 more/i }))

    expect(screen.getByText('Roof repair')).toBeInTheDocument()
    expect(screen.getByText('Driveway')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /See .* more/i })).not.toBeInTheDocument()
  })
})
