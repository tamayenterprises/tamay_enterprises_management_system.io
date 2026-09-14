import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'
import type { Payment } from '@/types/database'

async function functionErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    const response = (error as { context?: Response }).context
    if (response && typeof response.json === 'function') {
      try {
        const body = await response.clone().json()
        if (body?.error) return String(body.error)
      } catch {
        /* keep fallback */
      }
    }
  }
  return error instanceof Error ? error.message : 'Unable to create payment link'
}

export function usePayments() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['payments', profile?.id, profile?.organization_id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, project:projects(*), recipient:profiles!recipient_id(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Payment[]
    },
  })
}

export function useCreatePaymentLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      projectId: string
      recipientId?: string
      amountCents: number
      description: string
      payerEmail?: string
    }) => {
      const { data, error } = await supabase.functions.invoke('create-payment-link', {
        body: input,
      })
      if (data?.error) throw new Error(String(data.error))
      if (error) throw new Error(await functionErrorMessage(error))
      if (!data?.payment) throw new Error('Unable to create payment link')
      return data.payment as Payment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
    },
  })
}

export function useRecordManualPayment() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      projectId: string
      recipientId?: string
      amountCents: number
      description: string
      paidAt?: string
    }) => {
      if (!profile?.id || !profile.organization_id) {
        throw new Error('Your account is missing an organization. Refresh and try again.')
      }
      const paidAt = input.paidAt ? new Date(`${input.paidAt}T12:00:00`).toISOString() : new Date().toISOString()
      const { data, error } = await supabase
        .from('payments')
        .insert({
          organization_id: profile.organization_id,
          project_id: input.projectId,
          recipient_id: input.recipientId || profile.id,
          created_by: profile.id,
          amount_cents: input.amountCents,
          currency: 'usd',
          description: input.description,
          status: 'paid',
          method: 'manual',
          paid_at: paidAt,
        })
        .select('*, project:projects(*), recipient:profiles!recipient_id(*)')
        .single()
      if (error) throw error
      return data as Payment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
    },
  })
}
