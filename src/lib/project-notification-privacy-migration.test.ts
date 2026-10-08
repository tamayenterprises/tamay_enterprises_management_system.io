import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261008020000_project_notification_privacy.sql?raw'

const sql = migrationSql.toLowerCase()

describe('project notification privacy migration', () => {
  it('notifies only assigned people and admins', () => {
    expect(sql).toContain('create or replace function public.can_receive_project_notifications')
    expect(sql).toContain("p.role = 'admin'")
    expect(sql).toContain('from public.project_assignments pa')
    expect(sql).not.toContain("p.role in ('admin', 'project_manager')")
    expect(sql).toContain('if not public.can_receive_project_notifications(v_recipient, p_project_id)')
  })

  it('does not fan project conversation to unassigned project managers', () => {
    expect(sql).toContain("if v_recipient_role = 'admin' then")
    expect(sql).not.toContain("if v_recipient_role in ('admin', 'project_manager') then")
    expect(sql).not.toContain("v_relevance := 'not_involved'")
  })

  it('hides other projects in the activity feed except for admins', () => {
    expect(sql).toContain('drop policy if exists "users view permitted activity events"')
    expect(sql).toContain('public.is_admin()')
    expect(sql).toContain('public.is_assigned_to_project(project_id)')
  })

  it('clears leaked project notification rows', () => {
    expect(sql).toContain('delete from public.notifications n')
    expect(sql).toContain("coalesce(n.metadata->>'scope', 'project') = 'project'")
  })
})
