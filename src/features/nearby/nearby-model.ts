import { haversineMeters } from '@/lib/geo'
import { phoneHref } from '@/features/schedule/schedule-links'
import type { NearbySavedPlace } from '@/types/database'

export type NearbyMode = 'suppliers' | 'food'
export type PlaceType = NearbySavedPlace['place_type']

export const PLACE_TYPE: Record<NearbyMode, PlaceType> = { suppliers: 'supplier', food: 'food' }

export const RADIUS_OPTIONS = [5, 10, 15, 25] as const
export type RadiusMiles = (typeof RADIUS_OPTIONS)[number]
export const DEFAULT_RADIUS: RadiusMiles = 10
export const METERS_PER_MILE = 1609.344
export const NOTE_MAX = 200

export type NearbyCategory = {
  key: string
  label: string
  /** Text sent to Google Maps; null = saved-place category only. */
  search: string | null
  /** Saved places can be filed under it. */
  saved: boolean
}

/** One list drives both the Google Maps search buttons and the saved-place categories. */
export const SUPPLIER_CATEGORIES: NearbyCategory[] = [
  { key: 'all_suppliers', label: 'All Suppliers', search: 'construction supply', saved: false },
  { key: 'plumbing', label: 'Plumbing Supply', search: 'plumbing supply', saved: true },
  { key: 'electrical', label: 'Electrical Supply', search: 'electrical supply', saved: true },
  { key: 'hvac', label: 'HVAC Supply', search: 'HVAC supply', saved: true },
  { key: 'gas', label: 'Gas / CSST Supply', search: 'gas pipe CSST supply', saved: true },
  { key: 'building_materials', label: 'Building Materials', search: 'building materials supply', saved: true },
  { key: 'lumber', label: 'Lumber', search: 'lumber yard', saved: true },
  { key: 'roofing', label: 'Roofing Supply', search: 'roofing supply', saved: true },
  { key: 'tile', label: 'Tile Supply', search: 'tile supply', saved: true },
  { key: 'paint', label: 'Paint', search: 'paint store', saved: true },
  { key: 'hardware', label: 'Hardware', search: 'hardware store', saved: true },
  { key: 'tools', label: 'Tools', search: 'tool store', saved: true },
  { key: 'rental', label: 'Equipment Rental', search: 'equipment rental', saved: true },
  { key: 'home_depot', label: 'Home Depot', search: 'Home Depot', saved: false },
  { key: 'lowes', label: "Lowe's", search: "Lowe's", saved: false },
  { key: 'home_improvement', label: 'Home Improvement', search: null, saved: true },
  { key: 'other_supplier', label: 'Other Supplier', search: null, saved: true },
]

/** Ecuadorian / Latin / Hispanic first: the crew's preference. */
export const FOOD_CATEGORIES: NearbyCategory[] = [
  { key: 'ecuadorian', label: 'Ecuadorian', search: 'Ecuadorian restaurant', saved: true },
  { key: 'latin', label: 'Latin Food', search: 'Latin restaurant', saved: true },
  { key: 'hispanic', label: 'Hispanic Food', search: 'Hispanic restaurant', saved: true },
  { key: 'deli', label: 'Deli', search: 'deli', saved: true },
  { key: 'quick_lunch', label: 'Quick Lunch', search: 'quick lunch', saved: true },
  { key: 'bakery', label: 'Bakery', search: 'bakery', saved: true },
  { key: 'breakfast', label: 'Breakfast', search: 'breakfast', saved: true },
  { key: 'coffee', label: 'Coffee', search: 'coffee shop', saved: true },
  { key: 'tacos', label: 'Tacos', search: 'tacos', saved: true },
  { key: 'restaurants', label: 'Restaurants', search: 'restaurants', saved: true },
]

export const CATEGORIES: Record<NearbyMode, NearbyCategory[]> = { suppliers: SUPPLIER_CATEGORIES, food: FOOD_CATEGORIES }

export function searchCategories(mode: NearbyMode) {
  return CATEGORIES[mode].filter((category) => category.search)
}

