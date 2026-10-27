import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261027020000_document_delete_requests.sql?raw'

const sql = migrationSql.toLowerCase()

describe('document delete request migration', () => {
  it('stores a reason and waits for admin review', () => {
    expect(sql).toContain('create table if not exists public.document_delete_requests')
    expect(sql).toContain('reason text not null')
    expect(sql).toContain("status text not null default 'pending'")
    expect(sql).toContain('create or replace function public.request_document_delete')
    expect(sql).toContain('create or replace function public.review_document_delete')
    expect(sql).toContain('security definer')
    expect(sql).toContain('only an admin can approve document deletion')
    expect(sql).toContain("entity_type, entity_id, relevance, priority")
    expect(sql).toContain("'document_delete_request'")
    expect(sql).toContain('grant execute on function public.request_document_delete')
    expect(sql).toContain('grant execute on function public.review_document_delete')
  })
})
