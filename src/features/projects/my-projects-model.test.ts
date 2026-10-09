import { describe, expect, it } from 'vitest'
import {
  EMPLOYEE_STATUS_LABEL,
  STATUS_FILTERS,
  buildProjectViews,
  employeeStatus,
  hasProjectDetails,
  matchesStatus,
  selectProjectCover,
  matchesSearch,
  projectInitials,
  sortProjects,
  statusCounts,
  summarizeProjectPhotos,
  upcomingVisitsByProject,
  visitDayLabel,
  type MyProjectView,
  type ProjectPhoto,
} from './my-projects-model'
import type { MyWorkScheduleItem, Project } from '@/types/database'

const now = new Date(2026, 9, 6, 12, 0) // Tue Oct 6 2026, noon

const project = (over: Partial<Project> = {}) =>
  ({
    id: 'p1',
    name: 'Kim Bathroom',
    description: null,
    location: null,
    job_site_address: '12 Oak St, Stamford CT',
    latitude: null,
    longitude: null,
    status: 'in_progress',
    start_date: null,
    deadline: null,
    updated_at: '2026-10-01T10:00:00Z',
    ...over,
  }) as Project

const visit = (over: Partial<MyWorkScheduleItem> = {}) =>
  ({
    entry_id: crypto.randomUUID(),
    work_date: '2026-10-07',
    start_time: '08:00:00',
    end_time: '16:00:00',
    task: 'Tile shower walls',
    notes: null,
    project_id: 'p1',
    project_name: 'Kim Bathroom',
    project_address: null,
    project_latitude: null,
    project_longitude: null,
    client_name: 'Ana Kim',
    client_phone: '2035551234',
    crew: [],
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  }) as MyWorkScheduleItem

const photo = (over: Partial<ProjectPhoto> = {}) =>
  ({
    id: crypto.randomUUID(),
    project_id: 'p1',
    category: 'work_photo',
    mime_type: 'image/jpeg',
    storage_path: 'x.jpg',
    created_at: '2026-10-01T10:00:00Z',
    ...over,
  }) as ProjectPhoto

const view = (over: Partial<MyProjectView> = {}): MyProjectView => ({
  project: project(),
  address: '12 Oak St, Stamford CT',
  visits: [],
  client: null,
  photos: { count: 0, cover: null, coverSource: null },
  ...over,
})

describe('upcomingVisitsByProject', () => {
  it('keeps today until the visit ends and drops past days', () => {
    const map = upcomingVisitsByProject(
      [
        visit({ work_date: '2026-10-05' }),
        visit({ work_date: '2026-10-06', start_time: '07:00:00', end_time: '11:00:00' }),
        visit({ work_date: '2026-10-06', start_time: '13:00:00', end_time: '17:00:00', task: 'later today' }),
        visit({ work_date: '2026-10-08', task: 'Thursday' }),
      ],
      now,
    )
    expect(map.get('p1')?.map((v) => v.task)).toEqual(['later today', 'Thursday'])
  })

  it('an open-ended visit today still counts', () => {
    const map = upcomingVisitsByProject([visit({ work_date: '2026-10-06', start_time: '07:00:00', end_time: null })], now)
    expect(map.get('p1')).toHaveLength(1)
  })
})

describe('summarizeProjectPhotos', () => {
  it('counts only project photos — never documents or private image scans', () => {
    const map = summarizeProjectPhotos([
      photo(),
      photo({ category: 'project_file', mime_type: 'image/png' }),
      photo({ category: 'contract', mime_type: 'image/jpeg' }),
      photo({ category: 'identification', mime_type: 'image/png' }),
      photo({ category: 'project_file', mime_type: 'application/pdf' }),
    ])
    expect(map.get('p1')?.count).toBe(2)
  })

  it('cover is the newest work photo, else the newest mockup / reference image', () => {
    const oldWork = photo({ created_at: '2026-09-01T00:00:00Z' })
    const newWork = photo({ created_at: '2026-10-02T00:00:00Z' })
    const newestMockup = photo({ category: 'project_file', mime_type: 'image/png', created_at: '2026-10-03T00:00:00Z' })
    expect(summarizeProjectPhotos([oldWork, newestMockup, newWork]).get('p1')?.cover?.id).toBe(newWork.id)
    expect(summarizeProjectPhotos([newestMockup]).get('p1')?.cover?.id).toBe(newestMockup.id)
  })
})

