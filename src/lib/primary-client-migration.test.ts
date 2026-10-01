import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261001045500_project_primary_client.sql?raw'

const withComments = migrationSql.toLowerCase()
const sql = withComments.replace(/--.*$/gm, '')

function functionBody(name: string) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  expect(start, `${name} should be defined`).toBeGreaterThan(-1)
  const bodyStart = sql.indexOf('as $$', start)
  const bodyEnd = sql.indexOf('$$;', bodyStart + 5)
  return sql.slice(bodyStart, bodyEnd)
}

describe('primary client migration', () => {
  it('uses project_assignments and guarantees one active primary per project', () => {
    expect(sql).toContain('add column if not exists is_primary_client boolean not null default false')
    expect(sql).toContain('check (not is_primary_client or is_active)')
    expect(sql).toMatch(/create unique index if not exists \w+\s+on public\.project_assignments \(project_id\)\s+where is_primary_client/)
    expect(sql).not.toMatch(/create table/)
  })

  it('does not change RLS policies or project / portal access', () => {
    expect(sql).not.toMatch(/create policy|drop policy|alter policy/)
    expect(sql).not.toContain('is_assigned_to_project')
    expect(sql).not.toMatch(/grant [^;]* on public\.profiles/)
  })

  it('guard trigger allows only active, non-archived client assignments to be primary', () => {
    const body = functionBody('trg_project_assignment_primary_client_guard')
    expect(body).toContain("v_role is distinct from 'client' or v_archived_at is not null")
    expect(body).toContain('new.is_primary_client := false')
  })

  it('only management can change the primary client, scoped to their organization', () => {
    const body = functionBody('set_project_primary_client')
    expect(body).toContain('public.has_management_role()')
    expect(body).toContain('public.same_organization(v_org)')
    expect(body).not.toMatch(/is_active\s*=\s*false/)
    expect(body).not.toContain('delete from')
    expect(sql).toContain('revoke all on function public.set_project_primary_client(uuid, uuid) from anon')
  })

  it('internal helpers are not callable by app users', () => {
    for (const name of [
      'resolve_project_client(uuid)',
      'promote_sole_project_client(uuid)',
      'trg_project_assignment_primary_client_guard()',
      'trg_project_assignment_primary_client_after()',
      'trg_profile_primary_client_cleanup()',
    ]) {
      expect(sql).toContain(`revoke all on function public.${name} from authenticated`)
      expect(sql).toContain(`revoke all on function public.${name} from anon`)
    }
  })

  it('resolver prefers the primary client, then the earliest active client', () => {
    const body = functionBody('resolve_project_client')
    expect(body).toContain('order by pa.is_primary_client desc, pa.assigned_at asc, pa.id asc')
    expect(body).toContain("cp.role = 'client'")
    expect(body).toContain('cp.archived_at is null')
    for (const forbidden of ['email', 'internal_notes', 'emergency_contact', 'insurance_info', 'license_info']) {
      expect(body).not.toContain(forbidden)
    }
  })

  it('employee schedule resolves the client through the shared resolver and stays caller-scoped', () => {
    const body = functionBody('get_my_work_schedule')
    expect(body).toContain('public.resolve_project_client(p.id)')
    expect(body).not.toContain('order by cpa.assigned_at')
    expect(body).toContain('me.profile_id = auth.uid()')
    expect(body).toContain('public.is_work_schedule_viewer()')
    for (const forbidden of ['project_total', 'payment', 'receipt', 'internal_notes', 'email', 'cm.phone']) {
      expect(body).not.toContain(forbidden)
    }
  })

  it('backfills only projects with exactly one eligible client', () => {
    const backfill = withComments.slice(withComments.lastIndexOf('-- backfill'))
    expect(backfill).toContain('having count(*) = 1')
  })
})
