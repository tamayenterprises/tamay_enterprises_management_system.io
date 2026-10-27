import { describe, expect, it } from 'vitest'
import { adminDirectoryFromSearch, writeAdminDirectoryParams } from './admin-directory-filters'

describe('admin directory filters', () => {
  it('reads the role search from the address bar', () => {
    expect(adminDirectoryFromSearch('?role=project_manager&q=cherry')).toEqual({
      search: 'cherry',
      roleFilter: 'project_manager',
      approvalFilter: 'all',
      showArchived: false,
    })
  })

  it('keeps other filters when updating one value', () => {
    const params = writeAdminDirectoryParams(new URLSearchParams('role=project_manager'), {
      search: 'thomas',
    })
    expect(params.get('role')).toBe('project_manager')
    expect(params.get('q')).toBe('thomas')
  })
})
