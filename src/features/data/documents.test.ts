import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentRecord } from '@/types/database'
import {
  createDocumentSignedUrl,
  downloadDocumentFile,
  useDeleteDocument,
  useUploadDocument,
  viewDocumentFile,
} from './documents'

const createSignedUrl = vi.fn()
const download = vi.fn()
const upload = vi.fn()
const removeObjects = vi.fn()
const deleteResult = vi.fn()
const insertCalls: Array<{ returning: boolean }> = []
let profile: { id: string; role: string; organization_id: string } | null = null

vi.mock('@/features/auth/auth-hooks', () => ({ useAuth: () => ({ profile }) }))
vi.mock('@/lib/uploads', () => ({
  validateUploadFile: () => null,
  uploadErrorMessage: (e: { message?: string }) => e?.message ?? 'error',
  prepareUploadFileAsync: async (file: File) => ({ file, displayName: file.name, contentType: file.type }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrl, download, upload, remove: removeObjects }) },
    from: () => ({
      delete: () => ({ eq: () => ({ select: async () => deleteResult() }) }),
      insert: (row: Record<string, unknown>) => {
        const call = { returning: false }
        insertCalls.push(call)
        const minimal = Promise.resolve({ error: null })
        return Object.assign(minimal, {
          select: () => ({
            single: async () => {
              call.returning = true
              return { data: { ...row, created_at: 'now' }, error: null }
            },
          }),
        })
      },
    }),
  },
}))

const restricted = {
  id: 'd1',
  name: 'Project Breakdown.pdf',
  project_id: 'p1',
  category: 'project_file',
  mime_type: 'application/pdf',
  storage_path: 'admin-id/p1/1700000000-abc-Project_Breakdown.pdf',
} as DocumentRecord

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient() }, children)
}

beforeEach(() => {
  for (const fn of [createSignedUrl, download, upload, removeObjects, deleteResult]) fn.mockReset()
  upload.mockResolvedValue({ error: null })
  removeObjects.mockResolvedValue({ error: null })
  insertCalls.length = 0
  profile = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createDocumentSignedUrl', () => {
  it('fails closed with a fixed message that never contains the storage path', async () => {
    createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: `Object not found: ${restricted.storage_path}` },
    })
    const error = await createDocumentSignedUrl(restricted).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('This file is not available. Ask management for access.')
    expect((error as Error).message).not.toContain('Project_Breakdown')
    expect((error as Error).message).not.toContain('admin-id')
  })

  it('returns the URL when storage authorizes the caller', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/x' }, error: null })
    await expect(createDocumentSignedUrl(restricted)).resolves.toBe('https://signed.example/x')
  })
})

describe('useDeleteDocument', () => {
  it('reports a refusal when row-level security deleted nothing (no false "removed")', async () => {
    deleteResult.mockReturnValue({ data: [], error: null })
    const { result } = renderHook(() => useDeleteDocument(), { wrapper })
    await expect(result.current.mutateAsync(restricted)).rejects.toThrow('You do not have permission to remove this file.')
    expect(removeObjects).not.toHaveBeenCalled()
  })

  it('removes the stored file only after the row was really deleted', async () => {
    deleteResult.mockReturnValue({ data: [{ id: 'd1' }], error: null })
    const { result } = renderHook(() => useDeleteDocument(), { wrapper })
    await result.current.mutateAsync(restricted)
    expect(removeObjects).toHaveBeenCalledWith([restricted.storage_path])
  })
})

describe('viewDocumentFile', () => {
  it('opens the tab inside the click, then points it at the signed URL', async () => {
    const tab = { closed: false, opener: {}, location: { replace: vi.fn() }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/view' }, error: null })
    const pending = viewDocumentFile(restricted)
    expect(open).toHaveBeenCalledTimes(1)
    await pending
    expect(tab.opener).toBeNull()
    expect(tab.location.replace).toHaveBeenCalledWith('https://signed.example/view')
  })

  it('closes the blank tab when access is refused', async () => {
    const tab = { closed: false, opener: {}, location: { replace: vi.fn() }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'denied' } })
    await expect(viewDocumentFile(restricted)).rejects.toThrow('This file is not available')
    expect(tab.close).toHaveBeenCalled()
    expect(tab.location.replace).not.toHaveBeenCalled()
  })
})

