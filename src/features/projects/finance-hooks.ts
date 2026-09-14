import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-hooks'
import { supabase } from '@/lib/supabase'
import { derivePaymentStatus, toMoneyNumber } from '@/lib/project-finance'
import { validateUploadFile } from '@/lib/uploads'
import type {
  Project,
  ProjectFinancialAudit,
  ProjectPayment,
  ProjectPaymentMethod,
  ProjectPaymentStageKey,
  ProjectPaymentStatus,
  ProjectReceipt,
} from '@/types/database'

const FINANCE_BUCKET = 'project-finance'

async function writeAudit(entry: {
  organizationId: string
  projectId: string
  paymentId?: string | null
  receiptId?: string | null
  entityType: 'payment' | 'receipt' | 'project_total'
  fieldName: string
  oldValue?: string | null
  newValue?: string | null
  changedBy?: string | null
}) {
  await supabase.from('project_payment_audit').insert({
    organization_id: entry.organizationId,
    project_id: entry.projectId,
    payment_id: entry.paymentId ?? null,
    receipt_id: entry.receiptId ?? null,
    entity_type: entry.entityType,
    field_name: entry.fieldName,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
    changed_by: entry.changedBy ?? null,
  })
}

/**
 * Open payment proof only after a row-level authorized SELECT.
 * Callers must pass payment id — never a raw storage path from the URL.
 */
export async function createPaymentProofSignedUrl(paymentId: string) {
  const { data: payment, error } = await supabase
    .from('project_payments')
    .select('id, proof_storage_path, status')
    .eq('id', paymentId)
    .maybeSingle()
  if (error) throw error
  if (!payment?.proof_storage_path) {
    throw new Error('Payment proof is not available for this payment.')
  }
  const { data, error: signError } = await supabase.storage
    .from(FINANCE_BUCKET)
    .createSignedUrl(payment.proof_storage_path, 60 * 30)
  if (signError) throw signError
  return data.signedUrl
}

/** Receipt proofs — authorized via project_receipts RLS (management or assigned employees). */
export async function createReceiptProofSignedUrl(receiptId: string) {
  const { data: receipt, error } = await supabase
    .from('project_receipts')
    .select('id, proof_storage_path')
    .eq('id', receiptId)
    .maybeSingle()
  if (error) throw error
  if (!receipt?.proof_storage_path) {
    throw new Error('Receipt file is not available.')
  }
  const { data, error: signError } = await supabase.storage
    .from(FINANCE_BUCKET)
    .createSignedUrl(receipt.proof_storage_path, 60 * 30)
  if (signError) throw signError
  return data.signedUrl
}

export type FinanceProofViewPayload = {
  url: string
  mimeType: string | null
  fileName: string | null
  title: string
  revokeUrl: boolean
}

/**
 * Prefer authenticated download (blob URL) so client RLS failures surface as errors
 * instead of a blank/dark browser tab from a broken signed URL navigate.
 */
export async function loadPaymentProofForViewing(
  paymentId: string,
  title = 'Payment proof',
): Promise<FinanceProofViewPayload> {
  const { data: payment, error } = await supabase
    .from('project_payments')
    .select('id, proof_storage_path, proof_mime_type, proof_file_name, status')
    .eq('id', paymentId)
    .maybeSingle()
  if (error) throw error
  if (!payment?.proof_storage_path || payment.status === 'void') {
    throw new Error('Payment proof is not available for this payment.')
  }

  const downloaded = await supabase.storage.from(FINANCE_BUCKET).download(payment.proof_storage_path)
  if (!downloaded.error && downloaded.data) {
    return {
      url: URL.createObjectURL(downloaded.data),
      mimeType: payment.proof_mime_type || downloaded.data.type || null,
      fileName: payment.proof_file_name,
      title,
      revokeUrl: true,
    }
  }

  const { data, error: signError } = await supabase.storage
    .from(FINANCE_BUCKET)
    .createSignedUrl(payment.proof_storage_path, 60 * 30)
  if (signError || !data?.signedUrl) {
    throw downloaded.error ?? signError ?? new Error('Unable to open payment proof.')
  }
  return {
    url: data.signedUrl,
    mimeType: payment.proof_mime_type,
    fileName: payment.proof_file_name,
    title,
    revokeUrl: false,
  }
}

