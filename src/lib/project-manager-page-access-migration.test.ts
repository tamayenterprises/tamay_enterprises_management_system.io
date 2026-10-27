import { describe, expect, it } from 'vitest'
import { GRANTABLE_PM_PAGES, PM_ALWAYS_PAGES } from './page-access'
import migrationSql from '../../supabase/migrations/20261027040000_project_manager_page_access.sql?raw'

const sql = migrationSql.toLowerCase()

describe('project manager page access migration', () => {
  it('stores an admin-only page allowlist on profiles', () => {
    expect(sql).toContain('add column if not exists granted_pages text[]')
    expect(sql).toContain('grant select (granted_pages) on public.profiles to authenticated')
    expect(sql).toContain('grant update (granted_pages) on public.profiles to authenticated')
    expect(sql).toContain("raise exception 'only admin can assign page access'")
    expect(sql).toContain('create trigger profiles_enforce_pm_page_access')
  })

  it('returns granted_pages from list_profiles', () => {
    expect(sql).toContain('drop function if exists public.list_profiles(uuid[], text[], text, boolean, text)')
    expect(sql).toContain('granted_pages text[]')
    expect(sql).toContain('v.archived_at, v.granted_pages, v.created_at, v.updated_at')
  })

  it('accepts the same page keys the app can grant', () => {
    for (const page of [...PM_ALWAYS_PAGES, ...GRANTABLE_PM_PAGES]) {
      expect(sql).toContain(`'${page}'`)
    }
    expect(sql).not.toContain("'admin'")
  })
})
