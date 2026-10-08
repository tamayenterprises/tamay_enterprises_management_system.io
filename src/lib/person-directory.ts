export type PersonDirectoryFilter = 'all' | 'active' | 'inactive' | 'removed'

export const PERSON_DIRECTORY_FILTERS: Array<{ value: PersonDirectoryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'removed', label: 'Removed' },
]

export function matchesPersonDirectoryFilter(
  person: { is_active: boolean; archived_at: string | null },
  filter: PersonDirectoryFilter,
) {
  const removed = Boolean(person.archived_at)
  if (filter === 'all') return true
  if (filter === 'removed') return removed
  if (filter === 'active') return person.is_active && !removed
  return !person.is_active && !removed
}

export function personDirectoryEmptyTitle(noun: string, filter: PersonDirectoryFilter) {
  if (filter === 'active') return `No active ${noun}`
  if (filter === 'inactive') return `No inactive ${noun}`
  if (filter === 'removed') return `No removed ${noun}`
  return `No ${noun} found`
}