export async function loadReceiptProofForViewing(
  receiptId: string,
  title = 'Receipt',
): Promise<FinanceProofViewPayload> {
  const { data: receipt, error } = await supabase
    .from('project_receipts')
    .select('id, proof_storage_path, proof_mime_type, proof_file_name, status')
    .eq('id', receiptId)
    .maybeSingle()
  if (error) throw error
  if (!receipt?.proof_storage_path) {
    throw new Error('Receipt file is not available.')
  }

  const downloaded = await supabase.storage.from(FINANCE_BUCKET).download(receipt.proof_storage_path)
  if (!downloaded.error && downloaded.data) {
    return {
      url: URL.createObjectURL(downloaded.data),
      mimeType: receipt.proof_mime_type || downloaded.data.type || null,
      fileName: receipt.proof_file_name,
      title,
      revokeUrl: true,
    }
  }

  const { data, error: signError } = await supabase.storage
    .from(FINANCE_BUCKET)
    .createSignedUrl(receipt.proof_storage_path, 60 * 30)
  if (signError || !data?.signedUrl) {
    throw downloaded.error ?? signError ?? new Error('Unable to open receipt.')
  }
  return {
    url: data.signedUrl,
    mimeType: receipt.proof_mime_type,
    fileName: receipt.proof_file_name,
    title,
    revokeUrl: false,
  }
}

/** @deprecated Prefer createPaymentProofSignedUrl(paymentId) — path-only access is not authorized. */
export async function createFinanceProofSignedUrl(_path: string): Promise<string> {
  throw new Error('Use createPaymentProofSignedUrl or createReceiptProofSignedUrl with a record id.')
}

export function useProjectPayments(
  projectId?: string,
  options?: { clientSafe?: boolean; enabled?: boolean },
) {
  const clientSafe = Boolean(options?.clientSafe)
  return useQuery({
    queryKey: ['project-payments', projectId, clientSafe ? 'client' : 'staff'],
    enabled: Boolean(projectId) && options?.enabled !== false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_payments')
        .select('*')
        .eq('project_id', projectId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as ProjectPayment[]
      // Never surface internal payment notes to the Client Portal UI.
      if (!clientSafe) return rows
      return rows.map((row) => ({ ...row, notes: null }))
    },
  })
}

export function useProjectReceipts(
  projectId?: string,
  options?: { enabled?: boolean; mineOnly?: boolean; currentUserId?: string | null },
) {
  const mineOnly = Boolean(options?.mineOnly)
  const currentUserId = options?.currentUserId ?? null
  return useQuery({
    queryKey: ['project-receipts', projectId, mineOnly ? `mine:${currentUserId}` : 'all'],
    enabled: Boolean(projectId) && options?.enabled !== false && (!mineOnly || Boolean(currentUserId)),
    queryFn: async () => {
      let query = supabase
        .from('project_receipts')
        .select('*, uploader:profiles!created_by(*)')
        .eq('project_id', projectId!)
        .order('received_on', { ascending: false })
        .order('created_at', { ascending: false })

      if (mineOnly && currentUserId) {
        query = query.eq('created_by', currentUserId)
      }

      const { data, error } = await query
      if (error) {
        let fallback = supabase
          .from('project_receipts')
          .select('*')
          .eq('project_id', projectId!)
          .order('received_on', { ascending: false })
          .order('created_at', { ascending: false })
        if (mineOnly && currentUserId) {
          fallback = fallback.eq('created_by', currentUserId)
        }
        const result = await fallback
        if (result.error) throw error
        return (result.data ?? []) as ProjectReceipt[]
      }
      return (data ?? []) as ProjectReceipt[]
    },
  })
}

