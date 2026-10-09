import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useUploadDocument } from '@/features/data/hooks'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/types/database'

const COVER_NOT_INSTALLED =
  'Project cover is not set up in the database yet. Run migration 20261007090000_project_cover_photo.sql in Development first.'

function coverErrorMessage(error: { message?: string; code?: string; details?: string | null }) {
  const text = [error.message, error.details].filter(Boolean).join(' ')
  if (error.code === 'PGRST204' || /cover_photo_document_id|schema cache/i.test(text)) return COVER_NOT_INSTALLED
  if (error.code === '42501' || /only management/i.test(text)) return 'Only management can change the project cover photo.'
  if (error.code === 'PGRST116') return 'You do not have permission to change this project.'
  return error.message || 'Could not update the project cover.'
}

/**
 * Management only (database trigger enforces role, same project, eligible image).
 * `documentId: null` returns the project to the automatic cover; the photo itself is kept.
 */
export function useSetProjectCover(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (documentId: string | null) => {
      const { data, error } = await supabase
        .from('projects')
        .update({ cover_photo_document_id: documentId })
        .eq('id', projectId)
        .select('id, cover_photo_document_id')
        .single()
      if (error) throw new Error(coverErrorMessage(error))
      return data as Pick<Project, 'id' | 'cover_photo_document_id'>
    },
    onSuccess: (row) => {
      queryClient.setQueriesData<Project>({ queryKey: ['project', projectId] }, (old) =>
        old ? { ...old, cover_photo_document_id: row.cover_photo_document_id } : old,
      )
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['my-project-photos'] })
    },
  })
}

/** Upload through the normal project photo path (work photo, project-files bucket), then set it as cover. */
export function useUploadProjectCover(projectId: string) {
  const uploadDocument = useUploadDocument()
  const setCover = useSetProjectCover(projectId)
  return {
    isPending: uploadDocument.isPending || setCover.isPending,
    upload: async (file: File) => {
      const doc = await uploadDocument.mutateAsync({ file, category: 'work_photo', projectId, bucket: 'project-files' })
      await setCover.mutateAsync(doc.id)
      return doc
    },
  }
}
