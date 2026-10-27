import { describe, expect, it } from 'vitest'
import {
  canAccessAppPage,
  DEFAULT_PM_PAGES,
  GRANTABLE_PM_PAGES,
  pageKeyFromPath,
  resolvedPmPages,
  sanitizeGrantedPages,
} from './page-access'

describe('page access', () => {
  it('gives employees staff pages and not management pages', () => {
    const employee = { role: 'employee' as const, granted_pages: null }
    expect(canAccessAppPage(employee, 'dashboard')).toBe(true)
    expect(canAccessAppPage(employee, 'projects')).toBe(true)
    expect(canAccessAppPage(employee, 'schedule')).toBe(true)
    expect(canAccessAppPage(employee, 'nearby')).toBe(true)
    expect(canAccessAppPage(employee, 'employees')).toBe(false)
    expect(canAccessAppPage(employee, 'admin')).toBe(false)
    expect(canAccessAppPage(employee, 'clients')).toBe(false)
  })

  it('gives project managers the default management pages until admin customizes them', () => {
    const pm = { role: 'project_manager' as const, granted_pages: null }
    expect(canAccessAppPage(pm, 'employees')).toBe(true)
    expect(canAccessAppPage(pm, 'timesheets')).toBe(true)
    expect(canAccessAppPage(pm, 'clients')).toBe(false)
    expect(canAccessAppPage(pm, 'admin')).toBe(false)
    expect(resolvedPmPages(null)).toEqual([...DEFAULT_PM_PAGES])
  })

  it('limits a project manager to pages the admin granted', () => {
    const pm = { role: 'project_manager' as const, granted_pages: ['timesheets', 'clients'] }
    expect(canAccessAppPage(pm, 'dashboard')).toBe(true)
    expect(canAccessAppPage(pm, 'notifications')).toBe(true)
    expect(canAccessAppPage(pm, 'timesheets')).toBe(true)
    expect(canAccessAppPage(pm, 'clients')).toBe(true)
    expect(canAccessAppPage(pm, 'employees')).toBe(false)
    expect(canAccessAppPage(pm, 'projects')).toBe(false)
  })

  it('never lets a project manager open Admin', () => {
    const pm = { role: 'project_manager' as const, granted_pages: ['admin', 'employees'] }
    expect(canAccessAppPage(pm, 'admin')).toBe(false)
    expect(sanitizeGrantedPages(['admin', 'employees', 'nope'])).toEqual(['employees'])
  })

  it('lets admin open every page', () => {
    const admin = { role: 'admin' as const, granted_pages: [] }
    expect(canAccessAppPage(admin, 'admin')).toBe(true)
    expect(canAccessAppPage(admin, 'clients')).toBe(true)
    expect(canAccessAppPage(admin, 'employees')).toBe(true)
  })

  it('maps project detail URLs to the projects page key', () => {
    expect(pageKeyFromPath('/projects/abc')).toBe('projects')
    expect(GRANTABLE_PM_PAGES).toContain('clients')
  })
})
