import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-hooks'
import { PROFILE_DIRECTORY_COLUMNS } from '@/lib/profile-fields'
import { supabase } from '@/lib/supabase'
import { prepareUploadFileAsync, uploadErrorMessage, validateUploadFile } from '@/lib/uploads'
import { WORK_ORDER_FILES_BUCKET, workOrderFilePath } from '@/lib/work-orders'
import type {
  WorkOrderDocumentCategory,
  WorkOrderFileRecord,
  WorkOrderOfferRecord,
  WorkOrderProjectSummary,
  WorkOrderRecord,
  WorkOrderUpdateRecord,
} from '@/types/database'

const WORK_ORDER_SELECT = `*, subcontractor:profiles!subcontractor_id(${PROFILE_DIRECTORY_COLUMNS})`

/** The work order migration is not installed yet: treat as no work orders so pages keep working. */
function isNotInstalled(error: { code?: string } | null) {
  return Boolean(error && (error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42P01' || error.code === '42883'))
}

function invalidateWorkOrders(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['work-orders-v2'] })
}

async function selectWorkOrders(filter: (query: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>) {
  const { data, error } = await filter(baseQuery())
  if (isNotInstalled(error)) return []
  if (error) throw error
  return (data ?? []) as unknown as WorkOrderRecord[]
}

function baseQuery() {
  return supabase.from('work_orders').select(WORK_ORDER_SELECT).order('created_at', { ascending: false })
}

export function useProjectWorkOrders(projectId?: string | null) {
  return useQuery({
    queryKey: ['work-orders-v2', 'project', projectId],
    enabled: Boolean(projectId),
    queryFn: () => selectWorkOrders((q) => q.eq('project_id', projectId!)),
  })
}

/** Management: work orders for some subcontractors (counts on cards, subcontractor detail). */
export function useSubcontractorWorkOrders(profileIds: string[]) {
  const ids = [...new Set(profileIds)].sort()
  return useQuery({
    queryKey: ['work-orders-v2', 'subcontractors', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: () => selectWorkOrders((q) => q.in('subcontractor_id', ids)),
  })
}

/** Subcontractor: own work orders plus open offers (the database only returns offers made to them). */
export function useMyWorkOrders() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['work-orders-v2', 'mine', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: () => selectWorkOrders((q) => q.or(`subcontractor_id.eq.${profile!.id},status.eq.offered`)),
  })
}

/** Management: who each work order was offered to, and their answers. */
export function useWorkOrderOffers(workOrderIds: string[]) {
  const ids = [...new Set(workOrderIds)].sort()
  return useQuery({
    queryKey: ['work-orders-v2', 'offers', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_order_offers')
        .select(`*, subcontractor:profiles!subcontractor_id(${PROFILE_DIRECTORY_COLUMNS})`)
        .in('work_order_id', ids)
        .order('created_at', { ascending: true })
      if (isNotInstalled(error)) return []
      if (error) throw error
      return (data ?? []) as unknown as WorkOrderOfferRecord[]
    },
  })
}

export function useWorkOrder(workOrderId?: string | null) {
  return useQuery({
    queryKey: ['work-orders-v2', 'detail', workOrderId],
    enabled: Boolean(workOrderId),
    queryFn: async () => {
      const { data, error } = await baseQuery().eq('id', workOrderId!).maybeSingle()
      if (isNotInstalled(error)) return null
      if (error) throw error
      return (data ?? null) as unknown as WorkOrderRecord | null
    },
  })
}

/** Project name + job address only (subcontractors cannot read project records). */
export function useWorkOrderProjectSummaries(workOrderIds: string[]) {
  const ids = [...new Set(workOrderIds)].sort()
  return useQuery({
    queryKey: ['work-orders-v2', 'project-summaries', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('work_order_project_summaries', { p_work_order_ids: ids })
      if (isNotInstalled(error)) return new Map<string, WorkOrderProjectSummary>()
      if (error) throw error
      return new Map(((data ?? []) as WorkOrderProjectSummary[]).map((row) => [row.work_order_id, row]))
    },
  })
}

