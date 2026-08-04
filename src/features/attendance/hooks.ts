import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import {
  deviceInfoPayload,
  newIdempotencyKey,
  requestDeviceLocation,
  type AttendanceActionType,
} from '@/lib/geo'
import type {
  AttendanceActionResult,
  AttendanceAttempt,
  AttendanceCorrection,
  AttendanceEvent,
  AttendanceExceptionRequest,
  AttendanceRecord,
  UserRole,
} from '@/types/database'

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

export function useAttendanceEvents(recordId?: string) {
  return useQuery({
    queryKey: ['attendance-events', recordId],
    enabled: Boolean(recordId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_events')
        .select('*')
        .eq('attendance_record_id', recordId!)
        .order('server_timestamp', { ascending: true })
      if (error) throw error
      return (data ?? []) as AttendanceEvent[]
    },
  })
}

export function useAttendanceAttempts(filters: { userId?: string; onlyRejected?: boolean } = {}) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['attendance-attempts', profile?.organization_id, filters],
    enabled: Boolean(profile?.organization_id),
    queryFn: async () => {
      let query = supabase
        .from('attendance_attempts')
        .select('*, profile:profiles!user_id(*), project:projects(*)')
        .order('server_timestamp', { ascending: false })
        .limit(100)
      if (filters.userId) query = query.eq('user_id', filters.userId)
      if (filters.onlyRejected) query = query.neq('validation_result', 'approved')
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as AttendanceAttempt[]
    },
  })
}

export function useAttendanceCorrections(recordId?: string) {
  return useQuery({
    queryKey: ['attendance-corrections', recordId],
    enabled: Boolean(recordId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_corrections')
        .select('*, corrector:profiles!corrected_by(*)')
        .eq('attendance_record_id', recordId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as AttendanceCorrection[]
    },
  })
}

export function useExceptionRequests(status?: 'pending' | 'all') {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['attendance-exceptions', profile?.organization_id, status],
    enabled: Boolean(profile?.organization_id),
    queryFn: async () => {
      let query = supabase
        .from('attendance_exception_requests')
        .select('*, profile:profiles!user_id(*), project:projects(*)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (status === 'pending') query = query.eq('status', 'pending')
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as AttendanceExceptionRequest[]
    },
  })
}

function asAppError(error: unknown, fallback = 'Attendance action failed'): Error {
  if (error instanceof Error) return error
  if (typeof error === 'object' && error && 'message' in error) {
    const message = String((error as { message?: unknown }).message || fallback)
    return new Error(message)
  }
  return new Error(typeof error === 'string' ? error : fallback)
}

export function useRecordAttendanceAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      action,
      projectId,
      skipLocation,
    }: {
      action: AttendanceActionType
      projectId: string
      skipLocation?: boolean
    }) => {
      if (!projectId) throw new Error('Select an assigned project first')

      let latitude: number | null = null
      let longitude: number | null = null
      let accuracyMeters: number | null = null

      if (!skipLocation) {
        const loc = await requestDeviceLocation()
        latitude = loc.latitude
        longitude = loc.longitude
        accuracyMeters = loc.accuracyMeters
      }

      const { data, error } = await supabase.rpc('record_attendance_action', {
        p_action: action,
        p_project_id: projectId,
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy_meters: accuracyMeters,
        p_device_info: deviceInfoPayload(),
        p_idempotency_key: newIdempotencyKey(),
        p_session_id: null,
      })

      if (error) throw asAppError(error, error.message || 'Attendance RPC failed')

      const result = data as AttendanceActionResult
      if (!result?.ok) {
        const err = asAppError(
          result?.rejection_reason || 'Attendance action was rejected by location or status checks',
        ) as Error & { result?: AttendanceActionResult }
        err.result = result
        throw err
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-events'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-attempts'] })
      queryClient.invalidateQueries({ queryKey: ['worker-status'] })
    },
  })
}

