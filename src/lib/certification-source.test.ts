import { describe, expect, it } from 'vitest'
import { canRequestCertificationDelete, isSelfUploadedCertification } from '@/lib/certification-source'

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

describe('canRequestCertificationDelete', () => {
  it('lets workers request deletion and keeps management on immediate remove', () => {
    expect(canRequestCertificationDelete({ role: 'employee' })).toBe(true)
    expect(canRequestCertificationDelete({ role: 'subcontractor' })).toBe(true)
    expect(canRequestCertificationDelete({ role: 'admin' })).toBe(false)
    expect(canRequestCertificationDelete({ role: 'project_manager' })).toBe(false)
    expect(canRequestCertificationDelete({ role: 'client' })).toBe(false)
  })
})
