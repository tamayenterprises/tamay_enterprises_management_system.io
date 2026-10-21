import { describe, expect, it } from 'vitest'
import type { NearbySavedPlace } from '@/types/database'
import {
  FOOD_CATEGORIES,
  SUPPLIER_CATEGORIES,
  googleMapsSearchUrl,
  normalizeWebsite,
  parseGoogleMapsLink,
  rankGooglePlaces,
  rankSavedPlaces,
  savedCategories,
  searchCategories,
  validateSavedPlace,
  type NearbyOrigin,
  type SavedPlaceForm,
} from './nearby-model'

const PROJECT: NearbyOrigin = { source: 'project', label: 'Kim Bathroom', latitude: 41.0534, longitude: -73.5387, address: '12 Oak St, Stamford, CT' }
const ADDRESS_ONLY: NearbyOrigin = { source: 'project', label: 'Lopez Deck', latitude: null, longitude: null, address: '48 Elm Ave, Norwalk, CT' }

const query = (url: string) => {
  expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true)
  return new URL(url).searchParams.get('query')
}
const search = (mode: 'suppliers' | 'food', label: string) => searchCategories(mode).find((c) => c.label === label)!.search!

function at(miles: number, bearing = 90) {
  const rad = (bearing * Math.PI) / 180
  return {
    latitude: PROJECT.latitude! + (miles * Math.cos(rad)) / 69,
    longitude: PROJECT.longitude! + (miles * Math.sin(rad)) / (69 * Math.cos((PROJECT.latitude! * Math.PI) / 180)),
  }
}

function place(over: Partial<NearbySavedPlace> & { miles?: number | null }): NearbySavedPlace {
  const { miles = 1, ...rest } = over
  const coords = miles == null ? { latitude: null, longitude: null } : at(miles)
  return {
    id: rest.business_name ?? 'x',
    organization_id: 'org',
    place_type: 'supplier',
    category: 'plumbing',
    business_name: 'Place',
    address: '1 Main St, Stamford, CT',
    ...coords,
    phone: null,
    website: null,
    note: null,
    is_preferred: false,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    ...rest,
  }
}

