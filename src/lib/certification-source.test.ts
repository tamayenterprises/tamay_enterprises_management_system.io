import { describe, expect, it } from 'vitest'
import {
  canRequestCertificationDelete,
  certificationMatchesType,
  isSelfUploadedCertification,
} from '@/lib/certification-source'

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

describe('certificationMatchesType', () => {
  it('lets All types include every certification, and a specific type only that type', () => {
    expect(certificationMatchesType({ certification_type: 'OSHA' }, 'all')).toBe(true)
    expect(certificationMatchesType({ certification_type: 'CPR' }, 'all')).toBe(true)
    expect(certificationMatchesType({ certification_type: 'OSHA' }, 'OSHA')).toBe(true)
    expect(certificationMatchesType({ certification_type: 'CPR' }, 'OSHA')).toBe(false)
    expect(certificationMatchesType({ certification_type: 'Other' }, 'Other')).toBe(true)
    expect(certificationMatchesType({ certification_type: 'OSHA' }, 'Other')).toBe(false)
  })
})

describe('canRequestCertificationDelete', () => {
  it('lets workers and project managers request deletion; admin removes directly', () => {
    expect(canRequestCertificationDelete({ role: 'employee' })).toBe(true)
    expect(canRequestCertificationDelete({ role: 'subcontractor' })).toBe(true)
    expect(canRequestCertificationDelete({ role: 'admin' })).toBe(false)
    expect(canRequestCertificationDelete({ role: 'project_manager' })).toBe(true)
    expect(canRequestCertificationDelete({ role: 'client' })).toBe(false)
  })
})
