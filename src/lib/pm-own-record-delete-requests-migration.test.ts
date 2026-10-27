import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261027050000_pm_own_record_delete_requests.sql?raw'

const sql = migrationSql.toLowerCase()

describe('project manager own-record delete requests', () => {
  it('lets a project manager request deletion of personal files, not work files', () => {
    expect(sql).toContain('public.has_management_role() and v_doc.project_id is not null')
    expect(sql).toContain('public.has_management_role() and v_cert.profile_id is distinct from v_uid')
  })
})
