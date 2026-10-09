import { addDays, format } from 'date-fns'
import { canonicalProjectAddress, parseDateKey, toDateKey } from '@/features/schedule/schedule-links'
import { isProjectCoverEligible, isProjectPhotoDocument } from '@/lib/document-visibility'
import type { DocumentRecord, MyWorkScheduleItem, Project, ProjectStatus } from '@/types/database'

/** Employee-facing groups. Presentation only: "Open" is the not_started status. */
export type EmployeeStatus = 'open' | 'in_progress' | 'waiting' | 'completed'
export type StatusFilter = EmployeeStatus | 'all'
export type MyProjectsSort = 'next_visit' | 'name' | 'updated' | 'status'

const EMPLOYEE_STATUS: Record<ProjectStatus, EmployeeStatus> = {
  not_started: 'open',
  in_progress: 'in_progress',
  waiting: 'waiting',
  completed: 'completed',
}

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  completed: 'Completed',
}

export function employeeStatus(status: ProjectStatus): EmployeeStatus {
  return EMPLOYEE_STATUS[status]
}

export const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'completed', label: 'Completed' },
]

export function matchesStatus(view: MyProjectView, filter: StatusFilter) {
  return filter === 'all' || employeeStatus(view.project.status) === filter
}

export const SORT_OPTIONS: Array<{ value: MyProjectsSort; label: string }> = [
  { value: 'next_visit', label: 'Next visit (soonest)' },
  { value: 'name', label: 'Name' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'status', label: 'Status' },
]

const STATUS_ORDER: Record<ProjectStatus, number> = {
  in_progress: 0,
  not_started: 1,
  waiting: 2,
  completed: 3,
}

export type ProjectPhoto = Pick<
  DocumentRecord,
  'id' | 'project_id' | 'category' | 'mime_type' | 'storage_path' | 'created_at' | 'kind_label' | 'name'
>

/** explicit = chosen by management; work_photo / reference = automatic. */
export type CoverSource = 'explicit' | 'work_photo' | 'reference'

export type ProjectPhotoSummary = { count: number; cover: ProjectPhoto | null; coverSource: CoverSource | null }

export type MyProjectView = {
  project: Project
  address: string | null
  /** Upcoming visits for the signed-in worker, soonest first (today's finished visits excluded). */
  visits: MyWorkScheduleItem[]
  client: { name: string | null; phone: string | null } | null
  photos: ProjectPhotoSummary
}

