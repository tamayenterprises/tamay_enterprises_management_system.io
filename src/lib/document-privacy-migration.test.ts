import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261001080000_project_document_team_visibility.sql?raw'

const sql = migrationSql.toLowerCase().replace(/--.*$/gm, '')

function policy(name: string) {
  const start = sql.indexOf(`create policy "${name.toLowerCase()}"`)
  if (start < 0) throw new Error(`policy not found: ${name}`)
  return sql.slice(start, sql.indexOf(');', start))
}

describe('project document privacy migration', () => {
  it('adds team_visible defaulting to off and modifies no existing rows', () => {
    expect(sql).toContain('add column if not exists team_visible boolean not null default false')
    expect(sql).not.toMatch(/\bupdate public\.documents\b|\bdelete from\b|\btruncate\b|\bdrop table\b|\bdrop column\b/)
  })

  it('enforces visibility in the documents SELECT policy, not just the UI', () => {
    expect(policy('Users view permitted documents')).toContain(
      'public.can_view_document_row(owner_id, uploaded_by, project_id, category, mime_type, team_visible)',
    )
    const rule = sql.slice(sql.indexOf('function public.can_view_document_row'), sql.indexOf('function public.document_hidden_from_current_user'))
    expect(rule).toContain('public.has_management_role()')
    expect(rule).toContain('public.is_assigned_to_project(p_project_id)')
    expect(rule).toContain('public.is_project_photo_document(p_category, p_mime_type)')
    expect(rule).toContain("viewer.role = 'client'")
    expect(rule).not.toContain('is_primary_client')
  })

  it('blocks signed URLs / downloads for hidden documents in project-files storage', () => {
    const storage = policy('Approved users read permitted storage')
    expect(storage).toContain("bucket_id = 'project-files'")
    expect(storage).toContain('not public.storage_path_hidden_from_current_user(name)')
    expect(storage).not.toMatch(/bucket_id = 'project-finance'/)
  })

  it('hides private document activity and notifications from workers', () => {
    expect(policy('Users view permitted activity events')).toContain('not public.document_hidden_from_current_user(entity_id)')
    expect(policy('Users view own notifications')).toContain('recipient_id = auth.uid()')
    expect(policy('Users view own notifications')).toContain('not public.document_hidden_from_current_user(entity_id)')
  })

  it('only management can change team access, and changes are logged without notifications', () => {
    expect(sql).toContain('only management can change project team access')
    expect(sql).toContain("'project team access enabled for ' || new.name")
    expect(sql).toContain("'project team access disabled for ' || new.name")
    const audit = sql.slice(sql.indexOf('function public.trg_document_team_visible_activity'), sql.indexOf('drop trigger if exists documents_team_visible_activity'))
    expect(audit).not.toContain('emit_project_activity')
    expect(audit).not.toContain('notifications')
  })
})
