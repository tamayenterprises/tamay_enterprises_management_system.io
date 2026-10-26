import { describe, expect, it } from 'vitest'
import { PROFILE_PRIVATE_FIELDS } from './profile-fields'

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Only this module may read the whole profiles table (fallback for databases without the migration). */
const FALLBACK_FILE = '/src/features/data/profile-list.ts'

describe('profile queries', () => {
  it('scans the application source', () => {
    expect(Object.keys(sources)).toContain('/src/features/data/people.ts')
    expect(Object.keys(sources)).toContain(FALLBACK_FILE)
    expect(Object.keys(sources).length).toBeGreaterThan(100)
  })

  it('never embeds whole profiles', () => {
    const offenders = Object.entries(sources)
      .filter(([, source]) => /profiles(![a-z_]+)?\(\*\)/.test(source))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })

  it('never selects * from profiles outside the migration fallback', () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => file !== FALLBACK_FILE)
      .filter(([, source]) => /from\('profiles'\)\s*\.select\('\*'\)/.test(source))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })

  it('never names a private field in a profiles embed or select', () => {
    const offenders: string[] = []
    for (const [file, source] of Object.entries(sources)) {
      const embeds = [
        ...source.matchAll(/profiles(?:![a-z_]+)?\(([^)]*)\)/g),
        ...source.matchAll(/from\('profiles'\)\s*\.select\(['`]([^'`]*)['`]/g),
      ]
      for (const [, columns] of embeds) {
        const named = columns.split(',').map((column) => column.trim())
        for (const field of PROFILE_PRIVATE_FIELDS) if (named.includes(field)) offenders.push(`${file}: ${field}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('does not ask for a row back after updating a profile', () => {
    const offenders = Object.entries(sources)
      .filter(([, source]) => /from\('profiles'\)[^;]*\.update\([^;]*\.select\(\)/.test(source))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})