export function useProjectFinancialAudit(projectId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['project-financial-audit', projectId],
    enabled: Boolean(projectId) && options?.enabled !== false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_payment_audit')
        .select('*')
        .eq('project_id', projectId!)
        .order('changed_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return (data ?? []) as ProjectFinancialAudit[]
    },
  })
}

export function useUpdateProjectTotals(projectId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      originalProjectTotal,
      currentProjectTotal,
      confirmOriginalChange,
    }: {
      originalProjectTotal?: number | null
      currentProjectTotal: number
      /** Required when changing an already-established original total. */
      confirmOriginalChange?: boolean
    }) => {
      if (!profile?.organization_id) throw new Error('Missing organization')
      if (currentProjectTotal < 0) throw new Error('Project total cannot be negative')
      if (originalProjectTotal != null && originalProjectTotal < 0) {
        throw new Error('Original project total cannot be negative')
      }

      const { data: existing, error: loadError } = await supabase
        .from('projects')
        .select('original_project_total, current_project_total, organization_id')
        .eq('id', projectId)
        .single()
      if (loadError) throw loadError

      const payload: Record<string, unknown> = {
        current_project_total: toMoneyNumber(currentProjectTotal),
        project_total_updated_at: new Date().toISOString(),
        project_total_updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }

      const hadOriginal =
        existing.original_project_total !== null && existing.original_project_total !== undefined
      const previousOriginal = hadOriginal ? toMoneyNumber(existing.original_project_total) : null
      const nextOriginal =
        originalProjectTotal === undefined || originalProjectTotal === null
          ? null
          : toMoneyNumber(originalProjectTotal)

      if (!hadOriginal) {
        payload.original_project_total = nextOriginal ?? toMoneyNumber(currentProjectTotal)
      } else if (nextOriginal != null && nextOriginal !== previousOriginal) {
        if (!confirmOriginalChange) {
          throw new Error('ORIGINAL_TOTAL_CONFIRMATION_REQUIRED')
        }
        payload.original_project_total = nextOriginal
      }

      const { data, error } = await supabase
        .from('projects')
        .update(payload)
        .eq('id', projectId)
        .select()
        .single()
      if (error) throw error

      const savedOriginal = toMoneyNumber(
        (data as Project).original_project_total ??
          nextOriginal ??
          currentProjectTotal,
      )

      if (!hadOriginal) {
        await writeAudit({
          organizationId: existing.organization_id,
          projectId,
          entityType: 'project_total',
          fieldName: 'original_project_total',
          oldValue: null,
          newValue: String(savedOriginal),
          changedBy: profile.id,
        })
      } else if (nextOriginal != null && nextOriginal !== previousOriginal) {
        await writeAudit({
          organizationId: existing.organization_id,
          projectId,
          entityType: 'project_total',
          fieldName: 'original_project_total',
          oldValue: previousOriginal != null ? String(previousOriginal) : null,
          newValue: String(nextOriginal),
          changedBy: profile.id,
        })
      }

      if (toMoneyNumber(existing.current_project_total) !== toMoneyNumber(currentProjectTotal)) {
        await writeAudit({
          organizationId: existing.organization_id,
          projectId,
          entityType: 'project_total',
          fieldName: 'current_project_total',
          oldValue:
            existing.current_project_total != null ? String(existing.current_project_total) : null,
          newValue: String(toMoneyNumber(currentProjectTotal)),
          changedBy: profile.id,
        })
      }

      return data as Project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project-financial-audit', projectId] })
    },
  })
}

export type UpsertPaymentInput = {
  id?: string
  label: string
  stageKey: ProjectPaymentStageKey
  expectedPercent?: number | null
  expectedAmount: number
  actualAmount: number
  status?: ProjectPaymentStatus
  method?: ProjectPaymentMethod | null
  receivedOn?: string | null
  checkReference?: string | null
  notes?: string | null
  sortOrder?: number
  stripePaymentLinkUrl?: string | null
  stripePaymentLinkActive?: boolean
  proofFile?: File | null
  clearProof?: boolean
}