describe('selectProjectCover (project cover photo)', () => {
  const site = photo({ name: 'IMG_2041.jpg', kind_label: 'Progress', created_at: '2026-10-01T00:00:00Z' })
  const chosen = photo({ name: 'front-elevation.jpg', created_at: '2026-09-01T00:00:00Z' })
  const mockup = photo({ category: 'project_file', mime_type: 'image/png', name: 'design.png', created_at: '2026-10-05T00:00:00Z' })

  it('CASE 1: no explicit cover → the latest eligible work photo', () => {
    expect(selectProjectCover([chosen, site, mockup])).toEqual({ cover: site, coverSource: 'work_photo' })
  })

  it('CASE 2: an explicit cover wins over newer work photos', () => {
    expect(selectProjectCover([chosen, site, mockup], chosen.id)).toEqual({ cover: chosen, coverSource: 'explicit' })
  })

  it('CASE 3: a newer work photo uploaded afterwards does not replace the explicit cover', () => {
    const newer = photo({ name: 'IMG_9999.jpg', created_at: '2026-10-07T09:00:00Z' })
    expect(selectProjectCover([newer, chosen, site], chosen.id).cover?.id).toBe(chosen.id)
    const map = summarizeProjectPhotos([newer, chosen, site], new Map([['p1', chosen.id]]))
    expect(map.get('p1')).toMatchObject({ count: 3, coverSource: 'explicit', cover: { id: chosen.id } })
  })

  it('CASE 4: explicit cover cleared (or its photo removed) → automatic selection resumes', () => {
    expect(selectProjectCover([chosen, site], null).cover?.id).toBe(site.id)
    expect(selectProjectCover([site], chosen.id)).toEqual({ cover: site, coverSource: 'work_photo' })
  })

  it('CASE 5: receipts / formal documents never become a cover (explicit or automatic)', () => {
    const receiptPhoto = photo({ name: 'receipt_home_depot.jpg', created_at: '2026-10-06T00:00:00Z' })
    const breakdown = photo({ category: 'project_file', mime_type: 'image/jpeg', kind_label: 'Project Breakdown', created_at: '2026-10-06T00:00:00Z' })
    const contractScan = photo({ category: 'contract', mime_type: 'image/jpeg', created_at: '2026-10-06T00:00:00Z' })
    const miscImage = photo({ category: 'miscellaneous', mime_type: 'image/jpeg', created_at: '2026-10-06T00:00:00Z' })
    const all = [receiptPhoto, breakdown, contractScan, miscImage, site]
    expect(selectProjectCover(all).cover?.id).toBe(site.id)
    expect(selectProjectCover(all, breakdown.id).cover?.id).toBe(site.id)
    expect(selectProjectCover(all, contractScan.id).cover?.id).toBe(site.id)
    expect(selectProjectCover([receiptPhoto, breakdown])).toEqual({ cover: null, coverSource: null })
  })

  it('photos labelled Issue / Other only cover when nothing better exists; then reference images', () => {
    const other = photo({ kind_label: 'Other', name: 'IMG_5.jpg', created_at: '2026-10-06T00:00:00Z' })
    expect(selectProjectCover([other, chosen]).cover?.id).toBe(chosen.id)
    expect(selectProjectCover([other, mockup]).cover?.id).toBe(other.id)
    expect(selectProjectCover([mockup])).toEqual({ cover: mockup, coverSource: 'reference' })
  })

  it('CASE 6: an explicit id from another project is ignored', () => {
    const foreign = photo({ project_id: 'p2', name: 'other-house.jpg' })
    const map = summarizeProjectPhotos([site, foreign], new Map([['p1', foreign.id]]))
    expect(map.get('p1')).toMatchObject({ cover: { id: site.id }, coverSource: 'work_photo' })
  })

  it('CASE 9: no photos → no cover (branded Tamay fallback)', () => {
    expect(selectProjectCover([], 'anything')).toEqual({ cover: null, coverSource: null })
    expect(summarizeProjectPhotos([]).get('p1')).toBeUndefined()
  })
})