export function useWorkOrderUpdates(workOrderId?: string | null) {
  return useQuery({
    queryKey: ['work-orders-v2', 'updates', workOrderId],
    enabled: Boolean(workOrderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_order_updates')
        .select(`*, author:profiles!author_id(${PROFILE_DIRECTORY_COLUMNS})`)
        .eq('work_order_id', workOrderId!)
        .order('created_at', { ascending: false })
      if (isNotInstalled(error)) return []
      if (error) throw error
      return (data ?? []) as unknown as WorkOrderUpdateRecord[]
    },
  })
}

export function useWorkOrderFiles(workOrderId?: string | null) {
  return useQuery({
    queryKey: ['work-orders-v2', 'files', workOrderId],
    enabled: Boolean(workOrderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_order_files')
        .select('*')
        .eq('work_order_id', workOrderId!)
        .order('created_at', { ascending: true })
      if (isNotInstalled(error)) return []
      if (error) throw error
      return (data ?? []) as WorkOrderFileRecord[]
    },
  })
}

/** Latest update per work order, for compact management cards. */
export function useLatestWorkOrderUpdates(workOrderIds: string[]) {
  const ids = [...new Set(workOrderIds)].sort()
  return useQuery({
    queryKey: ['work-orders-v2', 'latest-updates', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_order_updates')
        .select('*')
        .in('work_order_id', ids)
        .order('created_at', { ascending: false })
      if (isNotInstalled(error)) return new Map<string, WorkOrderUpdateRecord>()
      if (error) throw error
      const latest = new Map<string, WorkOrderUpdateRecord>()
      for (const row of (data ?? []) as WorkOrderUpdateRecord[]) {
        if (!latest.has(row.work_order_id)) latest.set(row.work_order_id, row)
      }
      return latest
    },
  })
}

export type WorkOrderFormValues = {
  project_id: string
  /** Create only: everyone the work order is offered to. The first to accept gets it. */
  subcontractor_ids: string[]
  trade: string
  title: string
  scope_of_work: string
  measurements_and_specs: string
  important_requirements: string
  agreed_price: string
  start_date: string
  target_completion_date: string
  payment_notes: string
  warranty_applies: boolean
  warranty_notes: string
  insurance_required: boolean
  certificate_holder: string
}

export function workOrderPayload(values: WorkOrderFormValues) {
  const text = (value: string) => value.trim() || null
  const price = values.agreed_price.trim().replace(/[$,\s]/g, '')
  return {
    project_id: values.project_id,
    trade: text(values.trade),
    title: values.title.trim(),
    scope_of_work: text(values.scope_of_work),
    measurements_and_specs: text(values.measurements_and_specs),
    important_requirements: text(values.important_requirements),
    agreed_price: price ? Number(price) : null,
    start_date: values.start_date || null,
    target_completion_date: values.target_completion_date || null,
    payment_notes: text(values.payment_notes),
    warranty_applies: values.warranty_applies,
    warranty_notes: values.warranty_applies ? text(values.warranty_notes) : null,
    insurance_required: values.insurance_required,
    certificate_holder: values.insurance_required ? text(values.certificate_holder) : null,
  }
}

async function sendOffers(workOrderId: string, subcontractorIds: string[]) {
  const { data, error } = await supabase.rpc('send_work_order_offers', {
    p_work_order_id: workOrderId,
    p_subcontractor_ids: subcontractorIds,
  })
  if (error) throw error
  return data as number
}

export function useSaveWorkOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string | null; values: WorkOrderFormValues }) => {
      const payload = workOrderPayload(values)
      if (!payload.title) throw new Error('Enter a title for the work order.')
      if (!id && values.subcontractor_ids.length === 0) throw new Error('Choose at least one subcontractor to send it to.')
      if (payload.agreed_price != null && (!Number.isFinite(payload.agreed_price) || payload.agreed_price < 0)) {
        throw new Error('Enter the agreed price as a number.')
      }
      if (payload.insurance_required && !payload.certificate_holder) {
        throw new Error('Enter the Certificate Holder name and address for the insurance certificate.')
      }
      if (id) {
        const { error } = await supabase.from('work_orders').update(payload).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase
        .from('work_orders')
        .insert({ ...payload, status: 'offered' })
        .select('id')
        .single()
      if (error) throw error
      const newId = (data as { id: string }).id
      try {
        await sendOffers(newId, values.subcontractor_ids)
      } catch (offerError) {
        const reason = offerError instanceof Error ? offerError.message : 'unknown error'
        throw new Error(`Work order created, but it was not sent (${reason}). Open it and use "Send to subcontractors".`)
      }
      return newId
    },
    onSuccess: () => invalidateWorkOrders(queryClient),
  })
}

