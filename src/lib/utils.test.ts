import { describe, expect, it } from 'vitest'
import {
  approvalStatusLabel,
  buildIlikeOrFilter,
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
  sanitizeSearchTerm,
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
    expect(roleLabel('client')).toBe('Client')
    expect(projectStatusLabel('in_progress')).toBe('In Progress')
    expect(certificationStatusLabel('expiring_soon')).toBe('Expiring Soon')
    expect(approvalStatusLabel('pending')).toBe('Pending')
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

  it('sanitizes search terms for PostgREST filters', () => {
    expect(sanitizeSearchTerm('Ada')).toBe('Ada')
    expect(sanitizeSearchTerm('a%b_c,d.(e)')).toBe('a b c d e')
    expect(sanitizeSearchTerm('   ')).toBe('')
    expect(buildIlikeOrFilter(['first_name', 'email'], 'Ada,x')).toBe(
      'first_name.ilike.%Ada x%,email.ilike.%Ada x%',
    )
    expect(buildIlikeOrFilter(['first_name'], ',,,')).toBeNull()
  })
})