/** @deprecated Prefer useRecordAttendanceAction */
export function useClockIn() {
  const record = useRecordAttendanceAction()
  return useMutation({
    mutationFn: async ({ projectId }: { projectId?: string | null }) => {
      if (!projectId) throw new Error('Select an assigned project to clock in')
      return record.mutateAsync({ action: 'WORK_STARTED', projectId })
    },
  })
}

/** @deprecated Prefer useRecordAttendanceAction */
export function useClockOut() {
  const record = useRecordAttendanceAction()
  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      return record.mutateAsync({ action: 'WORK_ENDED', projectId })
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
      breakSeconds,
      reason,
      notes,
    }: {
      id: string
      clockInTime: string
      clockOutTime: string | null
      projectId?: string | null
      breakSeconds?: number
      reason: string
      notes?: string | null
    }) => {
      const { data, error } = await supabase.rpc('correct_attendance_record', {
        p_record_id: id,
        p_clock_in_time: clockInTime,
        p_clock_out_time: clockOutTime,
        p_project_id: projectId || null,
        p_break_seconds: breakSeconds ?? null,
        p_reason: reason,
        p_notes: notes || null,
      })
      if (error) throw error
      return data as { ok: boolean; record: AttendanceRecord }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] })
      queryClient.invalidateQueries({ queryKey: ['worker-status'] })
    },
  })
}

export function useSubmitExceptionRequest() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      projectId,
      action,
      explanation,
      latitude,
      longitude,
      accuracyMeters,
      distanceMeters,
      photo,
    }: {
      projectId: string
      action: AttendanceActionType
      explanation: string
      latitude?: number | null
      longitude?: number | null
      accuracyMeters?: number | null
      distanceMeters?: number | null
      photo?: File | null
    }) => {
      if (!profile?.organization_id) throw new Error('Missing organization')
      if (!explanation.trim()) throw new Error('Please explain the location problem')

      let photoPath: string | null = null
      if (photo) {
        const safeName = photo.name.replace(/[^\w.\-()+ ]+/g, '_')
        photoPath = `${profile.id}/${projectId}/${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('attendance-exceptions')
          .upload(photoPath, photo)
        if (uploadError) throw uploadError
      }

      const { data, error } = await supabase
        .from('attendance_exception_requests')
        .insert({
          organization_id: profile.organization_id,
          user_id: profile.id,
          project_id: projectId,
          requested_action: action,
          explanation: explanation.trim(),
          employee_latitude: latitude ?? null,
          employee_longitude: longitude ?? null,
          device_accuracy_meters: accuracyMeters ?? null,
          calculated_distance_meters: distanceMeters ?? null,
          photo_path: photoPath,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as AttendanceExceptionRequest
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-exceptions'] })
    },
  })
}

export function useResolveExceptionRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      requestId,
      approve,
      adminNote,
      createAttendance,
    }: {
      requestId: string
      approve: boolean
      adminNote?: string
      createAttendance?: boolean
    }) => {
      const { data, error } = await supabase.rpc('resolve_attendance_exception', {
        p_request_id: requestId,
        p_approve: approve,
        p_admin_note: adminNote || null,
        p_create_attendance: Boolean(createAttendance),
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-exceptions'] })
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
  })
}

export function useVerifyProjectLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      latitude,
      longitude,
      jobSiteAddress,
      geofenceRadiusMeters,
    }: {
      projectId: string
      latitude: number
      longitude: number
      jobSiteAddress?: string | null
      geofenceRadiusMeters?: number | null
    }) => {
      const { data, error } = await supabase.rpc('verify_project_location', {
        p_project_id: projectId,
        p_latitude: latitude,
        p_longitude: longitude,
        p_job_site_address: jobSiteAddress || null,
        p_geofence_radius_meters: geofenceRadiusMeters ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useGeocodeAddress() {
  return useMutation({
    mutationFn: async (address: string) => {
      const { data, error } = await supabase.functions.invoke('geocode-address', {
        body: { address },
      })
      if (error) throw error
      if (data?.error) throw new Error(String(data.error))
      return data as { latitude: number; longitude: number; label: string; provider: string }
    },
  })
}
