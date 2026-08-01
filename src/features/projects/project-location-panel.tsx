import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useGeocodeAddress,
  useVerifyProjectLocation,
} from '@/features/attendance/hooks'
import {
  DEFAULT_GEOFENCE_RADIUS_FEET,
  DEFAULT_GEOFENCE_RADIUS_METERS,
  feetToMeters,
  formatDistance,
  metersToFeet,
  requestDeviceLocation,
} from '@/lib/geo'
import { formatDate } from '@/lib/utils'
import type { Project } from '@/types/database'

/** Parse lat/lng safely. Empty string must NOT become 0 (that verified projects at null island). */
export function parseProjectCoordinates(
  latRaw: string,
  lngRaw: string,
): { lat: number; lng: number } | { error: string } {
  const latText = latRaw.trim()
  const lngText = lngRaw.trim()

  // Allow pasting "40.7128, -74.0060" into the latitude field alone
  if (latText.includes(',') && !lngText) {
    const parts = latText.split(',').map((p) => p.trim())
    if (parts.length >= 2) {
      return parseProjectCoordinates(parts[0], parts[1])
    }
  }

  if (!latText || !lngText) {
    return {
      error:
        'Latitude and Longitude numbers are required. Copying only the street address is not enough — paste the GPS numbers from Google Maps.',
    }
  }

  // Strip degree symbols / N/S/E/W labels people paste from Maps
  const normalize = (value: string) =>
    value
      .replace(/°/g, '')
      .replace(/\s*[NnSs]\s*$/g, '')
      .replace(/\s*[EeWw]\s*$/g, '')
      .trim()

  let lat = Number(normalize(latText))
  let lng = Number(normalize(lngText))

  // If user typed W longitude without minus (common), Maps often shows W separately
  if (/[Ww]\s*$/.test(lngText) && lng > 0) lng = -lng
  if (/[Ss]\s*$/.test(latText) && lat > 0) lat = -lat

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'Could not read latitude/longitude. Use numbers like 40.7128 and -74.0060.' }
  }
  if (lat < -90 || lat > 90) {
    return { error: 'Latitude must be between -90 and 90. You may have swapped latitude and longitude.' }
  }
  if (lng < -180 || lng > 180) {
    return { error: 'Longitude must be between -180 and 180.' }
  }
  if (lat === 0 && lng === 0) {
    return {
      error:
        'Coordinates 0, 0 are not allowed (that is in the ocean). Paste real GPS coordinates from your house.',
    }
  }

  // Heuristic: in the Americas longitude is negative. If lat looks like a US longitude magnitude, warn via swap hint
  if (Math.abs(lng) <= 90 && Math.abs(lat) > 90) {
    return { error: 'Latitude/longitude appear swapped.' }
  }

  return { lat, lng }
}

