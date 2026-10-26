import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261022100000_workforce_security_phase0.sql?raw'
import { PROFILE_DIRECTORY_COLUMNS, PROFILE_PRIVATE_FIELDS, PROJECT_MANAGER_PROFILE_FIELDS } from './profile-fields'

const sql = migrationSql.toLowerCase().replace(/--.*$/gm, '').replace(/\s+/g, ' ')
const columnList = (text: string) => text.split(',').map((item) => item.trim()).filter(Boolean)

describe('workforce security phase 0 migration', () => {
  it('replaces table-wide profile reads with a directory-only column grant', () => {
    expect(sql).toContain('revoke select on public.profiles from anon, authenticated;')
    const grant = sql.match(/grant select \(([^)]*)\) on public\.profiles to authenticated;/)
    expect(grant).not.toBeNull()
    const granted = columnList(grant![1])
    expect(granted.sort()).toEqual(columnList(PROFILE_DIRECTORY_COLUMNS).sort())
    for (const field of PROFILE_PRIVATE_FIELDS) expect(granted).not.toContain(field)
    expect(sql).not.toMatch(/grant select on public\.profiles to/)
  })

  it('serves private fields only through masked functions', () => {
    expect(sql).toContain('create or replace function public.profile_private_fields(p_ids uuid[])')
    expect(sql).toMatch(/function public\.list_profiles\([^)]*\) returns table \(.*\) language sql stable security invoker/)
    expect(sql).toContain('case when r.is_admin_viewer or (r.is_pm_viewer and public.project_manager_can_read_profile_field(\'internal_notes\')) then r.internal_notes end')
    expect(sql).toContain('public.visible_profile_email(p.id) as email')
    for (const fn of ['profile_private_fields(uuid[])', 'list_profiles(uuid[], text[], text, boolean, text)']) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon;`)
    }
  })

  it('keeps the project-manager field list explicit instead of "PM = admin"', () => {
    const list = sql.match(/project_manager_can_read_profile_field\(p_field text\).*?select p_field = any \(array\[([^\]]*)\]/)
    expect(list).not.toBeNull()
    const fields = columnList(list![1].replace(/'/g, ''))
    expect(fields.sort()).toEqual([...PROJECT_MANAGER_PROFILE_FIELDS].sort())
    expect(fields).toEqual(['email', 'insurance_info', 'license_info', 'phone'])
  })

  it('stops project managers writing private fields they cannot read', () => {
    expect(sql).toContain('create trigger profiles_enforce_pm_private_writes before update on public.profiles')
    for (const field of ['hire_date', 'emergency_contact_name', 'emergency_contact_phone', 'internal_notes']) {
      expect(sql).toContain(`new.${field} is distinct from old.${field} and not public.project_manager_can_read_profile_field('${field}')`)
    }
    expect(sql).toContain('if public.is_admin() or not public.has_management_role() then return new;')
  })

  it('limits clients to themselves, staff and co-clients on shared active projects', () => {
    expect(sql).toContain('not public.current_user_is_client() or id = auth.uid() or role <> \'client\' or public.shares_active_project_with_current_user(id)')
    expect(sql).toContain('create policy "admins can manage profiles" on public.profiles for all using (public.is_admin() and (organization_id is null or public.same_organization(organization_id)))')
  })

  it('isolates certifications by organization and denies clients', () => {
    expect(sql).toMatch(/function public\.can_access_certification.*not public\.current_user_is_client\(\) and public\.same_organization\(p_organization_id\) and public\.profile_in_my_organization\(p_profile_id\)/)
    for (const action of ['select', 'insert', 'update', 'delete']) {
      expect(sql).toMatch(new RegExp(`on public\\.certifications for ${action} to authenticated (using|with check) \\(public\\.can_access_certification\\(profile_id, organization_id\\)\\)`))
    }
  })

  it('stores proofs in the worker folder, owned by the worker, without widening deletes', () => {
    expect(sql).toContain("(storage.foldername(name))[2] = 'certifications'")
    expect(sql).toContain("p_storage_path not like v_cert.profile_id::text || '/certifications/%'")
    expect(sql).toMatch(/insert into public\.documents \(organization_id, owner_id, uploaded_by, .*values \( v_cert\.organization_id, v_cert\.profile_id, v_uid,/)
    expect(sql).not.toMatch(/on storage\.objects for (delete|update)/)
    expect(sql).not.toMatch(/function public\.can_modify_document_row/)
  })

  it('removes the proof document row with the certification (no orphan rows)', () => {
    expect(sql).toMatch(/function public\.remove_certification.*delete from public\.documents where storage_path = v_cert\.document_url.*delete from public\.certifications where id = v_cert\.id; return v_cert\.document_url;/)
  })

  it('takes certification maintenance away from app users', () => {
    for (const fn of ['refresh_all_certification_statuses()', 'notify_certification_alerts()']) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`)
    }
    expect(sql).toContain("if not public.is_approved_user() or public.current_user_is_client() then raise exception 'not authorized'")
  })

  it('checks the caller before returning worker eligibility', () => {
    expect(sql).toContain('alter function public.get_worker_eligibility(uuid) rename to get_worker_eligibility_unchecked')
    expect(sql).toContain('revoke all on function public.get_worker_eligibility_unchecked(uuid) from public, anon, authenticated;')
    expect(sql).toMatch(/p_user_id = auth\.uid\(\) or \(public\.has_management_role\(\) and public\.profile_in_my_organization\(p_user_id\)\)/)
  })

  it('stops app users calling current_profile(), which returns the whole row', () => {
    expect(sql).toContain('revoke all on function public.current_profile() from public, anon, authenticated;')
  })

  it('adds no HR tax/identity categories and no new bucket', () => {
    expect(sql).not.toMatch(/\bw-?4\b|\bw-?9\b|\bi-?9\b|\bssn\b|\bein\b|direct_deposit|routing_number|bank_account/)
    expect(sql).not.toMatch(/insert into storage\.buckets|alter type public\.document_category/)
  })
})
