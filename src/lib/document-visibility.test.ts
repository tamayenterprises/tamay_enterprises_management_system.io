import { describe, expect, it } from 'vitest'
import projectsSource from '../features/data/projects.ts?raw'
import {
  canCreateProjectFile,
  canRemoveDocument,
  canUploadProjectDocuments,
  canViewerSeeDocument,
  documentVisibilityHelp,
  documentVisibilityLabel,
  isProjectPhotoDocument,
} from './document-visibility'
import type { DocumentRecord, UserRole } from '@/types/database'

const as = (role: UserRole, id = `${role}-1`) => ({ id, role })
const projectDoc = (over: Partial<DocumentRecord> = {}) =>
  ({
    project_id: 'p1',
    category: 'project_file',
    mime_type: 'application/pdf',
    owner_id: 'admin-1',
    uploaded_by: 'admin-1',
    team_visible: false,
    ...over,
  }) as DocumentRecord

describe('upload rule (mirrors the documents INSERT policy)', () => {
  const file = (category: DocumentRecord['category'], mime: string | null, project_id: string | null = 'p1') => ({
    project_id,
    category,
    mime_type: mime,
  })

  it.each(['employee', 'subcontractor'] as const)('%s: project photos yes, formal documents no', (role) => {
    expect(canUploadProjectDocuments(as(role))).toBe(false)
    expect(canCreateProjectFile(as(role), file('work_photo', 'image/jpeg'))).toBe(true)
    expect(canCreateProjectFile(as(role), file('project_file', 'image/png'))).toBe(true)
    expect(canCreateProjectFile(as(role), file('project_file', 'application/pdf'))).toBe(false)
    expect(canCreateProjectFile(as(role), file('work_photo', 'application/pdf'))).toBe(false)
    expect(canCreateProjectFile(as(role), file('contract', 'image/jpeg'))).toBe(false)
    expect(canCreateProjectFile(as(role), file('project_file', null))).toBe(false)
    expect(canCreateProjectFile(as(role), file('certification', 'application/pdf', null))).toBe(true)
  })

  it.each(['admin', 'project_manager', 'client'] as const)('%s: documents and photos', (role) => {
    expect(canUploadProjectDocuments(as(role))).toBe(true)
    expect(canCreateProjectFile(as(role), file('project_file', 'application/pdf'))).toBe(true)
    expect(canCreateProjectFile(as(role), file('work_photo', 'image/jpeg'))).toBe(true)
  })

  it('signed-out: nothing', () => {
    expect(canCreateProjectFile(null, file('work_photo', 'image/jpeg'))).toBe(false)
  })
})

describe('canViewerSeeDocument', () => {
  it('workers see a project document only while it is shared, even their own upload', () => {
    for (const role of ['employee', 'subcontractor'] as const) {
      expect(canViewerSeeDocument(projectDoc(), as(role))).toBe(false)
      expect(canViewerSeeDocument(projectDoc({ team_visible: true }), as(role))).toBe(true)
      expect(
        canViewerSeeDocument(projectDoc({ owner_id: `${role}-1`, uploaded_by: `${role}-1` }), as(role)),
      ).toBe(false)
    }
  })

  it('management and clients keep their access; photos stay with the team', () => {
    expect(canViewerSeeDocument(projectDoc(), as('admin'))).toBe(true)
    expect(canViewerSeeDocument(projectDoc(), as('project_manager'))).toBe(true)
    expect(canViewerSeeDocument(projectDoc(), as('client'))).toBe(true)
    expect(canViewerSeeDocument(projectDoc({ category: 'work_photo', mime_type: 'image/jpeg' }), as('employee'))).toBe(true)
  })

  it('personal files stay with their owner; no profile means nothing', () => {
    const personal = projectDoc({ project_id: null, owner_id: 'employee-1', uploaded_by: 'employee-1' })
    expect(canViewerSeeDocument(personal, as('employee'))).toBe(true)
    expect(canViewerSeeDocument(personal, as('employee', 'someone-else'))).toBe(false)
    expect(canViewerSeeDocument(projectDoc({ team_visible: true }), null)).toBe(false)
  })
})

describe('canRemoveDocument', () => {
  it('workers never remove project documents, shared or not, own or not', () => {
    for (const role of ['employee', 'subcontractor'] as const) {
      const own = { owner_id: `${role}-1`, uploaded_by: `${role}-1` }
      expect(canRemoveDocument(projectDoc(own), as(role))).toBe(false)
      expect(canRemoveDocument(projectDoc({ ...own, team_visible: true }), as(role))).toBe(false)
      expect(canRemoveDocument(projectDoc({ team_visible: true }), as(role))).toBe(false)
    }
  })

  it('management removes anything; clients only their own uploads', () => {
    expect(canRemoveDocument(projectDoc(), as('admin'))).toBe(true)
    expect(canRemoveDocument(projectDoc(), as('project_manager'))).toBe(true)
    expect(canRemoveDocument(projectDoc(), as('client'))).toBe(false)
    expect(canRemoveDocument(projectDoc({ owner_id: 'client-1', uploaded_by: 'client-1' }), as('client'))).toBe(true)
  })

  it('owners keep removing their own photos and personal files', () => {
    const own = { owner_id: 'employee-1', uploaded_by: 'employee-1' }
    expect(canRemoveDocument(projectDoc({ ...own, category: 'work_photo', mime_type: 'image/jpeg' }), as('employee'))).toBe(true)
    expect(canRemoveDocument(projectDoc({ ...own, project_id: null }), as('employee'))).toBe(true)
    expect(canRemoveDocument(projectDoc({ category: 'work_photo', mime_type: 'image/jpeg' }), as('employee'))).toBe(false)
  })
})

describe('isProjectPhotoDocument', () => {
  it('keeps work photos, mockups and inspiration images with the team', () => {
    expect(isProjectPhotoDocument({ category: 'work_photo', mime_type: 'image/jpeg' })).toBe(true)
    expect(isProjectPhotoDocument({ category: 'project_file', mime_type: 'image/png' })).toBe(true)
    expect(isProjectPhotoDocument({ category: 'work_photo', mime_type: null })).toBe(true)
  })

  it('treats PDFs, spreadsheets and images filed as contracts or IDs as documents', () => {
    expect(isProjectPhotoDocument({ category: 'project_file', mime_type: 'application/pdf' })).toBe(false)
    expect(
      isProjectPhotoDocument({
        category: 'project_file',
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ).toBe(false)
    expect(isProjectPhotoDocument({ category: 'contract', mime_type: 'image/jpeg' })).toBe(false)
    expect(isProjectPhotoDocument({ category: 'identification', mime_type: 'image/png' })).toBe(false)
  })
})

describe('visibility copy', () => {
  it('matches the approved wording', () => {
    expect(documentVisibilityLabel(false)).toBe('Visibility: Management & Client')
    expect(documentVisibilityLabel(true)).toBe('Visibility: Management, Client & Project Team')
    expect(documentVisibilityHelp(false)).toBe('Only authorized management and the client can view this document.')
    expect(documentVisibilityHelp(true)).toBe('Assigned project team members can view this document.')
  })
})

describe('project thread notice', () => {
  it('never puts document names in the team-visible conversation', () => {
    expect(projectsSource).not.toContain('Shared a document: ')
    expect(projectsSource).toContain("count === 1 ? 'Shared a document' : `Shared ${count} documents`")
  })
})
