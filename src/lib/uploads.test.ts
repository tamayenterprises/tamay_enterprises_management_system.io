import { describe, expect, it } from 'vitest'
import { validateUploadFile } from '@/lib/uploads'

describe('validateUploadFile', () => {
  it('rejects empty files', () => {
    const file = new File([], 'empty.pdf', { type: 'application/pdf' })
    expect(validateUploadFile(file)).toMatch(/empty/i)
  })

  it('accepts pdf under size limit', () => {
    const file = new File(['hello'], 'safety.pdf', { type: 'application/pdf' })
    expect(validateUploadFile(file)).toBeNull()
  })

  it('rejects unsupported extensions', () => {
    const file = new File(['hello'], 'notes.exe', { type: 'application/octet-stream' })
    expect(validateUploadFile(file)).toMatch(/unsupported/i)
  })
})
