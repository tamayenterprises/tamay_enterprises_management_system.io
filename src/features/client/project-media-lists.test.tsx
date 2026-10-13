import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DocumentRecord } from '@/types/database'
import { ClientProjectMediaLists } from './project-media-lists'

vi.mock('@/features/data/hooks', () => ({
  createDocumentSignedUrl: vi.fn().mockResolvedValue('https://example.test/file'),
}))
vi.mock('@/lib/uploads', async () => {
  const actual = await vi.importActual<typeof import('@/lib/uploads')>('@/lib/uploads')
  return { ...actual, confirmAction: () => true }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function file(id: string, name: string, category: DocumentRecord['category']): DocumentRecord {
  return {
    id,
    name,
    category,
    mime_type: category === 'work_photo' ? 'image/jpeg' : 'application/pdf',
    created_at: '2026-01-01T00:00:00Z',
    file_size: 1024,
  } as DocumentRecord
}

describe('Client photos and documents', () => {
  it('shows two of each, then three more at a time', async () => {
    const user = userEvent.setup()
    const photos = [1, 2, 3, 4, 5, 6].map((n) => file(`p${n}`, `Photo ${n}.jpg`, 'work_photo'))
    const docs = [1, 2, 3, 4, 5, 6].map((n) => file(`d${n}`, `Doc ${n}.pdf`, 'project_file'))

    render(<ClientProjectMediaLists photos={photos} fileDocs={docs} />)

    expect(screen.getByRole('button', { name: 'Photo 1.jpg' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Photo 2.jpg' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Photo 3.jpg' })).not.toBeInTheDocument()
    expect(screen.getByText('Doc 1.pdf')).toBeInTheDocument()
    expect(screen.getByText('Doc 2.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Doc 3.pdf')).not.toBeInTheDocument()

    const seeMore = screen.getAllByRole('button', { name: /See 3 more/i })
    expect(seeMore).toHaveLength(2)
    await user.click(seeMore[0]!)
    expect(screen.getByRole('button', { name: 'Photo 5.jpg' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Photo 6.jpg' })).not.toBeInTheDocument()

    await user.click(seeMore[1]!)
    expect(screen.getByText('Doc 5.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Doc 6.pdf')).not.toBeInTheDocument()
  })
})
