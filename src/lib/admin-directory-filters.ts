const ROLES = ['admin', 'project_manager', 'employee', 'subcontractor', 'client'] as const
const APPROVALS = ['pending', 'approved', 'rejected'] as const

export function adminDirectoryFromSearch(search: string) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const role = params.get('role') ?? 'all'
  const approval = params.get('approval') ?? 'all'
  return {
    search: params.get('q') ?? '',
    roleFilter: ROLES.includes(role as (typeof ROLES)[number]) ? role : 'all',
    approvalFilter: APPROVALS.includes(approval as (typeof APPROVALS)[number]) ? approval : 'all',
    showArchived: params.get('archived') === '1',
  }
}

export function writeAdminDirectoryParams(
  current: URLSearchParams,
  next: {
    search?: string
    roleFilter?: string
    approvalFilter?: string
    showArchived?: boolean
  },
) {
  const params = new URLSearchParams(current)
  const setOrDelete = (key: string, value: string | undefined, empty: string) => {
    if (!value || value === empty) params.delete(key)
    else params.set(key, value)
  }
  if ('search' in next) setOrDelete('q', next.search?.trim() ?? '', '')
  if ('roleFilter' in next) setOrDelete('role', next.roleFilter, 'all')
  if ('approvalFilter' in next) setOrDelete('approval', next.approvalFilter, 'all')
  if ('showArchived' in next) {
    if (next.showArchived) params.set('archived', '1')
    else params.delete('archived')
  }
  return params
}

export const ADMIN_DIRECTORY_SCROLL_PARAMS = ['q', 'role', 'approval', 'archived'] as const
