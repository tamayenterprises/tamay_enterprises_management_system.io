import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261007090000_project_cover_photo.sql?raw'

const sql = migrationSql.toLowerCase().replace(/--.*$/gm, '').replace(/\s+/g, ' ')

function section(from: string, to: string) {
  const start = sql.indexOf(from)
  if (start < 0) throw new Error(`not found: ${from}`)
  return sql.slice(start, sql.indexOf(to, start + from.length))
}

describe('project cover photo migration', () => {
  it('is additive: one nullable column, no data changes', () => {
    expect(sql).toContain('alter table public.projects add column if not exists cover_photo_document_id uuid;')
    expect(sql).not.toMatch(/\bupdate public\.\w+\s+set\b|\bdelete from\b|\btruncate\b|\bdrop table\b|\bdrop column\b|not null/)
  })

  it('CASE 7/8: only management can set or clear the cover, enforced in a trigger (covers direct API updates)', () => {
    const fn = section('function public.enforce_project_cover_photo()', '$$; revoke')
    expect(fn).toContain('security definer')
    expect(fn).toContain('if not public.has_management_role() then raise exception')
    expect(fn).toContain("errcode = '42501'")
    expect(sql).toContain('before insert or update of cover_photo_document_id on public.projects')
    expect(sql).toContain('execute function public.enforce_project_cover_photo()')
  })

  it('CASE 6: the cover must belong to the same project', () => {
    const fn = section('function public.enforce_project_cover_photo()', '$$; revoke')
    expect(fn).toContain('v_doc.project_id is distinct from new.id')
  })

  it('CASE 5: receipts, formal documents and private categories can never be a cover', () => {
    const rule = section('function public.is_project_cover_eligible(', '$$; create or replace function')
    expect(rule).toContain("coalesce(p_mime_type, '') ilike 'image/%'")
    expect(rule).toContain("p_category in ('work_photo', 'project_file')")
    for (const label of ['project breakdown', 'agreement', 'receipt', 'estimate', 'contract', 'warranty']) {
      expect(rule).toContain(`'${label}'`)
    }
    const fn = section('function public.enforce_project_cover_photo()', '$$; revoke')
    expect(fn).toContain('public.is_project_cover_eligible(v_doc.category, v_doc.mime_type, v_doc.kind_label)')
  })

  it('no foreign key: removing a photo never fails because it is the cover', () => {
    expect(sql).not.toMatch(/references public\.documents/)
  })
})
