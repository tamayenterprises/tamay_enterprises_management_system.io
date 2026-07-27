import { describe, expect, it } from 'vitest'
import {
  certificationStatusLabel,
  cn,
  deriveCertificationStatus,
  documentCategoryLabel,
  documentStorageBucket,
  formatFileSize,
  fullName,
  getInitials,
  isManagementRole,
  projectStatusLabel,
  roleLabel,
} from '@/lib/utils'

describe('utils', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1', 'px-4')).toContain('px-4')
    expect(cn('px-2', undefined, 'text-sm')).toContain('text-sm')
  })

  it('formats names and initials', () => {
    expect(fullName('Ada', 'Lovelace')).toBe('Ada Lovelace')
    expect(getInitials('Ada', 'Lovelace')).toBe('AL')
  })

  it('labels roles and statuses', () => {
    expect(roleLabel('project_manager')).toBe('Project Manager')
    expect(projectStatusLabel('in_progress')).toBe('In Progress')
    expect(certificationStatusLabel('expiring_soon')).toBe('Expiring Soon')
  })

  it('labels document categories and formats file sizes', () => {
    expect(documentCategoryLabel('work_photo')).toBe('Work photo')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2.0 KB')
    expect(documentStorageBucket({ storage_path: 'user/file.pdf', project_id: null })).toBe('documents')
    expect(
      documentStorageBucket({ storage_path: 'user/project/file.pdf', project_id: 'abc' }),
    ).toBe('project-files')
  })

  it('identifies management roles', () => {
    expect(isManagementRole('admin')).toBe(true)
    expect(isManagementRole('employee')).toBe(false)
  })

  it('derives certification status from expiration dates', () => {
    expect(deriveCertificationStatus(null)).toBe('missing')
    expect(deriveCertificationStatus('2000-01-01')).toBe('expired')
  })
})
