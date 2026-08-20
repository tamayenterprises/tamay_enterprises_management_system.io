import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'

export type FormDraftType =
  | 'NEW_PROJECT'
  | 'EDIT_PROJECT'
  | 'PROJECT_UPDATE'
  | 'COMPANY_UPDATE'
  | 'COMMENT'
  | 'REPLY'
  | 'ATTENDANCE_CORRECTION'
  | 'ATTENDANCE_EXCEPTION'
  | 'OTHER_SUPPORTED_FORM'

export type FormDraft = {
  id: string
  draft_type: FormDraftType
  context_key: string
  payload: Record<string, unknown>
  project_id: string | null
  entity_type: string | null
  entity_id: string | null
  revision: number
  last_saved_at: string
  created_at: string
  status: string
}

function asAppError(error: unknown, fallback: string) {
  if (error instanceof Error) return error
  if (typeof error === 'object' && error && 'message' in error) {
    return new Error(String((error as { message?: unknown }).message || fallback))
  }
  return new Error(fallback)
}

const LOCAL_PREFIX = 'tamay-draft:'

function localKey(type: FormDraftType, contextKey: string, userId?: string) {
  return `${LOCAL_PREFIX}${userId || 'anon'}:${type}:${contextKey}`
}

export function useFormDraft<T extends Record<string, unknown>>(options: {
  draftType: FormDraftType
  contextKey: string
  projectId?: string | null
  entityType?: string | null
  entityId?: string | null
  enabled?: boolean
  debounceMs?: number
  isMeaningful?: (payload: T) => boolean
}) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const {
    draftType,
    contextKey,
    projectId = null,
    entityType = null,
    entityId = null,
    enabled = true,
    debounceMs = 1500,
    isMeaningful = (payload) => JSON.stringify(payload).length > 8,
  } = options

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline' | 'error' | 'conflict'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [conflictDraft, setConflictDraft] = useState<FormDraft | null>(null)
  const revisionRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const latestPayloadRef = useRef<T | null>(null)

  const draftQuery = useQuery({
    queryKey: ['form-draft', profile?.id, draftType, contextKey],
    enabled: Boolean(enabled && profile?.id && contextKey),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_form_draft', {
        p_draft_type: draftType,
        p_context_key: contextKey,
      })
      if (error) throw asAppError(error, 'Could not load draft')
      const result = data as { ok: boolean; draft: FormDraft | null }
      if (result.draft) {
        revisionRef.current = result.draft.revision
        setLastSavedAt(result.draft.last_saved_at)
        try {
          localStorage.setItem(
            localKey(draftType, contextKey, profile?.id),
            JSON.stringify({ payload: result.draft.payload, savedAt: result.draft.last_saved_at }),
          )
        } catch {
          /* ignore quota */
        }
      }
      return result.draft
    },
  })

  const upsert = useMutation({
    mutationFn: async (payload: T) => {
      const { data, error } = await supabase.rpc('upsert_form_draft', {
        p_draft_type: draftType,
        p_context_key: contextKey,
        p_payload: payload,
        p_project_id: projectId,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_expected_revision: revisionRef.current,
        p_device_ref: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : null,
      })
      if (error) throw asAppError(error, 'Could not save draft')
      return data as { ok: boolean; conflict?: boolean; draft?: FormDraft; message?: string }
    },
    onSuccess: (result) => {
      if (result.conflict && result.draft) {
        setConflictDraft(result.draft)
        setSaveState('conflict')
        return
      }
      if (result.draft) {
        revisionRef.current = result.draft.revision
        setLastSavedAt(result.draft.last_saved_at)
        setSaveState('saved')
        queryClient.setQueryData(['form-draft', profile?.id, draftType, contextKey], result.draft)
      }
    },
    onError: () => {
      setSaveState('error')
      try {
        if (latestPayloadRef.current) {
          localStorage.setItem(
            localKey(draftType, contextKey, profile?.id),
            JSON.stringify({
              payload: latestPayloadRef.current,
              savedAt: new Date().toISOString(),
              unsynced: true,
            }),
          )
          setSaveState('offline')
        }
      } catch {
        /* ignore */
      }
    },
  })

  const discard = useMutation({
    mutationFn: async (draftId: string) => {
      const { data, error } = await supabase.rpc('discard_form_draft', { p_draft_id: draftId })
      if (error) throw asAppError(error, 'Could not delete draft')
      return data
    },
    onSuccess: () => {
      revisionRef.current = null
      setLastSavedAt(null)
      setSaveState('idle')
      queryClient.setQueryData(['form-draft', profile?.id, draftType, contextKey], null)
      try {
        localStorage.removeItem(localKey(draftType, contextKey, profile?.id))
      } catch {
        /* ignore */
      }
      queryClient.invalidateQueries({ queryKey: ['form-drafts'] })
    },
  })

  const publish = useMutation({
    mutationFn: async ({ draftId, publishedEntityId }: { draftId: string; publishedEntityId?: string | null }) => {
      const { data, error } = await supabase.rpc('publish_form_draft', {
        p_draft_id: draftId,
        p_published_entity_id: publishedEntityId || null,
      })
      if (error) throw asAppError(error, 'Could not publish draft')
      return data
    },
    onSuccess: () => {
      revisionRef.current = null
      queryClient.setQueryData(['form-draft', profile?.id, draftType, contextKey], null)
      try {
        localStorage.removeItem(localKey(draftType, contextKey, profile?.id))
      } catch {
        /* ignore */
      }
      queryClient.invalidateQueries({ queryKey: ['form-drafts'] })
    },
  })

  const scheduleSave = useCallback(
    (payload: T) => {
      if (!enabled) return
      latestPayloadRef.current = payload
      if (!isMeaningful(payload)) return
      try {
        localStorage.setItem(
          localKey(draftType, contextKey, profile?.id),
          JSON.stringify({ payload, savedAt: new Date().toISOString(), unsynced: true }),
        )
      } catch {
        /* ignore */
      }
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        setSaveState('saving')
        void upsert.mutateAsync(payload)
      }, debounceMs)
    },
    [enabled, isMeaningful, draftType, contextKey, profile?.id, debounceMs, upsert],
  )

  const saveNow = useCallback(async () => {
    if (!latestPayloadRef.current || !isMeaningful(latestPayloadRef.current)) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setSaveState('saving')
    await upsert.mutateAsync(latestPayloadRef.current)
  }, [isMeaningful, upsert])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saveNow()
    }
    const onOffline = () => setSaveState('offline')
    window.addEventListener('visibilitychange', onHide)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('offline', onOffline)
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [saveNow])

  return {
    draft: draftQuery.data ?? null,
    isLoadingDraft: draftQuery.isLoading,
    saveState,
    lastSavedAt,
    conflictDraft,
    scheduleSave,
    saveNow,
    discardDraft: discard.mutateAsync,
    publishDraft: publish.mutateAsync,
    loadNewerConflict: () => {
      if (!conflictDraft) return null
      revisionRef.current = conflictDraft.revision
      setLastSavedAt(conflictDraft.last_saved_at)
      setSaveState('saved')
      const payload = conflictDraft.payload as T
      setConflictDraft(null)
      return payload
    },
    keepMyVersion: async () => {
      setConflictDraft(null)
      if (latestPayloadRef.current) {
        revisionRef.current = conflictDraft?.revision ?? revisionRef.current
        await upsert.mutateAsync(latestPayloadRef.current)
      }
    },
  }
}

export function useMyFormDrafts() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['form-drafts', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_form_drafts')
      if (error) throw asAppError(error, 'Could not list drafts')
      return (data ?? []) as FormDraft[]
    },
  })
}
