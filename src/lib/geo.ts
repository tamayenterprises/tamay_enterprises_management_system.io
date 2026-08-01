/** Attendance geofencing helpers (client-side display / pre-checks only).
 * Official distance validation always runs on the server via RPC.
 */

export const FEET_PER_METER = 3.280839895
export const DEFAULT_GEOFENCE_RADIUS_FEET = 300
export const DEFAULT_GEOFENCE_RADIUS_METERS = 91.44
export const DEFAULT_MAX_GPS_ACCURACY_FEET = 150
export const DEFAULT_MAX_GPS_ACCURACY_METERS = 45.72

export type AttendanceActionType =
  | 'WORK_STARTED'
  | 'BREAK_STARTED'
  | 'BREAK_ENDED'
  | 'WORK_ENDED'

export type AttendanceWorkflowStatus = 'working' | 'on_break' | 'completed'

export function metersToFeet(meters: number): number {
  return meters * FEET_PER_METER
}

export function feetToMeters(feet: number): number {
  return feet / FEET_PER_METER
}

/** Haversine distance in meters (must match server formula). */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const r = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || Number.isNaN(meters)) return '—'
  const feet = metersToFeet(meters)
  if (feet < 1000) return `${Math.round(feet)} ft (${Math.round(meters)} m)`
  return `${(feet / 5280).toFixed(2)} mi (${(meters / 1000).toFixed(2)} km)`
}

export function formatBreakDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(seconds ?? 0)))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h <= 0) return `${m} min`
  return `${h}h ${m}m`
}

export function paidWorkingHours(params: {
  clockIn: string
  clockOut: string | null
  breakSeconds: number
}): number | null {
  if (!params.clockOut) return null
  const elapsed =
    (new Date(params.clockOut).getTime() - new Date(params.clockIn).getTime()) / 1000
  return Math.max(0, Math.round(((elapsed - params.breakSeconds) / 3600) * 100) / 100)
}

/** Client-side allowed next actions (server still enforces). */
export function nextAttendanceActions(
  status: AttendanceWorkflowStatus | null | undefined,
): AttendanceActionType[] {
  if (!status) return ['WORK_STARTED']
  if (status === 'working') return ['BREAK_STARTED', 'WORK_ENDED']
  if (status === 'on_break') return ['BREAK_ENDED']
  return []
}

export function actionButtonLabel(action: AttendanceActionType): string {
  switch (action) {
    case 'WORK_STARTED':
      return 'Clock In'
    case 'BREAK_STARTED':
      return 'Start Break'
    case 'BREAK_ENDED':
      return 'End Break'
    case 'WORK_ENDED':
      return 'Clock Out'
  }
}

export type DeviceLocation = {
  latitude: number
  longitude: number
  accuracyMeters: number
}

export async function requestDeviceLocation(
  options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 0,
  },
): Promise<DeviceLocation> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error(
      'Location services are not available on this device. Enable location and try again, or submit an exception request.',
    )
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
        })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new Error(
              'Location permission denied. Enable location access for this site, then retry. If you cannot enable it, submit an exception request.',
            ),
          )
          return
        }
        if (err.code === err.TIMEOUT) {
          reject(
            new Error(
              'Location timed out. Move near a window or open area, wait for a better GPS reading, then retry.',
            ),
          )
          return
        }
        reject(
          new Error(
            'Unable to read your location. Enable precise location, move to an open area, wait briefly, then retry.',
          ),
        )
      },
      options,
    )
  })
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function deviceInfoPayload(): Record<string, unknown> {
  if (typeof navigator === 'undefined') return {}
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
  }
}
