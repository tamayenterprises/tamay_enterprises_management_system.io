import { describe, expect, it } from 'vitest'
import migrationSql from '../../../supabase/migrations/20260343000000_work_schedule.sql?raw'

const sql = migrationSql.toLowerCase()

function functionBody(name: string) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  expect(start, `${name} should be defined`).toBeGreaterThan(-1)
  const bodyStart = sql.indexOf('as $$', start)
  const bodyEnd = sql.indexOf('$$;', bodyStart + 5)
  return sql.slice(bodyStart, bodyEnd)
}

describe('work schedule migration security', () => {
  it('never copies address or client contact into schedule tables', () => {
    const tables = sql.slice(
      sql.indexOf('create table if not exists public.work_schedule_entries'),
      sql.indexOf('drop trigger if exists work_schedule_entries_updated_at'),
    )
    for (const column of ['address', 'phone', 'client', 'latitude', 'longitude']) {
      expect(tables).not.toContain(column)
    }
  })

  it('only defines SELECT policies; writes go through management functions', () => {
    const policies = sql.match(/create policy[\s\S]*?;/g) ?? []
    expect(policies.length).toBe(2)
    for (const policy of policies) {
      expect(policy).toContain('for select')
      expect(policy).toContain('to authenticated')
    }
    expect(sql).toContain('revoke insert, update, delete on public.work_schedule_entries from authenticated')
    expect(sql).toContain('revoke insert, update, delete on public.work_schedule_assignees from authenticated')
    expect(sql).toContain('revoke all on public.work_schedule_entries from anon')
  })

  it('employee read function is scoped to the caller and excludes finance / private profile data', () => {
    const body = functionBody('get_my_work_schedule')
    expect(body).toContain('me.profile_id = auth.uid()')
    expect(body).toContain('public.is_work_schedule_viewer()')
    expect(body).toContain("location_verification_status = 'verified'")
    for (const forbidden of [
      'project_total',
      'payment',
      'receipt',
      'internal_notes',
      'emergency_contact',
      'email',
      'hire_date',
      'insurance_info',
      'license_info',
    ]) {
      expect(body).not.toContain(forbidden)
    }
  })

  it('crew names are first name + last initial only', () => {
    const body = functionBody('get_my_work_schedule')
    expect(body).toContain("upper(left(btrim(cm.last_name), 1)) || '.'")
    expect(body).not.toContain('cm.phone')
  })

  it('save and delete require management and are not executable by anon', () => {
    for (const name of ['save_work_schedule_entry', 'delete_work_schedule_entry']) {
      expect(functionBody(name)).toContain('not public.is_work_schedule_manager()')
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from anon`))
    }
  })

  it('save only schedules approved, active, non-archived employees or project managers', () => {
    const body = functionBody('save_work_schedule_entry')
    expect(body).toContain("pr.role not in ('employee', 'project_manager')")
    expect(body).toContain("pr.approval_status <> 'approved'")
    expect(body).toContain('pr.is_active is not true')
    expect(body).toContain('pr.archived_at is not null')
    expect(body).toContain("'auto-assigned from work schedule'")
  })

  it('notification helper cannot be called directly by app users', () => {
    expect(sql).toMatch(/revoke all on function public\.notify_work_schedule\([^)]*\) from authenticated/)
  })

  it('does not write schedule details into the org-wide activity log', () => {
    expect(sql).not.toContain('insert into public.activity_log')
  })
})
