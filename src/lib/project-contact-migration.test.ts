import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261001061500_my_project_contact.sql?raw'

const sql = migrationSql.toLowerCase().replace(/--.*$/gm, '')
const body = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;'))

describe('employee project contact migration', () => {
  it('returns only project id, client name and client phone', () => {
    const returns = sql.slice(sql.indexOf('returns table'), sql.indexOf('language sql'))
    expect(returns.replace(/\s+/g, ' ')).toContain('project_id uuid, client_name text, client_phone text')
    for (const forbidden of ['email', 'internal_notes', 'emergency_contact', 'insurance_info', 'license_info', 'project_total', 'payment']) {
      expect(sql).not.toContain(forbidden)
    }
  })

  it('reuses the canonical resolver instead of a new client rule', () => {
    expect(body).toContain('public.resolve_project_client(p.id)')
    expect(body).not.toContain('order by')
  })

  it('is scoped to an approved, active employee / PM assigned to the project in the same organization', () => {
    expect(body).toContain('viewer.id = auth.uid()')
    expect(body).toContain("viewer.approval_status = 'approved'")
    expect(body).toContain('viewer.archived_at is null')
    expect(body).toContain("viewer.role in ('employee', 'project_manager')")
    expect(body).toContain('viewer.organization_id = p.organization_id')
    expect(body).toContain('pa.profile_id = auth.uid()')
    expect(body).toContain('pa.is_active = true')
  })

  it('does not change RLS or table privileges, and anon cannot execute', () => {
    expect(sql).not.toMatch(/create policy|drop policy|alter policy|alter table|grant [^;]* on public\./)
    expect(sql).toContain('revoke all on function public.get_my_project_contact(uuid) from anon')
    expect(sql).toContain('grant execute on function public.get_my_project_contact(uuid) to authenticated')
  })
})
