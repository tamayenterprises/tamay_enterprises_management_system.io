import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { addDays } from 'date-fns'
import { useAuth } from '@/features/auth/auth-hooks'
import { createDocumentSignedUrl, useProjects } from '@/features/data/hooks'
import { useMyWorkSchedule } from '@/features/schedule/hooks'
import { toDateKey } from '@/features/schedule/schedule-links'
import { supabase } from '@/lib/supabase'
import { canViewerSeeDocument } from '@/lib/document-visibility'
import {
  buildProjectViews,
  summarizeProjectPhotos,
  type ProjectPhoto,
} from '@/features/projects/my-projects-model'
import type { DocumentRecord, MyProjectContact } from '@/types/database'

const VISIT_WINDOW_DAYS = 60
const PHOTO_COLUMNS = 'id, project_id, category, mime_type, storage_path, owner_id, uploaded_by, team_visible, created_at'

export type ProjectNoteSnippet = {
  id: string
  project_id: string
  content: string | null
  photo_path: string | null
  created_at: string
  author: { first_name: string | null; last_name: string | null } | null
}

/** Project photos (never documents) for the worker's projects. RLS already limits the rows. */
function useMyProjectPhotos(projectIds: string[]) {
  const { profile } = useAuth()
  const idsKey = projectIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['my-project-photos', profile?.id, idsKey],
    enabled: Boolean(profile?.id) && projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select(PHOTO_COLUMNS)
        .in('project_id', projectIds)
        .or('category.eq.work_photo,mime_type.ilike.image/*')
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as unknown as Array<ProjectPhoto & Pick<DocumentRecord, 'owner_id' | 'uploaded_by' | 'team_visible'>>
      return summarizeProjectPhotos(rows.filter((row) => canViewerSeeDocument(row, profile)))
    },
  })
}

/** Latest top-level updates from each project thread (same rows Project Detail shows the worker). */
function useLatestProjectNotes(projectIds: string[]) {
  const { profile } = useAuth()
  const idsKey = projectIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['my-projects-latest-notes', profile?.id, idsKey],
    enabled: Boolean(profile?.id) && projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_notes')
        .select('id, project_id, content, photo_path, created_at, author:profiles(first_name, last_name)')
        .in('project_id', projectIds)
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(Math.min(projectIds.length * 6, 120))
      if (error) throw error
      const byProject = new Map<string, ProjectNoteSnippet[]>()
      for (const raw of (data ?? []) as unknown as Array<
        Omit<ProjectNoteSnippet, 'author'> & { author: ProjectNoteSnippet['author'] | ProjectNoteSnippet['author'][] }
      >) {
        const list = byProject.get(raw.project_id) ?? []
        if (list.length >= 2) continue
        list.push({ ...raw, author: Array.isArray(raw.author) ? (raw.author[0] ?? null) : raw.author })
        byProject.set(raw.project_id, list)
      }
      return byProject
    },
  })
}

/**
 * Everything the employee My Projects page shows, from existing worker-safe sources:
 * assigned projects, the worker's own schedule, the resolved project contact (employees only),
 * project photos and the latest thread updates. No finance, no other people's assignments.
 */
export function useMyProjectsData() {
  const { profile } = useAuth()
  const projectsQuery = useProjects({ assignedOnly: true })
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const projectIds = useMemo(() => projects.map((project) => project.id), [projects])

  const today = new Date()
  const schedule = useMyWorkSchedule(toDateKey(today), toDateKey(addDays(today, VISIT_WINDOW_DAYS)))

  const contactQueries = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: ['my-project-contact', profile?.id, projectId],
      enabled: Boolean(profile?.id) && profile?.role === 'employee',
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_my_project_contact', { p_project_id: projectId })
        if (error) throw error
        return ((data ?? []) as MyProjectContact[])[0] ?? null
      },
    })),
  })
  const contactsKey = contactQueries.map((query) => query.dataUpdatedAt).join(',')
  const contacts = useMemo(() => {
    const map = new Map<string, { name: string | null; phone: string | null }>()
    for (const query of contactQueries) {
      const row = query.data
      if (row) map.set(row.project_id, { name: row.client_name?.trim() || null, phone: row.client_phone?.trim() || null })
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactsKey])

  const photosQuery = useMyProjectPhotos(projectIds)
  const notesQuery = useLatestProjectNotes(projectIds)

  const views = useMemo(
    () =>
      buildProjectViews({
        projects,
        schedule: schedule.data ?? [],
        contacts,
        photos: photosQuery.data ?? new Map(),
        now: new Date(),
      }),
    [projects, schedule.data, contacts, photosQuery.data],
  )

  return {
    views,
    notesByProject: notesQuery.data,
    isLoading: projectsQuery.isLoading,
    isError: projectsQuery.isError,
    photosLoading: photosQuery.isLoading,
  }
}

/** Short-lived signed URL for a project's cover photo; storage RLS authorizes it. */
export function useProjectCoverUrl(cover: ProjectPhoto | null) {
  return useQuery({
    queryKey: ['project-cover-url', cover?.id],
    enabled: Boolean(cover),
    staleTime: 8 * 60 * 1000,
    retry: false,
    queryFn: () => createDocumentSignedUrl(cover as DocumentRecord),
  })
}
