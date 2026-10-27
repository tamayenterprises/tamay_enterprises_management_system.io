import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/20261027010000_certification_created_by.sql?raw'

const sql = migrationSql.toLowerCase().replace(/--.*$/gm, '').replace(/\s+/g, ' ')

describe('certification created_by migration', () => {
  it('adds created_by and stamps it from the inserting user', () => {
    expect(sql).toContain('add column if not exists created_by')
    expect(sql).toContain('new.created_by := auth.uid()')
    expect(sql).toContain('before insert on public.certifications')
  })
})