export function ProjectLocationPanel({ project }: { project: Project }) {
  const verify = useVerifyProjectLocation()
  const geocode = useGeocodeAddress()
  const [gpsBusy, setGpsBusy] = useState(false)

  const [address, setAddress] = useState(project.job_site_address || project.location || '')
  const [latitude, setLatitude] = useState(project.latitude != null ? String(project.latitude) : '')
  const [longitude, setLongitude] = useState(project.longitude != null ? String(project.longitude) : '')
  const [radiusFeet, setRadiusFeet] = useState(
    String(Math.round(metersToFeet(Number(project.geofence_radius_meters || DEFAULT_GEOFENCE_RADIUS_METERS)))),
  )

  useEffect(() => {
    setAddress(project.job_site_address || project.location || '')
    setLatitude(project.latitude != null ? String(project.latitude) : '')
    setLongitude(project.longitude != null ? String(project.longitude) : '')
    setRadiusFeet(
      String(Math.round(metersToFeet(Number(project.geofence_radius_meters || DEFAULT_GEOFENCE_RADIUS_METERS)))),
    )
  }, [project])

  const status = project.location_verification_status

  async function saveVerification() {
    const parsed = parseProjectCoordinates(latitude, longitude)
    if ('error' in parsed) {
      toast.error(parsed.error)
      return
    }
    try {
      await verify.mutateAsync({
        projectId: project.id,
        latitude: parsed.lat,
        longitude: parsed.lng,
        jobSiteAddress: address.trim() || null,
        geofenceRadiusMeters: feetToMeters(Number(radiusFeet) || DEFAULT_GEOFENCE_RADIUS_FEET),
      })
      toast.success(`Location verified at ${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Verification failed')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job-site location</CardTitle>
        <CardDescription>
          Attendance uses GPS numbers (latitude/longitude), not only the street address text. Default radius{' '}
          {DEFAULT_GEOFENCE_RADIUS_FEET} ft.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status === 'verified' ? 'secondary' : 'destructive'}>
            {status === 'verified' ? 'Verified' : status === 'needs_verification' ? 'Needs verification' : 'Unverified'}
          </Badge>
          {project.location_verified_at ? (
            <span className="text-xs text-muted-foreground">
              Verified {formatDate(project.location_verified_at)}
            </span>
          ) : null}
        </div>

        {project.latitude != null && project.longitude != null ? (
          <div className="rounded-md border border-border bg-[#fbfcff] px-3 py-2 text-xs">
            <p className="font-medium">Coordinates saved on this project</p>
            <p className="text-muted-foreground">
              Lat {Number(project.latitude).toFixed(6)}, Lng {Number(project.longitude).toFixed(6)} · radius{' '}
              {Math.round(metersToFeet(Number(project.geofence_radius_meters || DEFAULT_GEOFENCE_RADIUS_METERS)))} ft
            </p>
            <p className="mt-1 text-amber-800">
              Clock In compares your phone GPS to these numbers. If they are wrong, you will look “miles away”
              even when standing at the street address.
            </p>
          </div>
        ) : (
          <p className="text-xs text-amber-800">
            No coordinates saved yet. The street address alone is not enough — set Latitude/Longitude below.
          </p>
        )}

        <div className="space-y-1">
          <Label>Job-site address (label only)</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={gpsBusy || verify.isPending}
            onClick={async () => {
              setGpsBusy(true)
              try {
                const loc = await requestDeviceLocation()
                setLatitude(String(loc.latitude))
                setLongitude(String(loc.longitude))
                toast.success(
                  `Phone GPS captured: ${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}. Now press Verify & save.`,
                )
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not read phone GPS')
              } finally {
                setGpsBusy(false)
              }
            }}
          >
            {gpsBusy ? 'Reading GPS…' : 'Use my current GPS (best for home test)'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!address.trim() || geocode.isPending}
            onClick={async () => {
              try {
                const result = await geocode.mutateAsync(address.trim())
                setLatitude(String(result.latitude))
                setLongitude(String(result.longitude))
                if (result.label) setAddress(result.label)
                toast.success(`Coordinates found (${result.provider}). Press Verify & save.`)
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : 'Generate coordinates needs the Edge Function. Use “Use my current GPS” instead.',
                )
              }
            }}
          >
            {geocode.isPending ? 'Looking up…' : 'Generate coordinates'}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Latitude (required number)</Label>
            <Input
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 40.712800"
            />
          </div>
          <div className="space-y-1">
            <Label>Longitude (required number)</Label>
            <Input
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. -74.006000"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          In Google Maps: press and hold your house → tap the coordinates to copy → paste here (first number =
          latitude, second = longitude). Or use <strong>Use my current GPS</strong> while standing at the job
          site.
        </p>

        <div className="space-y-1">
          <Label>Authorized radius (feet)</Label>
          <Input
            type="number"
            min={50}
            max={52800}
            value={radiusFeet}
            onChange={(e) => setRadiusFeet(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            ≈ {formatDistance(feetToMeters(Number(radiusFeet) || DEFAULT_GEOFENCE_RADIUS_FEET))}
          </p>
        </div>

        <Button disabled={verify.isPending} onClick={() => void saveVerification()}>
          {verify.isPending ? 'Saving…' : 'Verify & save location'}
        </Button>
      </CardContent>
    </Card>
  )
}