export function useSendWorkOrderOffers() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ workOrderId, subcontractorIds }: { workOrderId: string; subcontractorIds: string[] }) =>
      sendOffers(workOrderId, subcontractorIds),
    onSuccess: () => invalidateWorkOrders(queryClient),
  })
}

/** Subcontractor: accept (with the agreement checkbox) or decline (optional reason). */
export function useRespondToWorkOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      workOrderId,
      accept,
      agree = false,
      reason = null,
    }: {
      workOrderId: string
      accept: boolean
      agree?: boolean
      reason?: string | null
    }) => {
      const { data, error } = await supabase.rpc('respond_to_work_order', {
        p_work_order_id: workOrderId,
        p_accept: accept,
        p_agree: agree,
        p_reason: reason?.trim() || null,
      })
      if (error) throw error
      return data as 'accepted' | 'declined'
    },
    onSuccess: () => invalidateWorkOrders(queryClient),
  })
}

export function useUpdateWorkOrderStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ workOrderId, action }: { workOrderId: string; action: 'start' | 'complete' | 'close' }) => {
      const { data, error } = await supabase.rpc('update_work_order_status', { p_work_order_id: workOrderId, p_action: action })
      if (error) throw error
      return data
    },
    onSuccess: () => invalidateWorkOrders(queryClient),
  })
}

async function uploadWorkOrderFile(workOrderId: string, kind: WorkOrderFileRecord['kind'], file: File) {
  const validationError = validateUploadFile(file)
  if (validationError) throw new Error(validationError)
  const prepared = await prepareUploadFileAsync(file)
  const path = workOrderFilePath(workOrderId, kind, prepared.displayName)
  const { error } = await supabase.storage.from(WORK_ORDER_FILES_BUCKET).upload(path, prepared.file, {
    contentType: prepared.contentType,
    upsert: false,
  })
  if (error) throw new Error(uploadErrorMessage(error))
  return { path, name: prepared.displayName, mime_type: prepared.contentType, file_size: prepared.file.size || null }
}

async function removeUploaded(paths: string[]) {
  if (paths.length > 0) await supabase.storage.from(WORK_ORDER_FILES_BUCKET).remove(paths)
}

export function useUploadWorkOrderReferences() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({
      workOrder,
      files,
      category,
    }: {
      workOrder: Pick<WorkOrderRecord, 'id' | 'organization_id'>
      files: File[]
      category: WorkOrderDocumentCategory
    }) => {
      if (!profile) throw new Error('Sign in again to upload.')
      for (const file of files) {
        const uploaded = await uploadWorkOrderFile(workOrder.id, 'reference', file)
        const { error } = await supabase.from('work_order_files').insert({
          work_order_id: workOrder.id,
          organization_id: workOrder.organization_id,
          uploaded_by: profile.id,
          kind: 'reference',
          category,
          name: uploaded.name,
          storage_path: uploaded.path,
          mime_type: uploaded.mime_type,
          file_size: uploaded.file_size,
        })
        if (error) {
          await removeUploaded([uploaded.path])
          throw new Error(uploadErrorMessage(error))
        }
      }
    },
    onSuccess: (_data, vars) =>
      queryClient.invalidateQueries({ queryKey: ['work-orders-v2', 'files', vars.workOrder.id] }),
  })
}

/** Subcontractor: insurance certificate, permit, receipt / invoice or other document for this work order. */
export function useSubmitWorkOrderDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ workOrderId, files, category }: { workOrderId: string; files: File[]; category: WorkOrderDocumentCategory }) => {
      for (const file of files) {
        const uploaded = await uploadWorkOrderFile(workOrderId, 'subcontractor_document', file)
        const { error } = await supabase.rpc('submit_work_order_document', {
          p_work_order_id: workOrderId,
          p_category: category,
          p_path: uploaded.path,
          p_name: uploaded.name,
          p_mime_type: uploaded.mime_type,
          p_file_size: uploaded.file_size,
        })
        if (error) {
          await removeUploaded([uploaded.path])
          throw new Error(uploadErrorMessage(error))
        }
      }
    },
    onSuccess: (_data, vars) => queryClient.invalidateQueries({ queryKey: ['work-orders-v2', 'files', vars.workOrderId] }),
  })
}

