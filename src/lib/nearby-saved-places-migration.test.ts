import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261018090000_nearby_saved_places.sql?raw'

const sql = migrationSql.toLowerCase().replace(/--.*$/gm, '').replace(/\s+/g, ' ')

function policy(name: string) {
  const start = sql.indexOf(`create policy "${name.toLowerCase()}"`)
  if (start < 0) throw new Error(`missing policy ${name}`)
  return sql.slice(start, sql.indexOf(';', start))
}

describe('nearby saved places migration', () => {
  it('creates one small table with the approved fields and limits', () => {
    for (const column of ['place_type text not null', 'category text not null', 'business_name text not null', 'address text not null', 'latitude double precision', 'phone text', 'website text', 'note text', 'is_preferred boolean not null default false', 'archived_at timestamptz']) {
      expect(sql).toContain(column)
    }
    expect(sql).toContain("place_type in ('supplier', 'food')")
    expect(sql).toContain('char_length(note) <= 200')
    expect(sql).toContain("website ~* '^https?://'")
    expect(sql).not.toMatch(/\bdrop table\b(?! if exists public\.nearby_saved_places)|\bupdate public\.(?!nearby)|\bdelete from\b/)
  })

  it('employee read: approved, active staff of the same organization; clients excluded', () => {
    const read = policy('Staff view saved places')
    expect(read).toContain('for select')
    expect(read).toContain('public.is_nearby_finder_user()')
    expect(read).toContain('public.same_organization(organization_id)')
    expect(sql).toContain("pr.role in ('admin', 'project_manager', 'employee', 'subcontractor')")
    expect(sql).not.toMatch(/pr\.role in \([^)]*'client'/)
  })

  it('management write only; employees and subcontractors cannot add or edit; nobody hard-deletes', () => {
    expect(policy('Management add saved places')).toContain('with check (public.is_nearby_places_manager() and public.same_organization(organization_id))')
    const edit = policy('Management edit saved places')
    expect(edit).toContain('using (public.is_nearby_places_manager()')
    expect(edit).toContain('with check (public.is_nearby_places_manager()')
    expect(sql).toContain('select public.has_management_role() and public.is_approved_user()')
    expect(sql).toContain('grant select, insert, update on public.nearby_saved_places to authenticated')
    expect(sql).not.toMatch(/for delete/)
    expect(sql).toContain('revoke all on public.nearby_saved_places from anon')
  })

  it('the server stamps creator / editor and keeps the organization fixed', () => {
    expect(sql).toContain('new.created_by := auth.uid()')
    expect(sql).toContain('new.updated_by := auth.uid()')
    expect(sql).toContain('new.organization_id := old.organization_id')
    expect(sql).toContain('before insert or update on public.nearby_saved_places')
  })
})
