/** Project coordinate parsing and Connecticut operating-region sanity checks. */

export const CT_OPERATING_REGION = {
  id: 'connecticut',
  label: 'Connecticut',
  /** Approximate bounds for Tamay’s primary operating region */
  minLatitude: 40.9,
  maxLatitude: 42.1,
  minLongitude: -73.8,
  maxLongitude: -71.7,
} as const

const CT_ADDRESS_PATTERN =
  /\b(CT|Connecticut|West Haven|New Haven|Bridgeport|Hartford|Stamford|Waterbury|Norwalk|Danbury|Milford|Meriden|Bristol|New Britain)\b/i

export function addressLooksLikeConnecticut(address?: string | null): boolean {
  if (!address?.trim()) return false
  return CT_ADDRESS_PATTERN.test(address)
}

export function isWithinConnecticutBounds(lat: number, lng: number): boolean {
  return (
    lat >= CT_OPERATING_REGION.minLatitude &&
    lat <= CT_OPERATING_REGION.maxLatitude &&
    lng >= CT_OPERATING_REGION.minLongitude &&
    lng <= CT_OPERATING_REGION.maxLongitude
  )
}

/** Positive longitude whose magnitude still looks like a CT western longitude. */
export function looksLikeMissingConnecticutMinusSign(lat: number, lng: number): boolean {
  if (lng <= 0) return false
  if (lat < CT_OPERATING_REGION.minLatitude || lat > CT_OPERATING_REGION.maxLatitude) return false
  const westEquivalent = -lng
  return (
    westEquivalent >= CT_OPERATING_REGION.minLongitude &&
    westEquivalent <= CT_OPERATING_REGION.maxLongitude
  )
}

export function looksLikeLatLngSwapped(lat: number, lng: number): boolean {
  // US-ish longitude magnitude stored in latitude, CT-ish latitude in longitude
  return Math.abs(lng) <= 90 && Math.abs(lat) > 50 && Math.abs(lat) <= 180
}

export type ParsedProjectCoordinates =
  | { lat: number; lng: number; warnings: string[] }
  | { error: string }

/** Parse lat/lng safely. Empty string must NOT become 0 (that verified projects at null island). */
export function parseProjectCoordinates(
  latRaw: string,
  lngRaw: string,
  options?: { address?: string | null },
): ParsedProjectCoordinates {
  const latText = latRaw.trim()
  const lngText = lngRaw.trim()
  const warnings: string[] = []

  // Allow pasting "40.7128, -74.0060" into the latitude field alone
  if (latText.includes(',') && !lngText) {
    const parts = latText.split(',').map((p) => p.trim())
    if (parts.length >= 2) {
      return parseProjectCoordinates(parts[0], parts[1], options)
    }
  }

  if (!latText || !lngText) {
    return {
      error:
        'Latitude and Longitude numbers are required. Copying only the street address is not enough — paste the GPS numbers from Google Maps.',
    }
  }

  // Strip degree symbols / N/S/E/W labels people paste from Maps (preserve leading minus)
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
    return { error: 'Could not read latitude/longitude. Use numbers like 41.26208 and -72.95269.' }
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

  if (looksLikeLatLngSwapped(lat, lng)) {
    return { error: 'Latitude/longitude appear swapped. Latitude is first (north/south), longitude is second (east/west).' }
  }

  const address = options?.address
  if (addressLooksLikeConnecticut(address) && looksLikeMissingConnecticutMinusSign(lat, lng)) {
    return {
      error:
        'The saved coordinates do not match the project address. Connecticut locations require a western, negative longitude. Please regenerate the coordinates from the address or use the current job-site GPS.',
    }
  }

  if (addressLooksLikeConnecticut(address) && !isWithinConnecticutBounds(lat, lng)) {
    warnings.push(
      'These coordinates fall outside the expected Connecticut operating region. Confirm the marker carefully before enabling geofenced attendance.',
    )
  }

  if (looksLikeMissingConnecticutMinusSign(lat, lng)) {
    return {
      error:
        'The project coordinates do not match the Connecticut job-site address. Verify that the longitude includes the negative sign (example: -72.95269).',
    }
  }

  return { lat, lng, warnings }
}

export function openStreetMapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}
