import { useState } from 'react'
import { ChevronDown, ExternalLink, MapPin, Navigation, Pencil, Phone, Star, Store, UtensilsCrossed } from 'lucide-react'
import { formatPhoneDisplay, phoneHref } from '@/features/schedule/schedule-links'
import { categoryLabel, formatMiles, PREFERRED_LABEL, type RankedSavedPlace } from '@/features/nearby/nearby-model'
import { googleDirectionsUrl, wazeUrl } from '@/lib/project-coords'
import { cn } from '@/lib/utils'

const ACTION =
  'inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const OUTLINE = cn(ACTION, 'border border-primary/20 bg-white text-primary hover:border-primary/50')

export function SavedPlaceCard({
  place,
  canManage,
  onEdit,
  onArchive,
}: {
  place: RankedSavedPlace
  canManage?: boolean
  onEdit?: (place: RankedSavedPlace) => void
  onArchive?: (place: RankedSavedPlace) => void
}) {
  const [open, setOpen] = useState(false)
  const target = { latitude: place.latitude, longitude: place.longitude, address: place.address }
  const directions = googleDirectionsUrl(target)
  const waze = wazeUrl(target)
  const tel = phoneHref(place.phone)
  const phoneLabel = formatPhoneDisplay(place.phone)
  const Icon = place.place_type === 'supplier' ? Store : UtensilsCrossed
  const detailsId = `saved-place-details-${place.id}`

  return (
    <article
      data-testid="saved-place"
      aria-label={place.business_name}
      className={cn(
        'rounded-xl border border-primary/10 bg-white p-3 shadow-sm',
        place.is_preferred && 'border-l-[3px] border-l-accent',
      )}
    >
      <div className="flex gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[radial-gradient(circle_at_30%_20%,#145079_0%,#0b3c5d_55%,#082c45_100%)]">
          <Icon className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <h3 className="line-clamp-2 text-[15px] font-bold leading-tight text-primary">{place.business_name}</h3>
            {place.is_preferred ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent/90 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                <Star className="h-3 w-3 fill-current" aria-hidden />
                {PREFERRED_LABEL[place.place_type]}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{categoryLabel(place.category)}</p>
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0 text-primary" aria-hidden />
            {place.distanceMiles != null ? (
              <>
                <span className="shrink-0 font-semibold text-primary">{formatMiles(place.distanceMiles)}</span>
                <span aria-hidden>•</span>
              </>
            ) : null}
            <span className="truncate">{place.address}</span>
          </p>
          {phoneLabel ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0 text-primary" aria-hidden />
              {phoneLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className={cn('mt-2.5 grid gap-1.5', place.website ? 'grid-cols-3' : 'grid-cols-2')}>
        {tel ? (
          <a href={tel} aria-label={`Call ${place.business_name}`} className={cn(ACTION, 'bg-primary text-primary-foreground hover:bg-primary/90')}>
            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Call
          </a>
        ) : (
          <span className={cn(ACTION, 'cursor-not-allowed border border-border bg-muted/40 text-muted-foreground/70')} aria-disabled="true" title="No phone saved">
            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
            No phone
          </span>
        )}
        {directions ? (
          <a href={directions} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${place.business_name}`} className={OUTLINE}>
            <Navigation className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Directions
          </a>
        ) : null}
        {place.website ? (
          <a href={place.website} target="_blank" rel="noopener noreferrer" aria-label={`Website for ${place.business_name}`} className={OUTLINE}>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Website
          </a>
        ) : null}
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((value) => !value)}
        className="mt-1.5 flex h-8 w-full items-center justify-center gap-1 rounded-md text-xs font-semibold text-primary hover:bg-accent/10"
      >
        Details
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open ? (
        <div id={detailsId} className="space-y-2 border-t border-border pt-2 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-primary">Address: </span>
            {place.address}
          </p>
          {place.note ? (
            <p className="rounded-md bg-accent/15 px-2 py-1.5 text-primary">
              <span className="font-semibold">Tamay note: </span>
              {place.note}
            </p>
          ) : null}
          <p>{place.place_type === 'supplier' ? 'Call to confirm before driving.' : 'Call ahead for takeout or wait times.'}</p>
          {place.distanceMiles == null ? <p>Distance unknown: this place was saved without a map location.</p> : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {waze ? (
              <a href={waze} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">
                Open in Waze
              </a>
            ) : null}
            {canManage ? (
              <>
                <button type="button" onClick={() => onEdit?.(place)} className="inline-flex items-center gap-1 font-semibold text-primary">
                  <Pencil className="h-3 w-3" aria-hidden />
                  Edit
                </button>
                <button type="button" onClick={() => onArchive?.(place)} className="font-semibold text-destructive">
                  Archive
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  )
}
