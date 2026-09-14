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

export function useCompanyUpdates(limit = 40) {
  return useQuery({
    queryKey: ['company-updates', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_updates')
        .select('*, author:profiles(*)')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error

      const rows = (data ?? []) as CompanyUpdateWithMeta[]
      const rootIds = rows.filter((r) => !r.parent_id).map((r) => r.id)
      if (rootIds.length === 0) return rows

      const { data: refs } = await supabase
        .from('company_update_project_refs')
        .select('update_id, project_id, project:projects(*)')
        .in('update_id', rootIds)

      const byUpdate = new Map<string, CompanyUpdateWithMeta['refs']>()
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

      return rows.map((row) => ({
        ...row,
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

      const { data, error } = await supabase
        .from('company_updates')
        .insert(payload)
        .select('*, author:profiles(*)')
        .single()

      if (error) {
        if (photoPath) await supabase.storage.from('project-files').remove([photoPath])
        throw error
      }

      const update = data as CompanyUpdate
      const { error: extrasError } = await supabase.rpc('register_company_update_extras', {
        p_update_id: update.id,
        p_mentioned_user_ids: mentionedUserIds ?? [],
        p_project_ids: projectIds ?? [],
        p_audience_user_ids: audienceUserIds ?? [],
      })
      if (extrasError) console.warn(extrasError.message)

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
