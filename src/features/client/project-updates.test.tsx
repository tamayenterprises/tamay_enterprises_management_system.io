import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectNote } from '@/types/database'
import { ClientProjectUpdates } from './project-updates'

const useProjectNotes = vi.fn()

vi.mock('@/features/data/hooks', () => ({
  useProjectNotes: (id: unknown) => useProjectNotes(id),
  useCreateProjectUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  createUpdatePhotoSignedUrl: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function note(id: string, content: string): ProjectNote {
  return {
    id,
    project_id: 'proj',
    author_id: 'a',
    content,
    photo_path: null,
    parent_id: null,
    visible_to_client: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

beforeEach(() => {
  useProjectNotes.mockReset()
  useProjectNotes.mockReturnValue({
    data: [
      note('1', 'First update'),
      note('2', 'Second update'),
      note('3', 'Third update'),
      note('4', 'Fourth update'),
      note('5', 'Fifth update'),
    ],
    isLoading: false,
  })
})

describe('Client project updates', () => {
  it('shows one update, then three more at a time', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ClientProjectUpdates projectId="proj" />
      </MemoryRouter>,
    )

    expect(screen.getByText('Fifth update')).toBeInTheDocument()
    expect(screen.queryByText('Fourth update')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 3 more/i }))
    expect(screen.getByText('Fourth update')).toBeInTheDocument()
    expect(screen.getByText('Third update')).toBeInTheDocument()
    expect(screen.getByText('Second update')).toBeInTheDocument()
    expect(screen.queryByText('First update')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See 1 more/i }))
    expect(screen.getByText('First update')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /See .* more/i })).not.toBeInTheDocument()
  })
})
