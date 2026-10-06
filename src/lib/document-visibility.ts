import type { DocumentCategory, DocumentRecord, Profile } from '@/types/database'
import { isClientRole, isManagementRole } from '@/lib/utils'

type Viewer = Pick<Profile, 'id' | 'role'> | null | undefined
type DocumentAccessFields = Pick<
  DocumentRecord,
  'owner_id' | 'uploaded_by' | 'project_id' | 'category' | 'mime_type' | 'team_visible'
>

const PRIVATE_IMAGE_CATEGORIES: DocumentCategory[] = [
  'contract',
  'license',
  'insurance',
  'identification',
  'certification',
]

/** Mirrors public.is_project_photo_document — photos stay visible to the assigned team. */
export function isProjectPhotoDocument(doc: Pick<DocumentRecord, 'category' | 'mime_type'>) {
  if (doc.category === 'work_photo') return true
  return Boolean(doc.mime_type?.toLowerCase().startsWith('image/')) && !PRIVATE_IMAGE_CATEGORIES.includes(doc.category)
}

function isOwnDocument(doc: Pick<DocumentRecord, 'owner_id' | 'uploaded_by'>, viewer: NonNullable<Viewer>) {
  return doc.owner_id === viewer.id || doc.uploaded_by === viewer.id
}

/**
 * Mirrors public.can_view_document_row for rows the API already returned (it cannot check
 * assignment). The database is the enforcement point; this keeps the UI fail-closed.
 */
export function canViewerSeeDocument(doc: DocumentAccessFields, viewer: Viewer) {
  if (!viewer) return false
  if (isManagementRole(viewer.role)) return true
  if (!doc.project_id) return isOwnDocument(doc, viewer)
  if (isProjectPhotoDocument(doc)) return true
  if (isClientRole(viewer.role)) return true
  return doc.team_visible === true
}

/** Mirrors public.can_modify_document_row: workers never remove project documents. */
export function canRemoveDocument(doc: DocumentAccessFields, viewer: Viewer) {
  if (!viewer) return false
  if (isManagementRole(viewer.role)) return true
  if (!isOwnDocument(doc, viewer)) return false
  if (!doc.project_id || isProjectPhotoDocument(doc)) return true
  return isClientRole(viewer.role)
}

/** Formal project documents come from management; clients keep their portal uploads. */
export function canUploadProjectDocuments(viewer: Viewer) {
  return isManagementRole(viewer?.role) || isClientRole(viewer?.role)
}

/** Mirrors the documents INSERT policy: workers add photos / field images to projects only. */
export function canCreateProjectFile(
  viewer: Viewer,
  file: Pick<DocumentRecord, 'project_id' | 'category' | 'mime_type'>,
) {
  if (!viewer) return false
  if (!file.project_id || canUploadProjectDocuments(viewer)) return true
  return Boolean(file.mime_type?.toLowerCase().startsWith('image/')) && isProjectPhotoDocument(file)
}

export const PROJECT_DOCUMENT_UPLOAD_DENIED =
  'Only management can upload documents to a project. You can upload photos.'

export function documentVisibilityLabel(teamVisible: boolean | undefined) {
  return teamVisible ? 'Visibility: Management, Client & Project Team' : 'Visibility: Management & Client'
}

export function documentVisibilityHelp(teamVisible: boolean | undefined) {
  return teamVisible
    ? 'Assigned project team members can view this document.'
    : 'Only authorized management and the client can view this document.'
}
