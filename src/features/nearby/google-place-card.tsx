import { ExternalLink, MapPin, Navigation, Phone, Star } from 'lucide-react'
import { formatPhoneDisplay, phoneHref } from '@/features/schedule/schedule-links'
import { formatMiles, type GooglePlaceHit } from '@/features/nearby/nearby-model'
import { googleDirectionsUrl } from '@/lib/project-coords'
import { cn } from '@/lib/utils'

const ACTION =
  'inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function GooglePlaceCard({ place }: { place: GooglePlaceHit }) {
  const tel = phoneHref(place.phone)
  const phoneLabel = formatPhoneDisplay(place.phone)
  const directions = googleDirectionsUrl({
    latitude: place.latitude,
    longitude: place.longitude,
    address: place.address,
  })

  return (
    <article data-testid="google-place" aria-label={place.name} className="rounded-xl border border-primary/10 bg-white p-3 shadow-sm">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <h3 className="text-[15px] font-bold leading-tight text-primary">{place.name}</h3>
          {place.openNow === true ? (
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">Open</span>
          ) : place.openNow === false ? (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">Closed</span>
          ) : null}
        </div>
        {place.rating != null ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3 fill-accent text-accent" aria-hidden />
            {place.rating.toFixed(1)}
            {place.ratingCount != null ? ` (${place.ratingCount})` : ''}
          </p>
        ) : null}
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0 text-primary" aria-hidden />
          {place.distanceMiles != null ? (
            <>
              <span className="shrink-0 font-semibold text-primary">{formatMiles(place.distanceMiles)}</span>
              <span aria-hidden>•</span>
            </>
          ) : null}
          <span className="truncate">{place.address || 'Address on Google Maps'}</span>
        </p>
        {phoneLabel ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0 text-primary" aria-hidden />
            {phoneLabel}
          </p>
        ) : null}
      </div>
      <div className={cn('mt-2.5 grid gap-1.5', tel ? 'grid-cols-3' : 'grid-cols-2')}>
        {tel ? (
          <a href={tel} aria-label={`Call ${place.name}`} className={cn(ACTION, 'bg-primary text-primary-foreground hover:bg-primary/90')}>
            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Call
          </a>
        ) : null}
        {directions ? (
          <a href={directions} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${place.name}`} className={cn(ACTION, 'border border-primary/20 bg-white text-primary hover:border-primary/50')}>
            <Navigation className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Directions
          </a>
        ) : null}
        <a href={place.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${place.name} in Google Maps`} className={cn(ACTION, 'border border-primary/20 bg-white text-primary hover:border-primary/50')}>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Maps
        </a>
      </div>
    </article>
  )
}