function minutes(value: string) {
  const [h, m] = value.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

/** Upcoming visits per project. A visit today counts until its end time (open-ended: all day). */
export function upcomingVisitsByProject(items: MyWorkScheduleItem[], now: Date) {
  const todayKey = toDateKey(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const byProject = new Map<string, MyWorkScheduleItem[]>()
  const sorted = [...items].sort(
    (a, b) => a.work_date.localeCompare(b.work_date) || a.start_time.localeCompare(b.start_time),
  )
  for (const item of sorted) {
    if (item.work_date < todayKey) continue
    if (item.work_date === todayKey && item.end_time && minutes(item.end_time) <= nowMinutes) continue
    const list = byProject.get(item.project_id) ?? []
    list.push(item)
    byProject.set(item.project_id, list)
  }
  return byProject
}

/** File names that read like paperwork, not job-site photos (automatic cover only). */
const PAPERWORK_NAME =
  /(?:^|[^a-z])(receipts?|invoices?|recibos?|facturas?|estimates?|quotes?|breakdown|contracts?|agreements?|licen[cs]es?|insurance)(?:[^a-z]|$)/i
/** Photo labels that are rarely a good identifier (issues, misc. snapshots like paperwork). */
const WEAK_PHOTO_KINDS = new Set(['issue', 'other'])

/** Lower is better; null = never an automatic cover. */
function automaticCoverRank(photo: ProjectPhoto): number | null {
  if (!isProjectCoverEligible(photo) || PAPERWORK_NAME.test(photo.name ?? '')) return null
  if (photo.category !== 'work_photo') return 2
  return WEAK_PHOTO_KINDS.has((photo.kind_label ?? '').trim().toLowerCase()) ? 1 : 0
}

/**
 * Cover for one project: the management-chosen photo when it is still present and eligible,
 * else the newest eligible work photo (labelled Issue / Other last), else the newest eligible
 * reference / mockup image (project file). Null = branded fallback.
 */
export function selectProjectCover(
  photos: ProjectPhoto[],
  explicitId?: string | null,
): Pick<ProjectPhotoSummary, 'cover' | 'coverSource'> {
  if (explicitId) {
    const chosen = photos.find((photo) => photo.id === explicitId)
    if (chosen && isProjectCoverEligible(chosen)) return { cover: chosen, coverSource: 'explicit' }
  }
  let best: { photo: ProjectPhoto; rank: number } | null = null
  for (const photo of photos) {
    const rank = automaticCoverRank(photo)
    if (rank == null) continue
    if (!best || rank < best.rank || (rank === best.rank && photo.created_at > best.photo.created_at)) {
      best = { photo, rank }
    }
  }
  if (!best) return { cover: null, coverSource: null }
  return { cover: best.photo, coverSource: best.rank === 2 ? 'reference' : 'work_photo' }
}

/**
 * Photo count and cover per project, from rows the API returned. Only project photos count
 * (never documents, even image scans filed as contracts / IDs).
 */
export function summarizeProjectPhotos(rows: ProjectPhoto[], coverIds?: Map<string, string | null | undefined>) {
  const photosByProject = new Map<string, ProjectPhoto[]>()
  for (const row of rows) {
    if (!row.project_id || !isProjectPhotoDocument(row)) continue
    const list = photosByProject.get(row.project_id) ?? []
    list.push(row)
    photosByProject.set(row.project_id, list)
  }
  const byProject = new Map<string, ProjectPhotoSummary>()
  for (const [projectId, photos] of photosByProject) {
    byProject.set(projectId, { count: photos.length, ...selectProjectCover(photos, coverIds?.get(projectId)) })
  }
  return byProject
}

export function matchesSearch(view: MyProjectView, search: string) {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return [view.project.name, view.address, view.project.location, view.client?.name]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(needle))
}

export function statusCounts(views: MyProjectView[]) {
  const counts: Record<StatusFilter, number> = {
    all: views.length,
    open: 0,
    in_progress: 0,
    waiting: 0,
    completed: 0,
  }
  for (const view of views) counts[employeeStatus(view.project.status)] += 1
  return counts
}

function visitKey(view: MyProjectView) {
  const next = view.visits[0]
  return next ? `${next.work_date} ${next.start_time}` : null
}

export function sortProjects(views: MyProjectView[], sort: MyProjectsSort) {
  const byName = (a: MyProjectView, b: MyProjectView) =>
    a.project.name.localeCompare(b.project.name, undefined, { sensitivity: 'base' })
  return [...views].sort((a, b) => {
    switch (sort) {
      case 'name':
        return byName(a, b)
      case 'updated':
        return b.project.updated_at.localeCompare(a.project.updated_at) || byName(a, b)
      case 'status':
        return STATUS_ORDER[a.project.status] - STATUS_ORDER[b.project.status] || byName(a, b)
      default: {
        const ak = visitKey(a)
        const bk = visitKey(b)
        if (ak && bk) return ak.localeCompare(bk) || byName(a, b)
        if (ak) return -1
        if (bk) return 1
        return STATUS_ORDER[a.project.status] - STATUS_ORDER[b.project.status] || byName(a, b)
      }
    }
  })
}

export function buildProjectViews({
  projects,
  schedule,
  contacts,
  photos,
  now,
}: {
  projects: Project[]
  schedule: MyWorkScheduleItem[]
  contacts: Map<string, { name: string | null; phone: string | null }>
  photos: Map<string, ProjectPhotoSummary>
  now: Date
}): MyProjectView[] {
  const visits = upcomingVisitsByProject(schedule, now)
  return projects.map((project) => {
    const projectVisits = visits.get(project.id) ?? []
    const next = projectVisits[0]
    const contact = contacts.get(project.id)
    const client =
      contact && (contact.name || contact.phone)
        ? contact
        : next && (next.client_name || next.client_phone)
          ? { name: next.client_name, phone: next.client_phone }
          : null
    return {
      project,
      address: canonicalProjectAddress(project),
      visits: projectVisits,
      client,
      photos: photos.get(project.id) ?? { count: 0, cover: null, coverSource: null },
    }
  })
}

/** "Today, Oct 6" / "Tomorrow, Oct 7" / "Fri, Oct 9". */
export function visitDayLabel(workDate: string, now = new Date()) {
  const date = parseDateKey(workDate)
  if (workDate === toDateKey(now)) return `Today, ${format(date, 'MMM d')}`
  if (workDate === toDateKey(addDays(now, 1))) return `Tomorrow, ${format(date, 'MMM d')}`
  return format(date, 'EEE, MMM d')
}

/** The details accordion only renders when there is real secondary data to show. */
export function hasProjectDetails(view: MyProjectView, notesCount: number) {
  const next = view.visits[0]
  return Boolean(
    next?.task ||
      next?.notes ||
      (next && next.crew.length > 0) ||
      view.visits.length > 1 ||
      view.project.description?.trim() ||
      view.project.start_date ||
      view.project.deadline ||
      notesCount > 0,
  )
}

export function projectInitials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}
