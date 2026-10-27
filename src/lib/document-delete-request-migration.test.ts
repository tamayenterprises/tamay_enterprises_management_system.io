import { describe, expect, it } from 'vitest'
import baseSql from '../../supabase/migrations/20261027020000_document_delete_requests.sql?raw'
import followUpSql from '../../supabase/migrations/20261027030000_certification_and_all_document_delete_requests.sql?raw'

const sql = `${baseSql}\n${followUpSql}`.toLowerCase()

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
    expect(sql).toContain('create or replace function public.request_certification_delete')
    expect(sql).toContain('add column if not exists certification_id')
    expect(sql).toContain("'pending: delete '")
    expect(sql).toContain("jsonb_build_object('status', v_status)")
  })
})
