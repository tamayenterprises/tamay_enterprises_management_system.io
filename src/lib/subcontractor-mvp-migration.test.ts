import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261103010000_subcontractor_mvp.sql?raw'

const sql = migrationSql.toLowerCase().replace(/--.*$/gm, '').replace(/\s+/g, ' ')

describe('subcontractor MVP migration', () => {
  it('is additive: no drops of tables, columns or existing policies, no data rewrites', () => {
    expect(sql).not.toMatch(/drop table|drop column|truncate|alter column/)
    expect(sql).not.toMatch(/delete from public\.(documents|profiles|project_assignments|certifications)/)
    expect(sql).not.toMatch(/update public\.(profiles|certifications) /)
    const droppedPolicies = [...sql.matchAll(/drop policy if exists "([^"]+)"/g)].map((m) => m[1])
    const createdPolicies = [...sql.matchAll(/create policy "([^"]+)"/g)].map((m) => m[1])
    expect(droppedPolicies.every((name) => createdPolicies.includes(name))).toBe(true)
  })

  it('leaves the existing document visibility and delete rules untouched', () => {
    expect(sql).not.toContain('function public.can_view_document_row')
    expect(sql).not.toContain('function public.can_modify_document_row')
    expect(sql).not.toContain('function public.list_profiles')
  })

  it('only adds nullable or defaulted columns', () => {
    const added = [...sql.matchAll(/add column if not exists (\w+) ([^,;]+)/g)].map((m) => m[2])
    expect(added.length).toBeGreaterThan(0)
    for (const definition of added) {
      expect(definition.includes('not null') ? definition.includes('default') : true).toBe(true)
    }
  })

  it('keeps Payment / ACH to Admin and the owner with a restrictive policy and a private bucket', () => {
    expect(sql).toContain(
      'create policy "payment documents only for admin and owner" on public.documents as restrictive for all to authenticated using (requirement_key is distinct from \'payment_ach\' or public.is_admin() or owner_id = auth.uid())',
    )
    expect(sql).toContain("values ('restricted-documents', 'restricted-documents', false)")
    expect(sql).toContain("(storage.foldername(name))[1] = auth.uid()::text or public.is_admin()")
    expect(sql).toContain("if v_doc.requirement_key = 'payment_ach' and not public.is_admin() then")
    expect(sql).toContain("(c.requirement_key <> 'payment_ach' or t.id = auth.uid() or public.is_admin())")
  })

  it('never counts Payment / ACH toward Ready to Work', () => {
    expect(sql).toContain("('payment_ach', 'payment / ach information', false, false, false, false,")
    expect(sql).toMatch(/when count\(\*\) filter \(where i\.required and i\.counts_toward_ready and i\.status in \('rejected', 'expired'\)\) > 0 then 'action_required'/)
  })

  it('subcontractors cannot set review fields or publish shared resources themselves', () => {
    expect(sql).toContain('create trigger documents_enforce_subcontractor_fields before insert or update on public.documents')
    expect(sql).toContain("raise exception 'only management can review documents'")
    expect(sql).toContain('if v_uid is null or not public.current_user_is_subcontractor() then')
    expect(sql).toMatch(/review_subcontractor_document.*not public\.has_management_role\(\)/)
  })

  it('shared resource files are readable only from management folders', () => {
    expect(sql).toContain("(storage.foldername(name))[2] = 'shared-subcontractors'")
    expect(sql).toContain('public.is_management_profile_text((storage.foldername(name))[1])')
  })

  it('work orders: only the assigned subcontractor, in order, and Start Work needs Ready to Work', () => {
    expect(sql).toContain("v_row.profile_id is distinct from auth.uid()")
    expect(sql).toContain("if v_ready is distinct from 'ready' then raise exception 'complete your setup before starting work'")
    expect(sql).toContain("check (work_status in ('assigned', 'in_progress', 'completed'))")
  })

  it('re-assigning a subcontractor starts a fresh work order', () => {
    expect(sql).toContain('create trigger project_assignments_reset_work_order before update on public.project_assignments')
    expect(sql).toContain("if new.is_active and not coalesce(old.is_active, false) then new.work_status := 'assigned';")
  })

  it('daily job also sends subcontractor expiration alerts, once per document', () => {
    expect(sql).toContain('subcontractor_alerts := public.notify_subcontractor_document_expirations();')
    expect(sql).toContain("n.entity_type = 'subcontractor_document_' || v_kind and n.entity_id = v_doc.id")
  })

  it('no HR / banking schema: payment information is a document only', () => {
    expect(sql).not.toMatch(/routing_number|account_number|bank_account|\bssn\b|\btin\b column/)
  })
})
