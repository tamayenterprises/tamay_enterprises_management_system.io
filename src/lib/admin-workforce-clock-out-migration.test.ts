import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261008010000_admin_workforce_clock_out.sql?raw'

const sql = migrationSql.toLowerCase()

describe('admin workforce clock-out migration', () => {
  it('exposes is_active on the workforce board without showing archived people', () => {
    expect(sql).toContain('p.is_active')
    expect(sql).toContain('p.archived_at is null')
    expect(sql).toContain('with (security_invoker = true)')
  })

  it('lets management clock out another worker in a definer function', () => {
    expect(sql).toContain('create or replace function public.admin_clock_out_worker')
    expect(sql).toContain('security definer')
    expect(sql).toContain('public.has_management_role()')
    expect(sql).toContain("workflow_status = 'completed'")
    expect(sql).toContain("'completed_for_day'")
    expect(sql).toContain('grant execute on function public.admin_clock_out_worker')
  })
})
