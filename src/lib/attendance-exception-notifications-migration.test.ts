import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261026230000_attendance_exception_notifications_management.sql?raw'

const sql = migrationSql.toLowerCase()

describe('attendance exception notification migration', () => {
  it('does not treat clock-in exceptions as crew-wide requires-attention', () => {
    expect(sql).toContain("coalesce(p_entity_type, '') is distinct from 'attendance_exception'")
    expect(sql).toContain("'attendance_exception_submitted', 'attendance_rejected', 'attendance_corrected'")
    expect(sql).toContain("and v_recipient_role = 'project_manager'")
    expect(sql).toContain("if v_recipient_role = 'admin' then")
  })

  it('clears leaked exception rows from worker inboxes', () => {
    expect(sql).toContain("p.role not in ('admin', 'project_manager')")
    expect(sql).toContain("n.entity_type = 'attendance_exception'")
    expect(sql).toContain("coalesce(n.relevance::text, 'general') is distinct from 'mentioned'")
  })
})
