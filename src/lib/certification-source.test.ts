import { describe, expect, it } from 'vitest'
import { isSelfUploadedCertification } from '@/lib/certification-source'

describe('isSelfUploadedCertification', () => {
  it('treats Tamay / management uploads and legacy rows as company-provided', () => {
    expect(isSelfUploadedCertification({ created_by: 'admin-1' }, 'worker-1')).toBe(false)
    expect(isSelfUploadedCertification({ created_by: null }, 'worker-1')).toBe(false)
    expect(isSelfUploadedCertification({}, 'worker-1')).toBe(false)
  })

  it('treats rows created by the worker as their own', () => {
    expect(isSelfUploadedCertification({ created_by: 'worker-1' }, 'worker-1')).toBe(true)
  })
})