describe('Google Maps search links (no API key)', () => {
  it.each([
    ['suppliers', 'Plumbing Supply', 'plumbing supply'],
    ['suppliers', 'Electrical Supply', 'electrical supply'],
    ['suppliers', 'HVAC Supply', 'HVAC supply'],
    ['suppliers', 'Gas / CSST Supply', 'gas pipe CSST supply'],
    ['suppliers', 'Home Depot', 'Home Depot'],
    ['suppliers', "Lowe's", "Lowe's"],
    ['food', 'Ecuadorian', 'Ecuadorian restaurant'],
    ['food', 'Latin Food', 'Latin restaurant'],
    ['food', 'Deli', 'deli'],
    ['food', 'Quick Lunch', 'quick lunch'],
  ] as const)('%s → %s searches around the verified job site', (mode, label, term) => {
    expect(search(mode, label)).toBe(term)
    expect(query(googleMapsSearchUrl(search(mode, label), PROJECT))).toBe(`${term} near 41.05340,-73.53870`)
  })

  it('falls back to the job-site or typed address, encoding special characters', () => {
    expect(query(googleMapsSearchUrl('deli', ADDRESS_ONLY))).toBe('deli near 48 Elm Ave, Norwalk, CT')
    const typed: NearbyOrigin = { source: 'entered', label: 'x', latitude: null, longitude: null, address: "12 Main St #4 & O'Neil Rd, Bogotá Ave" }
    const url = googleMapsSearchUrl("Lowe's", typed)
    expect(url.split('query=')[1]).not.toMatch(/[#&\s]/)
    expect(url).toContain('%234')
    expect(url).toContain('%26')
    expect(query(url)).toBe("Lowe's near 12 Main St #4 & O'Neil Rd, Bogotá Ave")
  })

  it('still opens a plain search when no location is known yet', () => {
    expect(query(googleMapsSearchUrl('tacos', null))).toBe('tacos')
  })
})

describe('category configuration', () => {
  it('includes every approved supplier search', () => {
    expect(searchCategories('suppliers').map((c) => c.label)).toEqual([
      'All Suppliers', 'Plumbing Supply', 'Electrical Supply', 'HVAC Supply', 'Gas / CSST Supply', 'Building Materials',
      'Lumber', 'Roofing Supply', 'Tile Supply', 'Paint', 'Hardware', 'Tools', 'Equipment Rental', 'Home Depot', "Lowe's",
    ])
  })

  it('lists food with Ecuadorian / Latin / Hispanic first', () => {
    expect(searchCategories('food').map((c) => c.label)).toEqual([
      'Ecuadorian', 'Latin Food', 'Hispanic Food', 'Deli', 'Quick Lunch', 'Bakery', 'Breakfast', 'Coffee', 'Tacos', 'Restaurants',
    ])
  })

  it('saved-place categories are real trades (not store names) and fit the database key rule', () => {
    const keys = savedCategories('suppliers').map((c) => c.key)
    expect(keys).not.toContain('home_depot')
    expect(keys).not.toContain('all_suppliers')
    expect(keys).toContain('home_improvement')
    for (const category of [...SUPPLIER_CATEGORIES, ...FOOD_CATEGORIES]) expect(category.key).toMatch(/^[a-z_]{2,40}$/)
  })
})

describe('saved places near the search area', () => {
  const ferguson = place({ business_name: 'Ferguson', miles: 3.5, is_preferred: true })
  const local = place({ business_name: 'Local Plumbing', miles: 1.2 })
  const far = place({ business_name: 'Far Supply', miles: 12 })
  const unmapped = place({ business_name: 'No Map Supply', miles: null })
  const electric = place({ business_name: 'Electric Co', category: 'electrical', miles: 2 })
  const deli = place({ business_name: 'Main Deli', place_type: 'food', category: 'deli', miles: 0.5 })
  const archived = place({ business_name: 'Old Supply', archived_at: '2026-01-01' })
  const all = [far, unmapped, local, electric, ferguson, deli, archived]
  const names = (over = {}) =>
    rankSavedPlaces(all, { mode: 'suppliers', category: 'all', text: '', origin: PROJECT, radiusMiles: 10, ...over }).map((p) => p.business_name)

  it('Preferred first, then nearest; unmapped places stay listed last without a distance', () => {
    expect(names()).toEqual(['Ferguson', 'Local Plumbing', 'Electric Co', 'No Map Supply'])
    const ranked = rankSavedPlaces(all, { mode: 'suppliers', category: 'all', text: '', origin: PROJECT, radiusMiles: 10 })
    expect(ranked[1].distanceMiles).toBeCloseTo(1.2, 1)
    expect(ranked[3].distanceMiles).toBeNull()
  })

  it.each([
    [5, ['Ferguson', 'Local Plumbing', 'Electric Co', 'No Map Supply']],
    [15, ['Ferguson', 'Local Plumbing', 'Electric Co', 'Far Supply', 'No Map Supply']],
  ] as const)('%i mile radius', (radiusMiles, expected) => {
    expect(names({ radiusMiles })).toEqual(expected)
  })

  it('filters by category, text and type; archived places never show', () => {
    expect(names({ category: 'electrical' })).toEqual(['Electric Co'])
    expect(names({ text: 'ferg' })).toEqual(['Ferguson'])
    expect(rankSavedPlaces(all, { mode: 'food', category: 'all', text: '', origin: PROJECT, radiusMiles: 5 }).map((p) => p.business_name)).toEqual(['Main Deli'])
    expect(names({ radiusMiles: 25 })).not.toContain('Old Supply')
  })

  it('without coordinates for the search area, lists everything with unknown distance', () => {
    const ranked = rankSavedPlaces(all, { mode: 'suppliers', category: 'all', text: '', origin: ADDRESS_ONLY, radiusMiles: 5 })
    expect(ranked.map((p) => p.business_name)).toEqual(['Ferguson', 'Electric Co', 'Far Supply', 'Local Plumbing', 'No Map Supply'])
    expect(ranked.every((p) => p.distanceMiles === null)).toBe(true)
  })
})

describe('Save Place form', () => {
  const base: SavedPlaceForm = {
    place_type: 'supplier', category: 'plumbing', business_name: '  Ferguson  ', address: ' 1790 State St, New Haven ',
    phone: '(203) 555-0123', website: 'ferguson.com', note: ' Good TracPipe stock ', is_preferred: true, latitude: null, longitude: null,
  }

  it('trims, normalizes the website and keeps optional fields optional', () => {
    const result = validateSavedPlace(base)
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ business_name: 'Ferguson', address: '1790 State St, New Haven', website: 'https://ferguson.com/', note: 'Good TracPipe stock' }),
    })
    const minimal = validateSavedPlace({ ...base, phone: '', website: '', note: '' })
    expect(minimal.ok && minimal.value).toMatchObject({ phone: null, website: null, note: null })
  })

  it('requires name, address and a category for the chosen type', () => {
    const result = validateSavedPlace({ ...base, business_name: ' ', address: '', category: 'deli' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['address', 'business_name', 'category'])
  })

  it('rejects undialable phones, non-web links and long notes', () => {
    const result = validateSavedPlace({ ...base, phone: 'call me', website: 'javascript:alert(1)', note: 'x'.repeat(201) })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['note', 'phone', 'website'])
    expect(normalizeWebsite('http://example.com/shop')).toBe('http://example.com/shop')
    expect(normalizeWebsite('not a site')).toBe('invalid')
  })
})