export function savedCategories(mode: NearbyMode) {
  return CATEGORIES[mode].filter((category) => category.saved)
}

/** Save Place default after a category search: Home Depot / Lowe's file under Home Improvement. */
export function saveCategoryForSearch(mode: NearbyMode, searchKey: string | null): string | null {
  if (!searchKey) return null
  if (searchKey === 'home_depot' || searchKey === 'lowes') return 'home_improvement'
  return savedCategories(mode).some((category) => category.key === searchKey) ? searchKey : null
}

export function categoryLabel(key: string) {
  return [...SUPPLIER_CATEGORIES, ...FOOD_CATEGORIES].find((category) => category.key === key)?.label ?? 'Other'
}

export const SEARCH_PLACEHOLDER: Record<NearbyMode, string> = {
  suppliers: 'Search material, product, or supplier...',
  food: 'Search restaurants, cuisine, or dish...',
}

export const PREFERRED_LABEL: Record<PlaceType, string> = { supplier: 'Tamay Preferred', food: 'Crew Favorite' }

// ---------------------------------------------------------------- search origin

export type NearbyOrigin = {
  source: 'project' | 'current' | 'entered'
  label: string
  latitude: number | null
  longitude: number | null
  /** Typed or job-site address when there are no trusted coordinates. */
  address: string | null
}

export function originCoords(origin: NearbyOrigin | null) {
  if (!origin || origin.latitude == null || origin.longitude == null) return null
  return { latitude: origin.latitude, longitude: origin.longitude }
}

/**
 * Google Maps search link (official Maps URLs, no API key). Opens the Google Maps app on phones.
 * "plumbing supply near 41.30830,-72.92790" or "deli near 12 Oak St, Stamford, CT".
 */
export function googleMapsSearchUrl(term: string, origin: NearbyOrigin | null) {
  const coords = originCoords(origin)
  const near = coords
    ? `${coords.latitude.toFixed(5)},${coords.longitude.toFixed(5)}`
    : origin?.address?.trim() || null
  const what = term.trim()
  const query = near ? `${what} near ${near}` : what
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

// ---------------------------------------------------------------- saved places

export type RankedSavedPlace = NearbySavedPlace & { distanceMiles: number | null }

export function distanceMiles(from: { latitude: number; longitude: number }, place: Pick<NearbySavedPlace, 'latitude' | 'longitude'>) {
  if (place.latitude == null || place.longitude == null) return null
  return haversineMeters(from.latitude, from.longitude, place.latitude, place.longitude) / METERS_PER_MILE
}

function matchesText(place: NearbySavedPlace, text: string) {
  const words = text.toLowerCase().split(/\s+/).filter((word) => word.length > 1)
  if (words.length === 0) return true
  const haystack = `${place.business_name} ${categoryLabel(place.category)} ${place.address} ${place.note ?? ''}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/**
 * Saved places for this mode: chosen category only, then Preferred first, then nearest.
 * With a known origin, places farther than the radius drop out; places saved without
 * coordinates stay listed with an unknown distance (never a guessed one).
 */
export function rankSavedPlaces(
  places: NearbySavedPlace[],
  options: { mode: NearbyMode; category: string; text: string; origin: NearbyOrigin | null; radiusMiles: RadiusMiles },
): RankedSavedPlace[] {
  const coords = originCoords(options.origin)
  return places
    .filter((place) => place.place_type === PLACE_TYPE[options.mode] && !place.archived_at)
    .filter((place) => options.category === 'all' || place.category === options.category)
    .filter((place) => matchesText(place, options.text))
    .map((place) => ({ ...place, distanceMiles: coords ? distanceMiles(coords, place) : null }))
    .filter((place) => place.distanceMiles == null || place.distanceMiles <= options.radiusMiles)
    .sort(
      (a, b) =>
        Number(b.is_preferred) - Number(a.is_preferred) ||
        (a.distanceMiles ?? Number.POSITIVE_INFINITY) - (b.distanceMiles ?? Number.POSITIVE_INFINITY) ||
        a.business_name.localeCompare(b.business_name),
    )
}

export function formatMiles(miles: number) {
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`
}

// ---------------------------------------------------------------- save form

/** Only http(s) links leave the app; "ferguson.com" becomes "https://ferguson.com/". */
export function normalizeWebsite(input: string | null | undefined): string | null | 'invalid' {
  const text = input?.trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname.includes('.')) return 'invalid'
    return url.toString()
  } catch {
    return 'invalid'
  }
}

