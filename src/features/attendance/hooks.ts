import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-hooks'
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
      if (status === 'pending') {
        query = query.in('status', ['pending', 'under_review'])
      }
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

export type CapturedAttendanceLocation = {
  latitude: number
  longitude: number
  accuracyMeters: number
}

export type AttendanceActionError = Error & {
  result?: AttendanceActionResult
  capturedLocation?: CapturedAttendanceLocation | null
  allowExceptionRequest?: boolean
}

function friendlyAttendanceRpcMessage(raw: string): string {
  if (/approved active profile required/i.test(raw)) {
    return 'Your worker profile is inactive or not approved for attendance. Ask management to activate your profile, then try again.'
  }
  return raw
}

export function useRecordAttendanceAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      action,
      projectId,
      skipLocation,
      idempotencyKey,
    }: {
      action: AttendanceActionType
      projectId: string
      skipLocation?: boolean
      /** Stable key for this button press (avoids duplicate rows under flaky network). */
      idempotencyKey?: string
    }) => {
      if (!projectId) throw new Error('Select an assigned project first')

      let latitude: number | null = null
      let longitude: number | null = null
      let accuracyMeters: number | null = null
      let capturedLocation: CapturedAttendanceLocation | null = null

      if (!skipLocation) {
        try {
          const loc = await requestDeviceLocation()
          latitude = loc.latitude
          longitude = loc.longitude
          accuracyMeters = loc.accuracyMeters
          capturedLocation = loc
        } catch (locationError) {
          const err = asAppError(locationError) as AttendanceActionError
          err.allowExceptionRequest = true
          err.capturedLocation = null
          throw err
        }
      }

      const { data, error } = await supabase.rpc('record_attendance_action', {
        p_action: action,
        p_project_id: projectId,
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy_meters: accuracyMeters,
        p_device_info: deviceInfoPayload(),
        p_idempotency_key: idempotencyKey || newIdempotencyKey(),
        p_session_id: null,
      })

      if (error) {
        const err = asAppError(
          friendlyAttendanceRpcMessage(error.message || 'Attendance RPC failed'),
        ) as AttendanceActionError
        err.allowExceptionRequest = true
        err.capturedLocation = capturedLocation
        throw err
      }

      const result = data as AttendanceActionResult
      if (!result?.ok) {
        const err = asAppError(
          friendlyAttendanceRpcMessage(
            result?.rejection_reason || 'Attendance action was rejected by location or status checks',
          ),
        ) as AttendanceActionError
        err.result = result
        err.allowExceptionRequest = Boolean(result?.allow_exception_request)
        err.capturedLocation = capturedLocation
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
      exceptionRequestId,
      correctionMode,
      timeline,
      idempotencyKey,
      expectedUpdatedAt,
      reasonCode,
    }: {
      id: string
      clockInTime: string
      clockOutTime: string | null
      projectId?: string | null
      breakSeconds?: number
      reason: string
      notes?: string | null
      exceptionRequestId?: string | null
      correctionMode?: 'simple' | 'detailed'
      timeline?: Array<{ action: string; timestamp: string; exclude?: boolean }> | null
      idempotencyKey?: string | null
      expectedUpdatedAt?: string | null
      reasonCode?: string | null
    }) => {
      if (!projectId) {
        throw new Error('The project selected for this correction is not valid.')
      }
      const { data, error } = await supabase.rpc('correct_attendance_record', {
        p_record_id: id,
        p_clock_in_time: clockInTime,
        p_clock_out_time: clockOutTime,
        p_project_id: projectId,
        p_break_seconds: breakSeconds ?? null,
        p_reason: reason,
        p_notes: notes || null,
        p_exception_request_id: exceptionRequestId || null,
        p_correction_mode: correctionMode || 'simple',
        p_timeline: timeline || null,
        p_idempotency_key: idempotencyKey || null,
        p_expected_updated_at: expectedUpdatedAt || null,
        p_reason_code: reasonCode || null,
      })
      if (error) throw asAppError(error, 'We could not save this correction because of a server error.')
      return data as {
        ok: boolean
        message?: string
        correction_id?: string
        record: AttendanceRecord
        request_status?: string | null
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-events'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-exceptions'] })
      queryClient.invalidateQueries({ queryKey: ['worker-status'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
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
      attendanceRecordId,
      idempotencyKey,
      followUpNote,
    }: {
      projectId: string
      action: AttendanceActionType
      explanation: string
      latitude?: number | null
      longitude?: number | null
      accuracyMeters?: number | null
      distanceMeters?: number | null
      photo?: File | null
      attendanceRecordId?: string | null
      idempotencyKey?: string | null
      followUpNote?: string | null
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
        if (uploadError) throw asAppError(uploadError, 'Photo upload failed')
      }

      const { data, error } = await supabase.rpc('submit_attendance_exception', {
        p_project_id: projectId,
        p_requested_action: action,
        p_explanation: explanation.trim(),
        p_employee_latitude: latitude ?? null,
        p_employee_longitude: longitude ?? null,
        p_device_accuracy_meters: accuracyMeters ?? null,
        p_calculated_distance_meters: distanceMeters ?? null,
        p_photo_path: photoPath,
        p_attendance_record_id: attendanceRecordId ?? null,
        p_idempotency_key: idempotencyKey || newIdempotencyKey(),
        p_follow_up_note: followUpNote || null,
      })
      if (error) throw asAppError(error, 'Submit failed')

      const result = data as {
        ok: boolean
        duplicate?: boolean
        message?: string
        code?: string
        request?: AttendanceExceptionRequest
      }

      if (result?.duplicate) {
        const err = asAppError(
          result.message ||
            'You already submitted a request for this attendance issue. Management has not completed its review yet.',
        ) as Error & { result?: typeof result }
        err.result = result
        throw err
      }
      if (!result?.ok) {
        throw asAppError(result?.message || 'Submit failed')
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-exceptions'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useMyActiveExceptionRequest(projectId?: string, action?: AttendanceActionType) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['attendance-exceptions', 'mine-active', profile?.id, projectId, action],
    enabled: Boolean(profile?.id && projectId && action),
    queryFn: async () => {
      let query = supabase
        .from('attendance_exception_requests')
        .select('*, project:projects(*)')
        .eq('user_id', profile!.id)
        .eq('project_id', projectId!)
        .eq('requested_action', action!)
        .in('status', ['pending', 'under_review'])
        .order('created_at', { ascending: false })
        .limit(1)
      const { data, error } = await query.maybeSingle()
      if (error) throw error
      return (data as AttendanceExceptionRequest | null) ?? null
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
      if (error) throw asAppError(error, 'Failed to resolve exception')
      return data as { ok: boolean; status?: string; message?: string; attendance_record_id?: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-exceptions'] })
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
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
