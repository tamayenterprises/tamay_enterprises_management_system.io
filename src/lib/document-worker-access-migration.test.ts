import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261001090000_project_document_worker_access.sql?raw'

const sql = migrationSql.toLowerCase().replace(/--.*$/gm, '').replace(/\s+/g, ' ')

function section(from: string, to: string) {
  const start = sql.indexOf(from)
  if (start < 0) throw new Error(`not found: ${from}`)
  return sql.slice(start, sql.indexOf(to, start + from.length))
}

const policy = (name: string) => section(`create policy "${name.toLowerCase()}"`, ' ); ')

describe('project document worker access migration', () => {
  it('is additive: no data changes', () => {
    expect(sql).not.toMatch(/\bupdate public\.documents\s+set\b|\bdelete from\b|\btruncate\b|\bdrop table\b|\bdrop column\b/)
  })

  it('uploaders no longer bypass team access on project documents', () => {
    const rule = section('function public.can_view_document_row', 'function public.can_modify_document_row')
    expect(rule).toContain('p_project_id is null and (p_owner_id = auth.uid() or p_uploaded_by = auth.uid())')
    expect(rule).toContain('coalesce(p_team_visible, false) and public.is_assigned_to_project(p_project_id)')
    expect(rule).toContain('public.current_user_is_client()')
    expect(rule).not.toContain('is_primary_client')
  })

  it('delete and update follow can_modify_document_row (workers cannot remove project documents)', () => {
    const modify = section('function public.can_modify_document_row', 'function public.storage_path_locked_for_current_user')
    expect(modify).toContain('p_project_id is null')
    expect(modify).toContain('public.is_project_photo_document(p_category, p_mime_type)')
    expect(modify).toContain('public.current_user_is_client()')
    expect(sql).toContain('drop policy if exists "owners uploaders or managers delete documents"')
    expect(sql).toContain('drop policy if exists "owners or managers update documents"')
    expect(policy('Users delete permitted documents')).toContain('public.can_modify_document_row(')
    expect(policy('Users update permitted documents')).toContain('public.can_modify_document_row(')
  })

  it('storage: own folder no longer bypasses visibility; overwrite/delete follow the edit rule', () => {
    const read = policy('Approved users read permitted storage')
    expect(read.match(/not public\.storage_path_hidden_from_current_user\(name\)/g)).toHaveLength(2)
    expect(policy('Users delete own or managed storage objects')).toContain('not public.storage_path_locked_for_current_user(name)')
    expect(policy('Users update own storage objects')).toContain('not public.storage_path_locked_for_current_user(name)')
  })

  it('uploads: assigned workers add photos only; management and clients keep document uploads', () => {
    expect(sql).toContain('drop policy if exists "approved users upload documents" on public.documents')
    const insert = policy('Approved users upload documents')
    expect(insert).toContain('on public.documents for insert')
    expect(insert).toContain('uploaded_by = auth.uid() and owner_id = auth.uid()')
    expect(insert).toContain('project_id is null or public.has_management_role()')
    expect(insert).toContain(
      "public.is_assigned_to_project(project_id) and ( public.current_user_is_client() or ( coalesce(mime_type, '') ilike 'image/%' and public.is_project_photo_document(category, mime_type) ) )",
    )
  })

  it('receipts are not touched', () => {
    expect(sql).not.toContain('project_receipts')
    expect(sql).not.toContain('project-finance')
  })
})
