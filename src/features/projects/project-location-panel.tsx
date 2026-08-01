import { useState } from 'react'
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
} from '@/lib/geo'
import { formatDate } from '@/lib/utils'
import type { Project } from '@/types/database'

export function ProjectLocationPanel({ project }: { project: Project }) {
  const verify = useVerifyProjectLocation()
  const geocode = useGeocodeAddress()

  const [address, setAddress] = useState(project.job_site_address || project.location || '')
  const [latitude, setLatitude] = useState(project.latitude?.toString() ?? '')
  const [longitude, setLongitude] = useState(project.longitude?.toString() ?? '')
  const [radiusFeet, setRadiusFeet] = useState(
    String(Math.round(metersToFeet(Number(project.geofence_radius_meters || DEFAULT_GEOFENCE_RADIUS_METERS)))),
  )

  const status = project.location_verification_status

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job-site location</CardTitle>
        <CardDescription>
          Verify coordinates used for attendance geofencing (default radius {DEFAULT_GEOFENCE_RADIUS_FEET}{' '}
          ft). Geocoding runs on the server — API keys are never exposed in the browser.
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

        <div className="space-y-1">
          <Label>Job-site address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state" />
        </div>

        <div className="flex flex-wrap gap-2">
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
                toast.success(`Coordinates found (${result.provider})`)
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : 'Geocoding failed. Enter latitude/longitude manually or deploy the geocode-address Edge Function.',
                )
              }
            }}
          >
            {geocode.isPending ? 'Looking up…' : 'Generate coordinates'}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Latitude</Label>
            <Input value={latitude} onChange={(e) => setLatitude(e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label>Longitude</Label>
            <Input value={longitude} onChange={(e) => setLongitude(e.target.value)} inputMode="decimal" />
          </div>
        </div>

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

        <Button
          disabled={verify.isPending}
          onClick={async () => {
            const lat = Number(latitude)
            const lng = Number(longitude)
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              toast.error('Enter valid latitude and longitude')
              return
            }
            try {
              await verify.mutateAsync({
                projectId: project.id,
                latitude: lat,
                longitude: lng,
                jobSiteAddress: address.trim() || null,
                geofenceRadiusMeters: feetToMeters(Number(radiusFeet) || DEFAULT_GEOFENCE_RADIUS_FEET),
              })
              toast.success('Project location verified')
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Verification failed')
            }
          }}
        >
          {verify.isPending ? 'Saving…' : 'Verify & save location'}
        </Button>
      </CardContent>
    </Card>
  )
}
