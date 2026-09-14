import { describe, expect, it } from 'vitest'
import {
  MAX_UPLOAD_BYTES,
  prepareUploadFile,
  sniffUploadKind,
  validateUploadFile,
} from '@/lib/uploads'

describe('validateUploadFile', () => {
  it('rejects empty files without type/extension signal', () => {
    const file = new File([], 'empty.bin', { type: '' })
    expect(validateUploadFile(file)).toMatch(/empty|could not be read/i)
  })

  it('accepts pdf under size limit', () => {
    const file = new File(['hello'], 'safety.pdf', { type: 'application/pdf' })
    expect(validateUploadFile(file)).toBeNull()
  })

  it('accepts Android Drive PDFs that have MIME but no extension', () => {
    const file = new File(['hello'], 'Contract scan', { type: 'application/pdf' })
    expect(validateUploadFile(file)).toBeNull()
  })

  it('accepts opaque Android picks with bytes but no MIME/extension', () => {
    const file = new File(['%PDF-1.4 hello'], 'Document', { type: '' })
    expect(validateUploadFile(file)).toBeNull()
  })

  it('rejects files over the size limit with a clear warning', () => {
    const oversized = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'huge.pdf', {
      type: 'application/pdf',
    })
    expect(validateUploadFile(oversized)).toMatch(/must be 100 MB or smaller/i)
  })

  it('rejects unsupported extensions', () => {
    const bad = new File(['hello'], 'notes.exe', { type: 'application/x-msdownload' })
    expect(validateUploadFile(bad)).toMatch(/isn’t a supported type/i)
  })
})

describe('prepareUploadFile', () => {
  it('adds a .pdf extension in the display name without cloning the File', () => {
    const file = new File(['hello'], 'Invoice', { type: 'application/pdf' })
    const prepared = prepareUploadFile(file)
    expect(prepared.displayName).toBe('Invoice.pdf')
    expect(prepared.file).toBe(file)
    expect(prepared.contentType).toBe('application/pdf')
  })
})

describe('sniffUploadKind', () => {
  it('detects PDF magic bytes', async () => {
    const file = new File(['%PDF-1.7 content'], 'unknown', { type: '' })
    await expect(sniffUploadKind(file)).resolves.toEqual({ mime: 'application/pdf', ext: '.pdf' })
  })
})