export type SavedPlaceForm = {
  place_type: PlaceType
  category: string
  business_name: string
  address: string
  phone: string
  website: string
  note: string
  is_preferred: boolean
  latitude: number | null
  longitude: number | null
}

export type SavedPlaceErrors = Partial<Record<'business_name' | 'category' | 'address' | 'phone' | 'website' | 'note', string>>

export function validateSavedPlace(form: SavedPlaceForm):
  | { ok: true; value: Omit<NearbySavedPlace, 'id' | 'organization_id' | 'archived_at' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at'> }
  | { ok: false; errors: SavedPlaceErrors } {
  const errors: SavedPlaceErrors = {}
  const name = form.business_name.trim()
  const address = form.address.trim()
  const phone = form.phone.trim()
  const note = form.note.trim()
  const website = normalizeWebsite(form.website)
  const mode: NearbyMode = form.place_type === 'food' ? 'food' : 'suppliers'
  if (!name) errors.business_name = 'Enter the business name.'
  else if (name.length > 120) errors.business_name = 'Keep the name under 120 characters.'
  if (!savedCategories(mode).some((category) => category.key === form.category)) errors.category = 'Choose a category.'
  if (address.length < 3) errors.address = 'Enter the address.'
  else if (address.length > 250) errors.address = 'Keep the address under 250 characters.'
  if (phone && (!phoneHref(phone) || phone.length > 40)) errors.phone = 'Enter a phone number that can be dialed.'
  if (website === 'invalid') errors.website = 'Enter a website like ferguson.com.'
  if (note.length > NOTE_MAX) errors.note = `Keep the note under ${NOTE_MAX} characters.`
  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      place_type: form.place_type,
      category: form.category,
      business_name: name,
      address,
      phone: phone || null,
      website: website === 'invalid' ? null : website,
      note: note || null,
      is_preferred: form.is_preferred,
      latitude: form.latitude,
      longitude: form.longitude,
    },
  }
}

export type ParsedMapsLink = { short: true } | { short: false; name: string | null; address: string | null; latitude: number | null; longitude: number | null }

function validCoords(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
}

/**
 * Reads what a staff member pasted from Google Maps "Share" (the link text only; nothing is
 * fetched). Long links carry the name and coordinates; short maps.app.goo.gl links do not.
 */
export function parseGoogleMapsLink(input: string): ParsedMapsLink | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (host === 'maps.app.goo.gl' || host === 'goo.gl') return { short: true }
  if (!/(^|\.)google\.[a-z.]+$/.test(host) || !url.pathname.startsWith('/maps')) return null

  const text = decodeURIComponent(url.pathname + url.search).replace(/\+/g, ' ')
  let latitude: number | null = null
  let longitude: number | null = null
  const pin = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  const query = ['q', 'query', 'destination', 'daddr', 'll']
    .map((key) => url.searchParams.get(key))
    .find((value) => value && /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(value))
  const view = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  for (const match of [pin && [pin[1], pin[2]], query?.split(','), view && [view[1], view[2]]]) {
    if (!match) continue
    const lat = Number(match[0])
    const lng = Number(match[1])
    if (validCoords(lat, lng)) {
      latitude = lat
      longitude = lng
      break
    }
  }

  let name: string | null = null
  let address: string | null = null
  const place = text.match(/\/maps\/place\/([^/@]+)/)
  if (place) {
    const [first, ...rest] = place[1].split(',').map((part) => part.trim()).filter(Boolean)
    if (first && !/^-?\d+(\.\d+)?$/.test(first)) {
      name = first
      address = rest.length ? rest.join(', ') : null
    }
  }
  return { short: false, name, address, latitude, longitude }
}
