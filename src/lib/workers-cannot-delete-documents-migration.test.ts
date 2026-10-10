import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261010180000_workers_cannot_delete_documents.sql?raw'

const sql = migrationSql.toLowerCase().replace(/--.*$/gm, '').replace(/\s+/g, ' ')

describe('workers cannot delete documents migration', () => {
  it('replaces can_modify_document_row without changing rows', () => {
    expect(sql).toContain('create or replace function public.can_modify_document_row')
    expect(sql).not.toMatch(/\bupdate public\.documents\s+set\b|\bdelete from\b|\btruncate\b|\bdrop table\b/)
  })

  it('lets management and clients modify; not employees or subcontractors', () => {
    expect(sql).toContain('public.has_management_role()')
    expect(sql).toContain('public.current_user_is_client()')
    expect(sql).toContain('p_owner_id = auth.uid() or p_uploaded_by = auth.uid()')
    expect(sql).not.toContain('public.is_project_photo_document')
  })
})
