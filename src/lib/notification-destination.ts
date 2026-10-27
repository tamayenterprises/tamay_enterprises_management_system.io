import { isManagementRole } from '@/lib/utils'
import type { UserRole } from '@/types/database'

export type NotificationLinkSource = {
  destination_route?: string | null
  link?: string | null
  entity_type?: string | null
  entity_id?: string | null
  parent_entity_id?: string | null
  project_id?: string | null
  activity_type?: string | null
}

function applyQuery(path: string, extra: Record<string, string | undefined>) {
  const hashIndex = path.indexOf('#')
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : ''
  const withoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path
  const qIndex = withoutHash.indexOf('?')
  const pathname = qIndex >= 0 ? withoutHash.slice(0, qIndex) : withoutHash
  const params = new URLSearchParams(qIndex >= 0 ? withoutHash.slice(qIndex + 1) : '')
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value)
  }
  const qs = params.toString()
  return `${pathname}${qs ? `?${qs}` : ''}${hash}`
}

function isCompanyUpdate(item: NotificationLinkSource) {
  return (
    item.entity_type === 'company_update' ||
    Boolean(item.activity_type?.startsWith('COMPANY_UPDATE'))
  )
}

function isProjectNote(item: NotificationLinkSource) {
  return (
    item.entity_type === 'project_note' ||
    item.activity_type === 'COMMENT_CREATED' ||
    item.activity_type === 'COMMENT_REPLIED' ||
    item.activity_type === 'PHOTO_UPLOADED' ||
    item.activity_type === 'USER_MENTIONED'
  )
}

function isProjectDocument(item: NotificationLinkSource) {
  return item.entity_type === 'document' || item.activity_type === 'FILE_UPLOADED'
}

export function documentDeleteRequestMeta(item: {
  entity_type?: string | null
  entity_id?: string | null
  metadata?: Record<string, unknown> | null
}) {
  if (item.entity_type !== 'document_delete_request') return null
  const requestId =
    typeof item.metadata?.request_id === 'string'
      ? item.metadata.request_id
      : (item.entity_id ?? null)
  const status = typeof item.metadata?.status === 'string' ? item.metadata.status : 'pending'
  const reason = typeof item.metadata?.reason === 'string' ? item.metadata.reason : ''
  return { requestId, status, reason }
}

export function isPendingDocumentDeleteRequest(item: {
  entity_type?: string | null
  metadata?: Record<string, unknown> | null
}) {
  return documentDeleteRequestMeta(item)?.status === 'pending'
}

/** Open the exact update, reply, or file the notification is about. */
export function notificationDestination(
  item: NotificationLinkSource,
  options?: { client?: boolean },
): string | null {
  let route = item.destination_route || item.link || ''
  const entityId = item.entity_id ?? undefined
  const parentId = item.parent_entity_id ?? undefined

  if (isCompanyUpdate(item) && entityId) {
    const rootId = parentId || entityId
    const base = route.includes('/updates') ? route : '/updates'
    route = applyQuery(base, {
      tab: 'company',
      update: rootId,
      reply: parentId ? entityId : undefined,
    })
  } else if (isProjectNote(item) && entityId) {
    const base =
      route.startsWith('/projects/') || route.startsWith('/portal/projects/')
        ? route
        : item.project_id
          ? `/projects/${item.project_id}`
          : route
    if (base) {
      route = applyQuery(base, {
        update: entityId,
        parent: parentId,
      })
    }
  } else if (isProjectDocument(item) && entityId) {
    const base =
      route.startsWith('/projects/') || route.startsWith('/portal/projects/')
        ? route
        : item.project_id
          ? `/projects/${item.project_id}`
          : route
    if (base) {
      route = applyQuery(base, { tab: 'files', doc: entityId })
    }
  }

  if (!route) return null
  if (options?.client && route.startsWith('/projects/')) {
    route = route.replace('/projects/', '/portal/projects/')
  }
  return route
}

const MANAGEMENT_ATTENDANCE_TYPES = new Set([
  'ATTENDANCE_EXCEPTION_SUBMITTED',
  'ATTENDANCE_REJECTED',
  'ATTENDANCE_CORRECTED',
])

/** Clock-in exceptions are for management review. Workers only see their own mentioned outcome. */
export function notificationVisibleToRole(
  item: {
    activity_type?: string | null
    entity_type?: string | null
    relevance?: string | null
    link?: string | null
    destination_route?: string | null
  },
  role?: UserRole | null,
) {
  if (isManagementRole(role)) return true
  const type = item.activity_type ?? ''
  if (MANAGEMENT_ATTENDANCE_TYPES.has(type) && item.relevance !== 'mentioned') return false
  if (item.entity_type === 'attendance_exception' && item.relevance !== 'mentioned') return false
  const dest = item.destination_route || item.link || ''
  if (dest.includes('/timesheets') && item.relevance !== 'mentioned') return false
  return true
}
