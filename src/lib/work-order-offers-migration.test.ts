import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261106010000_work_order_offers_documents.sql?raw'

const sql = migrationSql.toLowerCase().replace(/--.*$/gm, '').replace(/\s+/g, ' ')

function functionBody(name: string) {
  const start = sql.indexOf(`function public.${name}(`)
  expect(start).toBeGreaterThan(-1)
  const open = sql.indexOf('$$', start)
  return sql.slice(open, sql.indexOf('$$', open + 2))
}

describe('work order offers / documents migration', () => {
  it('is additive: no tables or columns dropped, no data deleted, only work order tables touched', () => {
    expect(sql).not.toMatch(/drop table|drop column|truncate|delete from/)
    expect(sql).not.toMatch(/alter table public\.(projects|profiles|project_assignments|documents|notifications)/)
    const created = [...sql.matchAll(/create policy "([^"]+)"/g)].map((m) => m[1])
    const dropped = [...sql.matchAll(/drop policy if exists "([^"]+)"/g)].map((m) => m[1])
    expect(dropped.every((name) => created.includes(name))).toBe(true)
    expect(created.every((name) => name.includes('work order'))).toBe(true)
  })

  it('offers: only management sends; anonymous has no access; subcontractors see their own offers', () => {
    expect(sql).toContain('revoke all on public.work_order_offers from anon, authenticated')
    expect(sql).toContain('grant select on public.work_order_offers to authenticated')
    expect(sql).not.toMatch(/on public\.work_order_offers for (insert|update|delete|all)/)
    expect(functionBody('send_work_order_offers')).toContain('only management can offer this work order')
  })

  it('offered subcontractors read the work order and Tamay documents only — not updates or subcontractor documents', () => {
    expect(sql).toContain("(kind = 'reference' and public.has_open_work_order_offer(work_order_id))")
    expect(sql).toContain("(storage.foldername(name))[2] = 'reference' and public.has_open_work_order_offer")
    expect(sql).not.toMatch(/work_order_updates.*has_open_work_order_offer/)
    expect(functionBody('has_open_work_order_offer')).toContain("o.status = 'pending' and w.status = 'offered'")
  })

  it('accepting is formal and first-come: agreement required, other offers close', () => {
    const body = functionBody('respond_to_work_order')
    expect(body).toContain('confirm that you agree')
    expect(body).toContain('for update')
    expect(body).toContain('accepted_by = auth.uid()')
    expect(body).toContain('acceptance_statement = c_statement')
    expect(body).toContain("update public.work_order_offers set status = 'closed'")
    expect(body).toContain('this work order is no longer available')
  })

  it('the subcontractor is never changed by editing', () => {
    expect(functionBody('prepare_work_order')).toContain('to change the subcontractor, close this work order and create a new one')
  })

  it('Start Work requires Ready to Work and, when required, an approved insurance certificate', () => {
    const body = functionBody('update_work_order_status')
    expect(body).toContain("v_ready is distinct from 'ready'")
    expect(body).toContain("v_row.insurance_required and not exists")
    expect(body).toContain("f.category = 'insurance' and f.review_status = 'approved'")
    expect(body).not.toContain("p_action = 'accept'")
  })

  it('subcontractor documents go through a function; only management reviews insurance', () => {
    const submit = functionBody('submit_work_order_document')
    expect(submit).toContain('v_row.subcontractor_id is distinct from auth.uid()')
    expect(submit).toContain("p_category not in ('insurance', 'permit', 'receipt', 'other')")
    expect(submit).toContain("p_path not like v_row.id::text || '/subcontractor/%'")
    expect(submit).toContain("case when p_category = 'insurance' then 'submitted' end")
    const review = functionBody('review_work_order_document')
    expect(review).toContain('public.can_manage_work_order(v_file.work_order_id)')
    expect(review).toContain("v_file.category is distinct from 'insurance'")
  })

  it('every function pins search_path and none is callable by anonymous visitors', () => {
    const definers = sql.split('create or replace function').slice(1)
    for (const part of definers) expect(part).toContain('set search_path = public')
    for (const name of ['send_work_order_offers', 'respond_to_work_order', 'update_work_order_status', 'submit_work_order_document', 'review_work_order_document', 'has_open_work_order_offer']) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon`))
    }
  })
})
