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
  DEFAULT_MAX_GPS_ACCURACY_METERS,
  feetToMeters,
  formatDistance,
  metersToFeet,
  requestDeviceLocation,
} from '@/lib/geo'
import {
  googleMapsUrl,
  looksLikeMissingConnecticutMinusSign,
  openStreetMapUrl,
  parseProjectCoordinates,
} from '@/lib/project-coords'
import { formatDate } from '@/lib/utils'
import type { Project } from '@/types/database'

export { parseProjectCoordinates } from '@/lib/project-coords'

export function ProjectLocationPanel({ project }: { project: Project }) {
  const verify = useVerifyProjectLocation()
  const geocode = useGeocodeAddress()
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)

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
  const savedSuspicious =
    project.latitude != null &&
    project.longitude != null &&
    looksLikeMissingConnecticutMinusSign(Number(project.latitude), Number(project.longitude))

  const preview = parseProjectCoordinates(latitude, longitude, { address })
  const previewOk = !('error' in preview)

  async function saveVerification() {
    const parsed = parseProjectCoordinates(latitude, longitude, { address })
    if ('error' in parsed) {
      toast.error(parsed.error)
      return
    }
    for (const warning of parsed.warnings) {
      toast.message(warning)
    }
    if (
      gpsAccuracy != null &&
      gpsAccuracy > DEFAULT_MAX_GPS_ACCURACY_METERS &&
      !window.confirm(
        `Your current GPS accuracy is approximately ${Math.round(gpsAccuracy)} meters. Move near a window or open area and retry for a more reliable project location.\n\nSave anyway?`,
      )
    ) {
      return
    }
    if (
      !window.confirm(
        `Confirm these coordinates mark the job site?\n\nLat ${parsed.lat.toFixed(6)}\nLng ${parsed.lng.toFixed(6)}\n\nYou should be physically at the site when using phone GPS.`,
      )
    ) {
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
      setGpsAccuracy(null)
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
          <Badge variant={status === 'verified' && !savedSuspicious ? 'secondary' : 'destructive'}>
            {savedSuspicious
              ? 'Invalid coordinates'
              : status === 'verified'
                ? 'Verified'
                : status === 'needs_verification'
                  ? 'Needs verification'
                  : 'Not configured'}
          </Badge>
          {project.location_verified_at ? (
            <span className="text-xs text-muted-foreground">
              Verified {formatDate(project.location_verified_at)}
            </span>
          ) : null}
        </div>

        {savedSuspicious ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <p className="font-medium">Warning: project longitude is positive</p>
            <p>
              Connecticut locations require a western, negative longitude (example:{' '}
              <code>-72.95269</code>). Geofenced attendance is blocked until this is corrected.
            </p>
          </div>
        ) : null}

        {project.latitude != null && project.longitude != null ? (
          <div className="rounded-md border border-border bg-[#fbfcff] px-3 py-2 text-xs">
            <p className="font-medium">Coordinates saved on this project</p>
            <p className="text-muted-foreground">
              Latitude {Number(project.latitude).toFixed(6)}, Longitude {Number(project.longitude).toFixed(6)} ·
              radius{' '}
              {Math.round(metersToFeet(Number(project.geofence_radius_meters || DEFAULT_GEOFENCE_RADIUS_METERS)))} ft
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <a
                  href={openStreetMapUrl(Number(project.latitude), Number(project.longitude))}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on map
                </a>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a
                  href={googleMapsUrl(Number(project.latitude), Number(project.longitude))}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Google Maps
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-amber-800">
            No coordinates saved yet. The street address alone is not enough — set Latitude/Longitude below.
          </p>
        )}

        <div className="space-y-1">
          <Label>Job-site address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, CT ZIP" />
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
                setGpsAccuracy(loc.accuracyMeters)
                toast.success(
                  `Current job-site GPS captured successfully (${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}). Review and confirm the location.`,
                )
                if (loc.accuracyMeters > DEFAULT_MAX_GPS_ACCURACY_METERS) {
                  toast.message(
                    `Your current GPS accuracy is approximately ${Math.round(loc.accuracyMeters)} meters. Move near a window or open area and retry for a more reliable project location.`,
                  )
                }
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not read phone GPS')
              } finally {
                setGpsBusy(false)
              }
            }}
          >
            {gpsBusy ? 'Reading GPS…' : 'Use my current GPS'}
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
                setGpsAccuracy(null)
                if (result.label) setAddress(result.label)
                toast.success(
                  `We found this project location from the address (${result.provider}). Confirm the marker before enabling geofenced attendance.`,
                )
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : 'Generate coordinates needs the Edge Function. Use “Use my current GPS” instead.',
                )
              }
            }}
          >
            {geocode.isPending ? 'Looking up…' : 'Generate GPS from address'}
          </Button>
          {previewOk ? (
            <Button asChild size="sm" variant="outline">
              <a
                href={openStreetMapUrl(preview.lat, preview.lng)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Preview draft on map
              </a>
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Latitude</Label>
            <Input
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 41.26208"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label>Longitude</Label>
            <Input
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              inputMode="text"
              placeholder="e.g. -72.95269"
              autoComplete="off"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Connecticut longitude values are normally <strong>negative</strong>. Do not omit the minus sign.
          Example: <code>41.26208</code>, <code>-72.95269</code>. Prefer <strong>Use my current GPS</strong> while
          standing at the job site, or generate from the address.
        </p>
        {gpsAccuracy != null ? (
          <p className="text-xs text-muted-foreground">
            Last phone GPS accuracy: ~{Math.round(gpsAccuracy)} m
            {gpsAccuracy > DEFAULT_MAX_GPS_ACCURACY_METERS ? ' (poor — retry outdoors if possible)' : ''}
          </p>
        ) : null}

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
          {verify.isPending ? 'Saving…' : 'Confirm location & save'}
        </Button>
      </CardContent>
    </Card>
  )
}