export function useUpsertProjectPayment(projectId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (input: UpsertPaymentInput) => {
      if (!profile?.id || !profile.organization_id) throw new Error('Missing profile')
      if (input.expectedAmount < 0 || input.actualAmount < 0) {
        throw new Error('Payment amounts cannot be negative')
      }

      const status =
        input.status === 'void'
          ? 'void'
          : derivePaymentStatus(input.expectedAmount, input.actualAmount, input.status)

      const existingId = input.id
      const paymentId = existingId ?? crypto.randomUUID()

      let proofPath: string | null | undefined
      let proofMime: string | null | undefined
      let proofName: string | null | undefined

      if (input.clearProof) {
        proofPath = null
        proofMime = null
        proofName = null
      }

      if (input.proofFile) {
        const validationError = validateUploadFile(input.proofFile)
        if (validationError) throw new Error(validationError)
        const safeName = input.proofFile.name.replace(/[^\w.\-()+ ]+/g, '_')
        proofPath = `${projectId}/payments/${paymentId}-${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from(FINANCE_BUCKET)
          .upload(proofPath, input.proofFile)
        if (uploadError) throw uploadError
        proofMime = input.proofFile.type || null
        proofName = input.proofFile.name
      }

      const payload: Record<string, unknown> = {
        organization_id: profile.organization_id,
        project_id: projectId,
        label: input.label.trim() || 'Payment',
        stage_key: input.stageKey,
        expected_percent: input.expectedPercent ?? null,
        expected_amount: toMoneyNumber(input.expectedAmount),
        actual_amount: toMoneyNumber(input.actualAmount),
        status,
        method: input.method ?? null,
        received_on: input.receivedOn || null,
        check_reference: input.checkReference?.trim() || null,
        notes: input.notes?.trim() || null,
        sort_order: input.sortOrder ?? 0,
        stripe_payment_link_url: input.stripePaymentLinkUrl?.trim() || null,
        stripe_payment_link_active: Boolean(input.stripePaymentLinkActive),
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }

      if (proofPath !== undefined) {
        payload.proof_storage_path = proofPath
        payload.proof_mime_type = proofMime ?? null
        payload.proof_file_name = proofName ?? null
      }

      if (status === 'void') {
        payload.voided_at = new Date().toISOString()
        payload.voided_by = profile.id
      }

      if (existingId) {
        const { data: before } = await supabase
          .from('project_payments')
          .select('*')
          .eq('id', existingId)
          .maybeSingle()

        const { data, error } = await supabase
          .from('project_payments')
          .update(payload)
          .eq('id', existingId)
          .select()
          .single()
        if (error) throw error

        if (before && toMoneyNumber(before.actual_amount) !== toMoneyNumber(input.actualAmount)) {
          await writeAudit({
            organizationId: profile.organization_id,
            projectId,
            paymentId: existingId,
            entityType: 'payment',
            fieldName: 'actual_amount',
            oldValue: String(before.actual_amount),
            newValue: String(toMoneyNumber(input.actualAmount)),
            changedBy: profile.id,
          })
        }
        return data as ProjectPayment
      }

      payload.id = paymentId
      payload.created_by = profile.id

      const { data, error } = await supabase.from('project_payments').insert(payload).select().single()
      if (error) {
        if (proofPath) {
          await supabase.storage.from(FINANCE_BUCKET).remove([proofPath])
        }
        throw error
      }
      return data as ProjectPayment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-payments', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-financial-audit', projectId] })
    },
  })
}

export function useVoidProjectPayment(projectId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (paymentId: string) => {
      if (!profile?.id) throw new Error('Missing profile')
      const { data: before } = await supabase
        .from('project_payments')
        .select('*')
        .eq('id', paymentId)
        .single()
      if (!before) throw new Error('Payment not found')

      const { data, error } = await supabase
        .from('project_payments')
        .update({
          status: 'void',
          voided_at: new Date().toISOString(),
          voided_by: profile.id,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
          stripe_payment_link_active: false,
        })
        .eq('id', paymentId)
        .select()
        .single()
      if (error) throw error

      await writeAudit({
        organizationId: before.organization_id,
        projectId,
        paymentId,
        entityType: 'payment',
        fieldName: 'status',
        oldValue: before.status,
        newValue: 'void',
        changedBy: profile.id,
      })
      return data as ProjectPayment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-payments', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-financial-audit', projectId] })
    },
  })
}

export type UpsertReceiptInput = {
  id?: string
  receiptNumber?: string | null
  amount: number
  receivedOn: string
  notes?: string | null
  proofFile?: File | null
  clearProof?: boolean
}

export function useUpsertProjectReceipt(projectId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (input: UpsertReceiptInput) => {
      if (!profile?.id || !profile.organization_id) throw new Error('Missing profile')
      if (input.amount < 0) throw new Error('Receipt amount cannot be negative')

      let proofPath: string | null | undefined
      let proofMime: string | null | undefined
      let proofName: string | null | undefined

      if (input.clearProof) {
        proofPath = null
        proofMime = null
        proofName = null
      }

      const receiptId = input.id ?? crypto.randomUUID()
      if (input.proofFile) {
        const validationError = validateUploadFile(input.proofFile)
        if (validationError) throw new Error(validationError)
        const safeName = input.proofFile.name.replace(/[^\w.\-()+ ]+/g, '_')
        proofPath = `${projectId}/receipts/${receiptId}-${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from(FINANCE_BUCKET)
          .upload(proofPath, input.proofFile)
        if (uploadError) throw uploadError
        proofMime = input.proofFile.type || null
        proofName = input.proofFile.name
      }

      const payload: Record<string, unknown> = {
        organization_id: profile.organization_id,
        project_id: projectId,
        receipt_number: input.receiptNumber?.trim() || null,
        amount: toMoneyNumber(input.amount),
        received_on: input.receivedOn,
        notes: input.notes?.trim() || null,
        status: 'active',
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }
      if (proofPath !== undefined) {
        payload.proof_storage_path = proofPath
        payload.proof_mime_type = proofMime ?? null
        payload.proof_file_name = proofName ?? null
      }

      if (input.id) {
        const { data: before } = await supabase
          .from('project_receipts')
          .select('*')
          .eq('id', input.id)
          .maybeSingle()
        const { data, error } = await supabase
          .from('project_receipts')
          .update(payload)
          .eq('id', input.id)
          .select()
          .single()
        if (error) throw error
        if (before && toMoneyNumber(before.amount) !== toMoneyNumber(input.amount)) {
          await writeAudit({
            organizationId: profile.organization_id,
            projectId,
            receiptId: input.id,
            entityType: 'receipt',
            fieldName: 'amount',
            oldValue: String(before.amount),
            newValue: String(toMoneyNumber(input.amount)),
            changedBy: profile.id,
          })
        }
        return data as ProjectReceipt
      }

      payload.id = receiptId
      payload.created_by = profile.id
      const { data, error } = await supabase.from('project_receipts').insert(payload).select().single()
      if (error) throw error
      return data as ProjectReceipt
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-receipts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-financial-audit', projectId] })
    },
  })
}

export function useVoidProjectReceipt(projectId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (receiptId: string) => {
      if (!profile?.id) throw new Error('Missing profile')
      const { data: before } = await supabase
        .from('project_receipts')
        .select('*')
        .eq('id', receiptId)
        .single()
      if (!before) throw new Error('Receipt not found')

      const { data, error } = await supabase
        .from('project_receipts')
        .update({
          status: 'void',
          voided_at: new Date().toISOString(),
          voided_by: profile.id,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', receiptId)
        .select()
        .single()
      if (error) throw error

      await writeAudit({
        organizationId: before.organization_id,
        projectId,
        receiptId,
        entityType: 'receipt',
        fieldName: 'status',
        oldValue: before.status,
        newValue: 'void',
        changedBy: profile.id,
      })
      return data as ProjectReceipt
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-receipts', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-financial-audit', projectId] })
    },
  })
}
