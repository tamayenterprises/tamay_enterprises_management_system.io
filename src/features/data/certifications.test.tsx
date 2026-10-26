import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PROOF_FILE_CLEANUP_WARNING,
  certificationProofPath,
  useCreateCertification,
  useDeleteCertification,
  useUpdateCertification,
} from './certifications'

const calls: string[] = []
let rpcResult: Record<string, { data: unknown; error: unknown }> = {}
let removeResult: { data: unknown; error: unknown } = { data: [{}], error: null }

vi.mock('@/features/auth/auth-hooks', () => ({
  useAuth: () => ({ profile: { id: 'manager-1', organization_id: 'org-1', role: 'project_manager' } }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}:${JSON.stringify(args)}`)
      return rpcResult[name] ?? { data: null, error: null }
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          calls.push(`upload:${path}`)
          return { error: null }
        },
        remove: async (paths: string[]) => {
          calls.push(`remove:${paths.join(',')}`)
          return removeResult
        },
      }),
    },
    from: (table: string) => {
      const chain = {
        insert: (row: Record<string, unknown>) => {
          calls.push(`${table}.insert:${String(row.document_url)}`)
          return chain
        },
        update: () => {
          calls.push(`${table}.update`)
          return chain
        },
        delete: () => {
          calls.push(`${table}.delete`)
          return chain
        },
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: { id: 'cert-1', profile_id: 'worker-1', name: 'OSHA 10' }, error: null }),
        then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
      }
      return chain
    },
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

const proof = () => new File(['%PDF'], 'osha card.pdf', { type: 'application/pdf' })
const photoProof = () => new File(['jpeg'], 'osha card.jpg', { type: 'image/jpeg' })
const values = { name: 'OSHA 10', certification_type: 'OSHA', profile_id: 'worker-1', issue_date: '', expiration_date: '', notes: '' }

beforeEach(() => {
  calls.length = 0
  rpcResult = {}
  removeResult = { data: [{}], error: null }
})

describe('certification proofs', () => {
  it('stores the proof in the worker folder even when a manager uploads it', () => {
    expect(certificationProofPath('worker-1', 'osha card?.pdf', 1)).toBe('worker-1/certifications/1-osha card_.pdf')
  })

  it('creates the certification, uploads into the worker folder and links it through the server', async () => {
    const { result } = renderHook(() => useCreateCertification(), { wrapper })
    await result.current.mutateAsync({ values, file: proof() })

    expect(calls[0]).toBe('certifications.insert:null')
    expect(calls[1]).toMatch(/^upload:worker-1\/certifications\/\d+-osha card\.pdf$/)
    expect(calls[2]).toMatch(/^rpc:set_certification_proof:.*"p_storage_path":"worker-1\/certifications\//)
    expect(calls.some((call) => call.startsWith('documents.insert'))).toBe(false)
  })

  it('accepts an image proof the same way as a PDF', async () => {
    const { result } = renderHook(() => useCreateCertification(), { wrapper })
    await result.current.mutateAsync({ values, file: photoProof() })
    expect(calls[1]).toMatch(/^upload:worker-1\/certifications\/\d+-osha card\.jpg$/)
  })

  it('removes the uploaded file and the new certification when linking the proof fails', async () => {
    rpcResult.set_certification_proof = { data: null, error: new Error('denied') }
    const { result } = renderHook(() => useCreateCertification(), { wrapper })
    await expect(result.current.mutateAsync({ values, file: proof() })).rejects.toThrow('denied')
    expect(calls.some((call) => call.startsWith('remove:worker-1/certifications/'))).toBe(true)
    expect(calls).toContain('certifications.delete')
  })

  it('replacing a proof deletes the previous file returned by the server', async () => {
    rpcResult.set_certification_proof = { data: 'worker-1/certifications/old.pdf', error: null }
    const { result } = renderHook(() => useUpdateCertification(), { wrapper })
    const outcome = await result.current.mutateAsync({ id: 'cert-1', values, file: proof() })
    expect(calls).toContain('remove:worker-1/certifications/old.pdf')
    expect(outcome.fileWarning).toBeUndefined()
  })

  it('reports a file that Storage would not delete instead of ignoring it', async () => {
    rpcResult.set_certification_proof = { data: 'manager-1/certifications/legacy.pdf', error: null }
    removeResult = { data: [], error: null }
    const { result } = renderHook(() => useUpdateCertification(), { wrapper })
    const outcome = await result.current.mutateAsync({ id: 'cert-1', values, file: proof() })
    expect(outcome.fileWarning).toBe(PROOF_FILE_CLEANUP_WARNING)
  })

  it('removes a certification through the server, then deletes its proof file', async () => {
    rpcResult.remove_certification = { data: 'worker-1/certifications/a.pdf', error: null }
    const { result } = renderHook(() => useDeleteCertification(), { wrapper })
    const outcome = await result.current.mutateAsync({ id: 'cert-1' })
    expect(calls).toEqual(['rpc:remove_certification:{"p_certification_id":"cert-1"}', 'remove:worker-1/certifications/a.pdf'])
    expect(outcome.fileWarning).toBeUndefined()
    expect(calls).not.toContain('certifications.delete')
  })

  it('surfaces a storage failure on removal', async () => {
    rpcResult.remove_certification = { data: 'worker-1/certifications/a.pdf', error: null }
    removeResult = { data: null, error: new Error('network') }
    const { result } = renderHook(() => useDeleteCertification(), { wrapper })
    const outcome = await result.current.mutateAsync({ id: 'cert-1' })
    expect(outcome.fileWarning).toBe(PROOF_FILE_CLEANUP_WARNING)
  })

  it('does not touch Storage when the certification had no proof', async () => {
    const { result } = renderHook(() => useDeleteCertification(), { wrapper })
    await result.current.mutateAsync({ id: 'cert-1' })
    expect(calls).toEqual(['rpc:remove_certification:{"p_certification_id":"cert-1"}'])
  })
})
