import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-hooks'
import { canonicalProjectAddress } from '@/features/schedule/schedule-links'
import {
  CATEGORIES,
  RADIUS_OPTIONS,
  rankGooglePlaces,
  type GooglePlaceRaw,
  type NearbyMode,
  type NearbyOrigin,
  type RadiusMiles,
  type validateSavedPlace,
} from '@/features/nearby/nearby-model'
import { supabase } from '@/lib/supabase'
import { isManagementRole } from '@/lib/utils'
import type { NearbySavedPlace, Project } from '@/types/database'

/** Location identity only: never totals, finance, notes or documents. */
export const NEARBY_PROJECT_COLUMNS =
  'id, name, job_site_address, location, latitude, longitude, location_verification_status'

export type NearbyProject = Pick<
  Project,
  'id' | 'name' | 'job_site_address' | 'location' | 'latitude' | 'longitude' | 'location_verification_status'
>

/** Active projects the viewer may pick as a search origin (assigned ones for workers). */
export function useNearbyProjects() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['nearby-projects', profile?.id],
    enabled: Boolean(profile?.id),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(NEARBY_PROJECT_COLUMNS)
        .is('archived_at', null)
        .order('name')
      if (error) throw error
      let projects = (data ?? []) as NearbyProject[]
      if (!isManagementRole(profile?.role)) {
        const { data: assignments, error: assignmentError } = await supabase
          .from('project_assignments')
          .select('project_id')
          .eq('profile_id', profile!.id)
          .eq('is_active', true)
        if (assignmentError) throw assignmentError
        const ids = new Set(((assignments ?? []) as Array<{ project_id: string }>).map((row) => row.project_id))
        projects = projects.filter((project) => ids.has(project.id))
      }
      return projects
    },
  })
}

/** Verified job-site coordinates when available; otherwise the job-site address (no geocoding). */
export function projectSearchTarget(project: NearbyProject) {
  const { latitude, longitude } = project
  const verified =
    project.location_verification_status === 'verified' &&
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0)
  return {
    coords: verified ? { latitude: latitude!, longitude: longitude! } : null,
    address: canonicalProjectAddress(project),
  }
}

// ---------------------------------------------------------------- saved places

export const SAVED_PLACE_COLUMNS =
  'id, organization_id, place_type, category, business_name, address, latitude, longitude, phone, website, note, is_preferred, archived_at, created_by, updated_by, created_at, updated_at'

const SAVED_PLACES_KEY = 'nearby-saved-places'

function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || /nearby_saved_places/.test(error.message ?? '')))
}

export class SavedPlacesNotInstalledError extends Error {
  constructor() {
    super('Saved places are not set up yet.')
  }
}

/** The organization's active saved places (RLS limits this to approved staff). */
export function useSavedPlaces() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: [SAVED_PLACES_KEY, profile?.organization_id],
    enabled: Boolean(profile?.id),
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nearby_saved_places')
        .select(SAVED_PLACE_COLUMNS)
        .is('archived_at', null)
        .order('business_name')
      if (isMissingTable(error)) throw new SavedPlacesNotInstalledError()
      if (error) throw error
      return (data ?? []) as NearbySavedPlace[]
    },
  })
}

export class PlacesNotConfiguredError extends Error {
  constructor() {
    super('Google Places is not set up yet.')
    this.name = 'PlacesNotConfiguredError'
  }
}

export function usePlacesSearch() {
  return useMutation({
    mutationFn: async (input: {
      query: string
      origin: NearbyOrigin | null
      radiusMiles: RadiusMiles
    }) => {
      const { data, error } = await supabase.functions.invoke('places-nearby', {
        body: {
          query: input.query,
          latitude: input.origin?.latitude ?? null,
          longitude: input.origin?.longitude ?? null,
          address: input.origin?.address ?? null,
          radiusMiles: input.radiusMiles,
        },
      })
      const payload = await placesResponse(data, error)
      if (payload?.code === 'not_configured' || payload?.error === 'Places is not configured') {
        throw new PlacesNotConfiguredError()
      }
      if (payload?.error) throw new Error(String(payload.error))
      if (error) throw new Error(error.message)
      return rankGooglePlaces(Array.isArray(payload?.places) ? payload.places : [], input.origin)
    },
  })
}

async function placesResponse(data: unknown, error: { context?: Response } | null) {
  if (data && typeof data === 'object') return data as { places?: GooglePlaceRaw[]; error?: string; code?: string }
  const response = error?.context
  if (!response) return null
  try {
    return (await response.clone().json()) as { places?: GooglePlaceRaw[]; error?: string; code?: string }
  } catch {
    return null
  }
}

function friendlyWriteError(error: { code?: string; message?: string }) {
  if (isMissingTable(error)) return 'Saved places are not set up yet. Run migration 20261018090000_nearby_saved_places.sql in Development first.'
  if (error.code === '42501' || /row-level security/i.test(error.message ?? '')) return 'Only management can change saved places.'
  if (error.code === '23514') return 'Some details are not valid. Check the website and note length.'
  return 'Could not save. Try again.'
}

type SavedPlaceValue = Extract<ReturnType<typeof validateSavedPlace>, { ok: true }>['value']

/** Management only (database policy enforces it). */
export function useSaveNearbyPlace() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, value }: { id?: string; value: SavedPlaceValue }) => {
      const organizationId = profile?.organization_id
      if (!id && !organizationId) throw new Error('Your profile has no organization.')
      const query = id
        ? supabase.from('nearby_saved_places').update(value).eq('id', id)
        : supabase.from('nearby_saved_places').insert({ ...value, organization_id: organizationId! })
      const { data, error } = await query.select(SAVED_PLACE_COLUMNS).single()
      if (error) throw new Error(friendlyWriteError(error))
      return data as NearbySavedPlace
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [SAVED_PLACES_KEY] }),
  })
}

/** Archive instead of delete; management only. */
export function useArchiveNearbyPlace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('nearby_saved_places')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single()
      if (error) throw new Error(friendlyWriteError(error))
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [SAVED_PLACES_KEY] }),
  })
}

// ---------------------------------------------------------------- session memory

export type OriginKind = 'project' | 'current' | 'entered'
export type NearbySession = {
  mode: NearbyMode
  originKind: OriginKind
  projectId: string | null
  radius: RadiusMiles
  /** Last category opened in Google Maps, so Save Place can default to it. No location data. */
  lastSearch: { mode: NearbyMode; category: string } | null
}

const SESSION_KEY = 'tamay.nearby-finder'

/** Preferences for this browser tab only. Coordinates and typed addresses are never stored. */
export function readNearbySession(): Partial<NearbySession> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<NearbySession>
    return {
      mode: parsed.mode === 'food' || parsed.mode === 'suppliers' ? parsed.mode : undefined,
      originKind:
        parsed.originKind === 'project' || parsed.originKind === 'entered' || parsed.originKind === 'current'
          ? parsed.originKind
          : undefined,
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : null,
      radius: (RADIUS_OPTIONS as readonly number[]).includes(Number(parsed.radius)) ? (Number(parsed.radius) as RadiusMiles) : undefined,
      lastSearch:
        parsed.lastSearch &&
        (parsed.lastSearch.mode === 'suppliers' || parsed.lastSearch.mode === 'food') &&
        CATEGORIES[parsed.lastSearch.mode].some((category) => category.key === parsed.lastSearch?.category)
          ? { mode: parsed.lastSearch.mode, category: parsed.lastSearch.category }
          : null,
    }
  } catch {
    return {}
  }
}

export function writeNearbySession(session: NearbySession) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Private mode or storage disabled: the finder still works without memory.
  }
}
