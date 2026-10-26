import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261026233000_admin_personnel_document_upload.sql?raw'

const sql = migrationSql.toLowerCase()

describe('admin personnel document upload migration', () => {
  it('lets an admin insert a personal document owned by another staff member', () => {
    expect(sql).toContain('public.is_admin()')
    expect(sql).toContain('project_id is null')
    expect(sql).toContain("p.role in ('admin', 'project_manager', 'employee', 'subcontractor')")
    expect(sql).toContain('owner_id is distinct from auth.uid()')
  })

  it('stores those files under the worker personnel folder', () => {
    expect(sql).toContain("(storage.foldername(name))[2] = 'personnel'")
    expect(sql).toContain('public.profile_in_my_organization_text')
  })
})