describe('buildProjectViews', () => {
  it('uses the resolved project contact, falling back to the next visit client', () => {
    const base = { projects: [project()], photos: new Map(), now }
    const fromContact = buildProjectViews({
      ...base,
      schedule: [visit()],
      contacts: new Map([['p1', { name: 'Primary Pat', phone: '2035550000' }]]),
    })
    expect(fromContact[0].client?.name).toBe('Primary Pat')
    const fromVisit = buildProjectViews({ ...base, schedule: [visit()], contacts: new Map() })
    expect(fromVisit[0].client).toEqual({ name: 'Ana Kim', phone: '2035551234' })
    const none = buildProjectViews({ ...base, schedule: [], contacts: new Map() })
    expect(none[0].client).toBeNull()
  })

  it('address prefers the job-site address over the legacy location', () => {
    const [v] = buildProjectViews({
      projects: [project({ job_site_address: null, location: 'Old location' })],
      schedule: [],
      contacts: new Map(),
      photos: new Map(),
      now,
    })
    expect(v.address).toBe('Old location')
  })
})

describe('search, counts and sort', () => {
  const a = view({ project: project({ id: 'a', name: 'Alpha Kitchen', status: 'waiting', updated_at: '2026-10-03T00:00:00Z' }) })
  const b = view({
    project: project({ id: 'b', name: 'Bravo Deck', status: 'in_progress', updated_at: '2026-10-01T00:00:00Z' }),
    visits: [visit({ project_id: 'b', work_date: '2026-10-09' })],
    client: { name: 'Maria Lopez', phone: null },
  })
  const c = view({
    project: project({ id: 'c', name: 'Charlie Bath', status: 'completed', updated_at: '2026-10-02T00:00:00Z' }),
    address: '99 Elm Ave, Norwalk',
    visits: [visit({ project_id: 'c', work_date: '2026-10-07' })],
  })

  it('search matches project name, client name and address', () => {
    expect(matchesSearch(a, 'kitchen')).toBe(true)
    expect(matchesSearch(b, 'maria')).toBe(true)
    expect(matchesSearch(c, 'norwalk')).toBe(true)
    expect(matchesSearch(a, 'norwalk')).toBe(false)
    expect(matchesSearch(a, '  ')).toBe(true)
  })

  it('counts per employee status group', () => {
    expect(statusCounts([a, b, c])).toEqual({ all: 3, open: 0, in_progress: 1, waiting: 1, completed: 1 })
  })

  it('"Open" is presentation only: it groups not_started projects without changing the status value', () => {
    const fresh = view({ project: project({ id: 'n', status: 'not_started' }) })
    expect(employeeStatus('not_started')).toBe('open')
    expect(EMPLOYEE_STATUS_LABEL[employeeStatus('not_started')]).toBe('Open')
    expect(STATUS_FILTERS.map((f) => f.label)).toEqual(['All', 'Open', 'In Progress', 'Waiting', 'Completed'])
    expect(statusCounts([fresh, a]).open).toBe(1)
    expect(matchesStatus(fresh, 'open')).toBe(true)
    expect(matchesStatus(a, 'open')).toBe(false)
    expect(fresh.project.status).toBe('not_started')
  })

  it('next visit (soonest) first, projects without a visit last', () => {
    expect(sortProjects([a, b, c], 'next_visit').map((v) => v.project.id)).toEqual(['c', 'b', 'a'])
  })

  it('name, recently updated and status', () => {
    expect(sortProjects([c, b, a], 'name').map((v) => v.project.id)).toEqual(['a', 'b', 'c'])
    expect(sortProjects([a, b, c], 'updated').map((v) => v.project.id)).toEqual(['a', 'c', 'b'])
    expect(sortProjects([a, b, c], 'status').map((v) => v.project.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('labels and details', () => {
  it('visit day label', () => {
    expect(visitDayLabel('2026-10-06', now)).toBe('Today, Oct 6')
    expect(visitDayLabel('2026-10-07', now)).toBe('Tomorrow, Oct 7')
    expect(visitDayLabel('2026-10-09', now)).toBe('Fri, Oct 9')
  })

  it('initials for the no-photo cover', () => {
    expect(projectInitials('Kim Bathroom')).toBe('KB')
    expect(projectInitials('Deck')).toBe('DE')
    expect(projectInitials('  #12 – Oak St ')).toBe('1O')
  })

  it('no details accordion when there is nothing secondary to show', () => {
    expect(hasProjectDetails(view(), 0)).toBe(false)
    expect(hasProjectDetails(view(), 1)).toBe(true)
    expect(hasProjectDetails(view({ project: project({ description: 'Gut and rebuild' }) }), 0)).toBe(true)
  })
})
