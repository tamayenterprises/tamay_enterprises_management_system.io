import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { AttendanceRecord, UserRole } from '@/types/database'

export type AttendanceFilters = {
  userId?: string
  role?: UserRole | 'all'
  projectId?: string
  fromDate?: string
  toDate?: string
}

export function useMyOpenAttendance() {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['attendance', 'open', profile?.id],
    enabled: Boolean(profile?.id),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*, project:projects(*)')
        .eq('user_id', profile!.id)
        .is('clock_out_time', null)
        .order('clock_in_time', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as AttendanceRecord | null) ?? null
    },
  })
}

export function useMyAttendanceHistory(limit = 14) {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['attendance', 'mine', profile?.id, limit],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*, project:projects(*)')
        .eq('user_id', profile!.id)
        .order('clock_in_time', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as AttendanceRecord[]
    },
  })
}

export function useAttendanceRecords(filters: AttendanceFilters = {}) {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['attendance', 'management', profile?.organization_id, filters],
    enabled: Boolean(profile?.organization_id),
    queryFn: async () => {
      let query = supabase
        .from('attendance_records')
        .select('*, project:projects(*), profile:profiles!user_id(*)')
        .order('clock_in_time', { ascending: false })
        .limit(200)

      if (filters.userId) query = query.eq('user_id', filters.userId)
      if (filters.projectId) query = query.eq('project_id', filters.projectId)
      if (filters.fromDate) query = query.gte('clock_in_time', `${filters.fromDate}T00:00:00`)
      if (filters.toDate) query = query.lte('clock_in_time', `${filters.toDate}T23:59:59.999`)

      const { data, error } = await query
      if (error) throw error

      let rows = (data ?? []) as AttendanceRecord[]
      if (filters.role && filters.role !== 'all') {
        rows = rows.filter((row) => row.profile?.role === filters.role)
      }
      return rows
    },
  })
}

export function useClockIn() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ projectId }: { projectId?: string | null }) => {
      if (!profile?.organization_id) throw new Error('Missing organization')

      const { data, error } = await supabase
        .from('attendance_records')
        .insert({
          organization_id: profile.organization_id,
          user_id: profile.id,
          project_id: projectId || null,
          clock_in_time: new Date().toISOString(),
        })
        .select('*, project:projects(*)')
        .single()
      if (error) throw error
      return data as AttendanceRecord
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      queryClient.invalidateQueries({ queryKey: ['worker-status'] })
    },
  })
}

export function useClockOut() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ recordId }: { recordId: string }) => {
      if (!profile?.id) throw new Error('Not signed in')

      const { data, error } = await supabase
        .from('attendance_records')
        .update({ clock_out_time: new Date().toISOString() })
        .eq('id', recordId)
        .eq('user_id', profile.id)
        .is('clock_out_time', null)
        .select('*, project:projects(*)')
        .single()
      if (error) throw error
      return data as AttendanceRecord
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      queryClient.invalidateQueries({ queryKey: ['worker-status'] })
    },
  })
}

export function useCorrectAttendance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      clockInTime,
      clockOutTime,
      projectId,
      notes,
    }: {
      id: string
      clockInTime: string
      clockOutTime: string | null
      projectId?: string | null
      notes?: string | null
    }) => {
      const { data, error } = await supabase
        .from('attendance_records')
        .update({
          clock_in_time: clockInTime,
          clock_out_time: clockOutTime,
          project_id: projectId || null,
          notes: notes || null,
        })
        .eq('id', id)
        .select('*, project:projects(*), profile:profiles!user_id(*)')
        .single()
      if (error) throw error
      return data as AttendanceRecord
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      queryClient.invalidateQueries({ queryKey: ['worker-status'] })
    },
  })
}