describe('downloadDocumentFile', () => {
  it('saves the authorized file under its document name', async () => {
    download.mockResolvedValue({ data: new Blob(['%PDF-1.4 ...'], { type: 'application/pdf' }), error: null })
    const createObjectURL = vi.fn(() => 'blob:doc')
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await downloadDocumentFile(restricted)
    expect(createObjectURL).toHaveBeenCalled()
    const anchor = click.mock.contexts[0] as HTMLAnchorElement
    expect(anchor.download).toBe('Project Breakdown.pdf')
    expect(anchor.href).toBe('blob:doc')
  })

  it('refuses an empty file instead of saving a blank PDF', async () => {
    download.mockResolvedValue({ data: new Blob([]), error: null })
    await expect(downloadDocumentFile(restricted)).rejects.toThrow('This file is empty')
  })

  it('fails closed without exposing the path when storage refuses', async () => {
    download.mockResolvedValue({ data: null, error: { message: `denied ${restricted.storage_path}` } })
    const error = await downloadDocumentFile(restricted).catch((e: Error) => e)
    expect((error as Error).message).toBe('This file is not available. Ask management for access.')
  })
})

describe('useUploadDocument', () => {
  const pdf = () => new File(['%PDF-1.4'], 'Project Breakdown.pdf', { type: 'application/pdf' })
  const jpg = () => new File(['jpg'], 'Progress.jpg', { type: 'image/jpeg' })
  const asRole = (role: string) => {
    profile = { id: role, role, organization_id: 'org' }
    return renderHook(() => useUploadDocument(), { wrapper }).result
  }
  const photo = { category: 'work_photo', projectId: 'p1', bucket: 'project-files' } as const
  const document = { category: 'project_file', projectId: 'p1', bucket: 'project-files' } as const

  it.each(['employee', 'subcontractor'])('%s can upload a project photo', async (role) => {
    const doc = await asRole(role).current.mutateAsync({ file: jpg(), ...photo })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(insertCalls).toEqual([{ returning: true }])
    expect(doc.category).toBe('work_photo')
  })

  it.each(['employee', 'subcontractor'])(
    '%s cannot upload a formal project document (nothing reaches storage or the table)',
    async (role) => {
      const result = asRole(role)
      await expect(result.current.mutateAsync({ file: pdf(), ...document })).rejects.toThrow(
        'Only management can upload documents to a project. You can upload photos.',
      )
      await expect(
        result.current.mutateAsync({ file: pdf(), ...document, category: 'work_photo' }),
      ).rejects.toThrow('Only management can upload documents')
      await expect(result.current.mutateAsync({ file: jpg(), ...document, category: 'contract' })).rejects.toThrow(
        'Only management can upload documents',
      )
      expect(upload).not.toHaveBeenCalled()
      expect(insertCalls).toEqual([])
    },
  )

  it('employee personal (non-project) documents still upload', async () => {
    await asRole('employee').current.mutateAsync({ file: pdf(), category: 'certification' })
    expect(insertCalls).toEqual([{ returning: true }])
  })

  it.each(['admin', 'project_manager'])('%s can upload both photos and documents', async (role) => {
    const result = asRole(role)
    await result.current.mutateAsync({ file: jpg(), ...photo })
    await result.current.mutateAsync({ file: pdf(), ...document })
    expect(upload).toHaveBeenCalledTimes(2)
    expect(insertCalls).toEqual([{ returning: true }, { returning: true }])
  })

  it('client uploads are unchanged (documents and photos)', async () => {
    const result = asRole('client')
    await result.current.mutateAsync({ file: pdf(), ...document })
    await result.current.mutateAsync({ file: jpg(), ...photo })
    expect(insertCalls).toHaveLength(2)
  })
})
