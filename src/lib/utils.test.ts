import { describe, expect, it } from 'vitest'
import {
  certificationStatusLabel,
  cn,
  deriveCertificationStatus,
  fullName,
  getInitials,
  isManagementRole,
  projectStatusLabel,
  roleLabel,
} from '@/lib/utils'

describe('utils', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'hidden' && 'hidden', 'px-4')).toContain('px-4')
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

  it('identifies management roles', () => {
    expect(isManagementRole('admin')).toBe(true)
    expect(isManagementRole('employee')).toBe(false)
  })

  it('derives certification status from expiration dates', () => {
    expect(deriveCertificationStatus(null)).toBe('missing')
    expect(deriveCertificationStatus('2000-01-01')).toBe('expired')
  })
})