describe('Google Places ranking', () => {
  it('sorts nearest first and keeps rating as a tie-breaker', () => {
    const ranked = rankGooglePlaces(
      [
        {
          id: 'far',
          displayName: { text: 'Far Store' },
          formattedAddress: 'Far',
          location: { latitude: PROJECT.latitude! + 0.2, longitude: PROJECT.longitude! },
          rating: 4.9,
        },
        {
          id: 'near',
          displayName: { text: 'Near Store' },
          formattedAddress: 'Near',
          location: { latitude: PROJECT.latitude! + 0.01, longitude: PROJECT.longitude! },
          rating: 3.2,
          userRatingCount: 12,
          googleMapsUri: 'https://maps.google.com/?cid=9',
          nationalPhoneNumber: '+1 203-555-0100',
          currentOpeningHours: { openNow: true },
        },
      ],
      PROJECT,
    )
    expect(ranked.map((place) => place.name)).toEqual(['Near Store', 'Far Store'])
    expect(ranked[0]).toMatchObject({
      id: 'near',
      openNow: true,
      phone: '+1 203-555-0100',
      mapsUrl: 'https://maps.google.com/?cid=9',
    })
    expect(ranked[0].distanceMiles).toBeLessThan(ranked[1].distanceMiles!)
  })
})

describe('pasted Google Maps links (text only, nothing fetched)', () => {
  it('reads the place name, address and pin from a full place link', () => {
    const link =
      'https://www.google.com/maps/place/Ferguson+Plumbing+Supply,+1790+State+St,+New+Haven,+CT+06511/@41.3255,-72.9101,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d41.3256!4d-72.9104'
    expect(parseGoogleMapsLink(link)).toEqual({
      short: false,
      name: 'Ferguson Plumbing Supply',
      address: '1790 State St, New Haven, CT 06511',
      latitude: 41.3256,
      longitude: -72.9104,
    })
  })

  it('handles coordinate-only links, short links and non-Google links', () => {
    expect(parseGoogleMapsLink('https://maps.google.com/maps?q=41.30,-72.90')).toMatchObject({ latitude: 41.3, longitude: -72.9, name: null })
    expect(parseGoogleMapsLink('https://maps.app.goo.gl/AbC123')).toEqual({ short: true })
    expect(parseGoogleMapsLink('https://evil.example.com/maps/place/X/@1,2')).toBeNull()
    expect(parseGoogleMapsLink('not a link')).toBeNull()
  })
})
