import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, validateUploadFile } from '@/lib/uploads'

describe('validateUploadFile', () => {
  it('rejects empty files', () => {
    const file = new File([], 'empty.pdf', { type: 'application/pdf' })
    expect(validateUploadFile(file)).toMatch(/empty/i)
  })

  it('accepts pdf under size limit', () => {
    const file = new File(['hello'], 'safety.pdf', { type: 'application/pdf' })
    expect(validateUploadFile(file)).toBeNull()
  })

  it('rejects files over the size limit with a clear warning', () => {
    const oversized = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'huge.pdf', {
      type: 'application/pdf',
    })
    expect(validateUploadFile(oversized)).toMatch(/must be 100 MB or smaller/i)
  })

  it('rejects unsupported extensions', () => {
    const file = new File(['hello'], 'notes.exe', { type: 'application/octet-stream' })
    expect(validateUploadFile(file)).toMatch(/isn’t a supported type/i)
  })
})
