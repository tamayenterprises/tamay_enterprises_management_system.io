import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-hooks'
import { createUpdatePhotoSignedUrl } from '@/features/data/hooks'
import { supabase } from '@/lib/supabase'
import { validateImageUploadFile, prepareUploadFileAsync, uploadErrorMessage } from '@/lib/uploads'
import type { CompanyUpdate, CompanyUpdateAudience, Profile, Project } from '@/types/database'

export type CompanyUpdateWithMeta = CompanyUpdate & {
  author?: Profile | null
  refs?: Array<{ project_id: string; project?: Project | null }>
}

function companyUpdateError(error: { message?: string; details?: string; hint?: string; code?: string } | null, fallback: string) {
  const message = error?.message || fallback
  const extra = [error?.details, error?.hint].filter(Boolean).join(' ')
  if (
    error?.code === 'PGRST202' ||
    /could not find the function/i.test(message) ||
    /schema cache/i.test(message)
  ) {
    return new Error(
      'Company updates are not set up in the database yet. In Supabase, run supabase/migrations/20261013010000_fix_company_updates_posting.sql, then try again.',
    )
  }
  if (
    error?.code === '42501' ||
    /row-level security/i.test(message) ||
    /permission denied/i.test(message)
  ) {
    return new Error(
      'The database is blocking this company update. Run supabase/migrations/20261013010000_fix_company_updates_posting.sql in the Supabase SQL editor, then try again.',
    )
  }
  return new Error(extra ? `${message} ${extra}` : message)
}

async function loadCompanyUpdateRows(limit: number): Promise<CompanyUpdate[]> {
  const rpc = await supabase.rpc('list_company_updates', { p_limit: limit })
  if (!rpc.error) return (rpc.data ?? []) as CompanyUpdate[]

  const table = await supabase
    .from('company_updates')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (table.error) throw companyUpdateError(table.error, rpc.error.message)
  return (table.data ?? []) as CompanyUpdate[]
}

export function useCompanyUpdates(limit = 40) {
  return useQuery({
    queryKey: ['company-updates', limit],
    queryFn: async () => {
      const data = await loadCompanyUpdateRows(limit)
      const rows = data as CompanyUpdateWithMeta[]
      const authorIds = [...new Set(rows.map((row) => row.author_id).filter((id): id is string => Boolean(id)))]
      const authors = new Map<string, Profile>()
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', authorIds)
        for (const profile of profiles ?? []) authors.set(profile.id, profile as Profile)
      }

      const rootIds = rows.filter((r) => !r.parent_id).map((r) => r.id)
      const byUpdate = new Map<string, CompanyUpdateWithMeta['refs']>()
      if (rootIds.length > 0) {
        const { data: refs } = await supabase
          .from('company_update_project_refs')
          .select('update_id, project_id, project:projects(*)')
          .in('update_id', rootIds)

        for (const ref of refs ?? []) {
          const list = byUpdate.get(ref.update_id) ?? []
          const projectValue = (ref as { project?: Project | Project[] | null }).project
          const project = Array.isArray(projectValue) ? (projectValue[0] ?? null) : (projectValue ?? null)
          list.push({
            project_id: ref.project_id,
            project,
          })
          byUpdate.set(ref.update_id, list)
        }
      }

      return rows.map((row) => ({
        ...row,
        author: row.author_id ? authors.get(row.author_id) ?? null : null,
        refs: byUpdate.get(row.parent_id ?? row.id) ?? [],
      }))
    },
  })
}

export function useMyProjectUpdatesFeed(limit = 40) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['my-project-updates', profile?.id, limit],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_notes')
        .select('*, author:profiles(*), project:projects(*)')
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateCompanyUpdate() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      content,
      parentId,
      photo,
      audienceType,
      audienceUserIds,
      repliesEnabled,
      requiresAttention,
      notifyProjectTeam,
      mentionedUserIds,
      projectIds,
    }: {
      content: string
      parentId?: string | null
      photo?: File | null
      audienceType?: CompanyUpdateAudience
      audienceUserIds?: string[]
      repliesEnabled?: boolean
      requiresAttention?: boolean
      notifyProjectTeam?: boolean
      mentionedUserIds?: string[]
      projectIds?: string[]
    }) => {
      if (!profile?.id || !profile.organization_id) throw new Error('Missing profile')

      const trimmed = content.trim()
      if (!trimmed && !photo) throw new Error('Write an update or add a photo')

      let photoPath: string | null = null
      if (photo) {
        const validationError = validateImageUploadFile(photo)
        if (validationError) throw new Error(validationError)
        const prepared = await prepareUploadFileAsync(photo)
        const safeName = prepared.displayName.replace(/[^\w.\-()+ ]+/g, '_') || 'photo'
        photoPath = `${profile.id}/company-updates/${Date.now()}-${crypto.randomUUID()}-${safeName}`
        const { error: uploadError } = await supabase.storage.from('project-files').upload(photoPath, prepared.file, {
          contentType: prepared.contentType,
          upsert: false,
        })
        if (uploadError) throw new Error(uploadErrorMessage(uploadError))
      }

      const payload: Record<string, unknown> = {
        organization_id: profile.organization_id,
        author_id: profile.id,
        content: trimmed || null,
      }
      if (parentId) payload.parent_id = parentId
      if (photoPath) payload.photo_path = photoPath
      if (!parentId) {
        payload.audience_type = audienceType ?? 'all_internal'
        payload.replies_enabled = repliesEnabled ?? true
        payload.requires_attention = Boolean(requiresAttention)
        payload.notify_project_team = Boolean(notifyProjectTeam)
      }

      const posted = await supabase.rpc('post_company_update', {
        p_content: trimmed || null,
        p_photo_path: photoPath,
        p_parent_id: parentId ?? null,
        p_audience_type: audienceType ?? 'all_internal',
        p_replies_enabled: repliesEnabled ?? true,
        p_requires_attention: Boolean(requiresAttention),
        p_notify_project_team: Boolean(notifyProjectTeam),
        p_mentioned_user_ids: mentionedUserIds ?? [],
        p_project_ids: projectIds ?? [],
        p_audience_user_ids: audienceUserIds ?? [],
      })

      if (!posted.error) {
        return posted.data as CompanyUpdate
      }

      const { data, error } = await supabase.from('company_updates').insert(payload).select('*').single()
      if (error) {
        if (photoPath) await supabase.storage.from('project-files').remove([photoPath])
        throw companyUpdateError(error.code === 'PGRST202' ? posted.error : error, posted.error.message)
      }

      const update = data as CompanyUpdate
      const { error: extrasError } = await supabase.rpc('register_company_update_extras', {
        p_update_id: update.id,
        p_mentioned_user_ids: mentionedUserIds ?? [],
        p_project_ids: projectIds ?? [],
        p_audience_user_ids: audienceUserIds ?? [],
      })
      if (extrasError) {
        console.warn(extrasError.message)
      }

      return update
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-updates'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['project-activity'] })
    },
  })
}

export { createUpdatePhotoSignedUrl }
