import { useState } from 'react'
import { Crosshair, Link2, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useSaveNearbyPlace } from '@/features/nearby/nearby-hooks'
import {
  NOTE_MAX,
  PREFERRED_LABEL,
  parseGoogleMapsLink,
  savedCategories,
  validateSavedPlace,
  type NearbyMode,
  type SavedPlaceErrors,
  type SavedPlaceForm,
} from '@/features/nearby/nearby-model'
import { requestDeviceLocation } from '@/lib/geo'
import { cn } from '@/lib/utils'
import type { NearbySavedPlace } from '@/types/database'

function blankForm(mode: NearbyMode, category: string | null): SavedPlaceForm {
  const options = savedCategories(mode)
  return {
    place_type: mode === 'food' ? 'food' : 'supplier',
    // Known from the last category search; otherwise the form asks rather than guessing.
    category: options.some((option) => option.key === category) ? category! : '',
    business_name: '',
    address: '',
    phone: '',
    website: '',
    note: '',
    is_preferred: false,
    latitude: null,
    longitude: null,
  }
}

function formFromPlace(place: NearbySavedPlace): SavedPlaceForm {
  return {
    place_type: place.place_type,
    category: place.category,
    business_name: place.business_name,
    address: place.address,
    phone: place.phone ?? '',
    website: place.website ?? '',
    note: place.note ?? '',
    is_preferred: place.is_preferred,
    latitude: place.latitude,
    longitude: place.longitude,
  }
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs font-medium text-destructive">{message}</p> : null
}

/** Management-only quick entry. Only what the staff member types or pastes is saved. */
export function SavePlaceDialog({
  open,
  onOpenChange,
  mode,
  category,
  place,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: NearbyMode
  category: string | null
  place?: NearbySavedPlace | null
}) {
  const save = useSaveNearbyPlace()
  const [form, setForm] = useState<SavedPlaceForm>(() => (place ? formFromPlace(place) : blankForm(mode, category)))
  const [errors, setErrors] = useState<SavedPlaceErrors>({})
  const [link, setLink] = useState('')
  const [linkMessage, setLinkMessage] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const formMode: NearbyMode = form.place_type === 'food' ? 'food' : 'suppliers'
  const update = (patch: Partial<SavedPlaceForm>) => setForm((current) => ({ ...current, ...patch }))

  function applyLink(text: string) {
    setLink(text)
    if (!text.trim()) return setLinkMessage(null)
    const parsed = parseGoogleMapsLink(text)
    if (!parsed) return setLinkMessage('That does not look like a Google Maps link.')
    if (parsed.short) return setLinkMessage('Short share links cannot be read. Type the name and address instead.')
    update({
      business_name: form.business_name || parsed.name || '',
      address: form.address || parsed.address || '',
      latitude: parsed.latitude ?? form.latitude,
      longitude: parsed.longitude ?? form.longitude,
    })
    setLinkMessage(
      [parsed.name ? 'Name filled in' : null, parsed.latitude != null ? 'map location set' : null].filter(Boolean).join(' · ') ||
        'No details found in that link.',
    )
  }

  async function setFromCurrentLocation() {
    setLocating(true)
    try {
      const here = await requestDeviceLocation({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
      update({ latitude: here.latitude, longitude: here.longitude })
      toast.success('Map location set from where you are standing')
    } catch {
      toast.error('Location unavailable. The place can still be saved with its address.')
    } finally {
      setLocating(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const result = validateSavedPlace(form)
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    try {
      await save.mutateAsync({ id: place?.id, value: result.value })
      toast.success(place ? 'Saved place updated' : 'Place saved')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save. Try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{place ? 'Edit saved place' : 'Save a place'}</DialogTitle>
          <DialogDescription>Saved places appear for the whole crew. Call to confirm before driving.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          {!place ? (
            <div className="space-y-1">
              <Label htmlFor="save-place-link" className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                Google Maps link (optional)
              </Label>
              <Input
                id="save-place-link"
                value={link}
                onChange={(event) => applyLink(event.target.value)}
                placeholder="Paste from Google Maps → Share"
                inputMode="url"
                className="h-11"
              />
              {linkMessage ? <p className="text-xs text-muted-foreground">{linkMessage}</p> : null}
            </div>
          ) : null}

          <div role="group" aria-label="Place type" className="grid grid-cols-2 gap-2">
            {(['supplier', 'food'] as const).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={form.place_type === type}
                onClick={() => update({ place_type: type, category: type === form.place_type ? form.category : '' })}
                className={cn(
                  'h-11 rounded-lg text-sm font-semibold',
                  form.place_type === type ? 'bg-accent text-primary shadow-sm' : 'border border-primary/15 bg-white text-primary',
                )}
              >
                {type === 'supplier' ? 'Supplier' : 'Food'}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor="save-place-category">Category *</Label>
            <NativeSelect
              id="save-place-category"
              value={form.category}
              onChange={(event) => update({ category: event.target.value })}
              className="h-11"
            >
              <option value="" disabled>
                Choose a category
              </option>
              {savedCategories(formMode).map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <FieldError message={errors.category} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="save-place-name">Name *</Label>
            <Input id="save-place-name" value={form.business_name} onChange={(event) => update({ business_name: event.target.value })} className="h-11" autoComplete="off" />
            <FieldError message={errors.business_name} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="save-place-address">Address *</Label>
            <Input id="save-place-address" value={form.address} onChange={(event) => update({ address: event.target.value })} className="h-11" autoComplete="off" />
            <FieldError message={errors.address} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {form.latitude != null ? 'Map location set: distance will show.' : 'No map location: distance will show as unknown.'}
              </span>
              <Button type="button" size="sm" variant="outline" className="h-8" disabled={locating} onClick={() => void setFromCurrentLocation()}>
                <Crosshair className="h-3.5 w-3.5" aria-hidden />
                {locating ? 'Locating…' : "I'm here now"}
              </Button>
              {form.latitude != null ? (
                <button type="button" className="font-semibold text-primary" onClick={() => update({ latitude: null, longitude: null })}>
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="save-place-phone">Phone</Label>
              <Input id="save-place-phone" type="tel" inputMode="tel" value={form.phone} onChange={(event) => update({ phone: event.target.value })} className="h-11" />
              <FieldError message={errors.phone} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="save-place-website">Website</Label>
              <Input id="save-place-website" inputMode="url" value={form.website} onChange={(event) => update({ website: event.target.value })} placeholder="optional" className="h-11" />
              <FieldError message={errors.website} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="save-place-note">Internal note</Label>
            <Textarea
              id="save-place-note"
              rows={2}
              maxLength={NOTE_MAX}
              value={form.note}
              onChange={(event) => update({ note: event.target.value })}
              placeholder={form.place_type === 'supplier' ? 'e.g. Good TracPipe stock. Call Mike.' : 'e.g. Good Ecuadorian lunch. Fast takeout.'}
            />
            <p className="text-right text-[11px] text-muted-foreground">
              {form.note.length}/{NOTE_MAX}
            </p>
            <FieldError message={errors.note} />
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-primary">
            <input type="checkbox" checked={form.is_preferred} onChange={(event) => update({ is_preferred: event.target.checked })} className="h-4 w-4 accent-[var(--color-accent)]" />
            <Star className="h-4 w-4 text-accent" aria-hidden />
            Mark as {PREFERRED_LABEL[form.place_type]}
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="h-11" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : place ? 'Save changes' : 'Save Place'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