/** Management: approve or reject an insurance certificate. */
export function useReviewWorkOrderDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, approve, note = null }: { file: Pick<WorkOrderFileRecord, 'id' | 'work_order_id'>; approve: boolean; note?: string | null }) => {
      const { data, error } = await supabase.rpc('review_work_order_document', {
        p_file_id: file.id,
        p_approve: approve,
        p_note: note?.trim() || null,
      })
      if (error) throw error
      return data as 'approved' | 'rejected'
    },
    onSuccess: (_data, vars) => queryClient.invalidateQueries({ queryKey: ['work-orders-v2', 'files', vars.file.work_order_id] }),
  })
}

export function useRemoveWorkOrderFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: Pick<WorkOrderFileRecord, 'id' | 'storage_path' | 'work_order_id'>) => {
      const { data, error } = await supabase.from('work_order_files').delete().eq('id', file.id).select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('You do not have permission to remove this file.')
      await removeUploaded([file.storage_path])
    },
    onSuccess: (_data, file) => queryClient.invalidateQueries({ queryKey: ['work-orders-v2', 'files', file.work_order_id] }),
  })
}

export function useAddWorkOrderUpdate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      workOrderId,
      completedToday,
      nextSteps,
      issueQuestion,
      photos,
    }: {
      workOrderId: string
      completedToday: string
      nextSteps: string
      issueQuestion: string
      photos: File[]
    }) => {
      if (!completedToday.trim() && !nextSteps.trim() && !issueQuestion.trim() && photos.length === 0) {
        throw new Error('Write an update or add a photo.')
      }
      const uploaded: Awaited<ReturnType<typeof uploadWorkOrderFile>>[] = []
      try {
        for (const photo of photos) uploaded.push(await uploadWorkOrderFile(workOrderId, 'update_photo', photo))
        const { data, error } = await supabase.rpc('add_work_order_update', {
          p_work_order_id: workOrderId,
          p_completed_today: completedToday.trim() || null,
          p_next_steps: nextSteps.trim() || null,
          p_issue_question: issueQuestion.trim() || null,
          p_photos: uploaded,
        })
        if (error) throw error
        return data as string
      } catch (error) {
        await removeUploaded(uploaded.map((item) => item.path))
        throw error
      }
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['work-orders-v2', 'updates', vars.workOrderId] })
      void queryClient.invalidateQueries({ queryKey: ['work-orders-v2', 'files', vars.workOrderId] })
      void queryClient.invalidateQueries({ queryKey: ['work-orders-v2', 'latest-updates'] })
    },
  })
}

export async function openWorkOrderFile(file: Pick<WorkOrderFileRecord, 'storage_path'>) {
  const tab = window.open('', '_blank')
  try {
    const { data, error } = await supabase.storage.from(WORK_ORDER_FILES_BUCKET).createSignedUrl(file.storage_path, 60 * 10)
    if (error || !data?.signedUrl) throw new Error('This file is not available.')
    if (tab && !tab.closed) {
      tab.opener = null
      tab.location.replace(data.signedUrl)
    } else {
      window.location.assign(data.signedUrl)
    }
  } catch (error) {
    tab?.close()
    throw error
  }
}

/** Signed thumbnail URLs for update photos (10 minutes). */
export function useWorkOrderPhotoUrls(paths: string[]) {
  const sorted = [...new Set(paths)].sort()
  return useQuery({
    queryKey: ['work-orders-v2', 'photo-urls', sorted.join(',')],
    enabled: sorted.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(WORK_ORDER_FILES_BUCKET).createSignedUrls(sorted, 60 * 10)
      if (error) throw error
      const urls = new Map<string, string>()
      for (const row of data ?? []) if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl)
      return urls
    },
  })
}
