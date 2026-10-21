// Nearby Finder: Google Places Text Search (New).
// Secret: GOOGLE_PLACES_API_KEY (never send this to the browser).
// Enable "Places API (New)" on the Google Cloud key.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const STAFF = new Set(["admin", "project_manager", "employee", "subcontractor"])
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.nationalPhoneNumber,places.currentOpeningHours"
const METERS_PER_MILE = 1609.344

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const authHeader = req.headers.get("Authorization")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY") || Deno.env.get("GOOGLE_MAPS_API_KEY")
    if (!authHeader || !supabaseUrl || !anonKey) {
      return json({ error: "Auth service is not configured" }, 500)
    }
    if (!apiKey) {
      return json({ error: "Places is not configured", code: "not_configured" }, 503)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "Not authenticated" }, 401)

    const { data: actor, error: actorError } = await userClient
      .from("profiles")
      .select("role, approval_status, is_active, archived_at")
      .eq("id", userData.user.id)
      .single()
    if (
      actorError ||
      !actor ||
      !STAFF.has(actor.role) ||
      actor.approval_status !== "approved" ||
      !actor.is_active ||
      actor.archived_at
    ) {
      return json({ error: "Nearby Finder is not available for this account" }, 403)
    }

    const body = await req.json()
    const query = String(body.query ?? "").trim()
    if (query.length < 2 || query.length > 80) {
      return json({ error: "Search is too short" }, 400)
    }

    const latitude = toCoord(body.latitude, -90, 90)
    const longitude = toCoord(body.longitude, -180, 180)
    const address = String(body.address ?? "").trim().slice(0, 250)
    const radiusMiles = clamp(Number(body.radiusMiles) || 10, 1, 25)
    const hasCoords = latitude != null && longitude != null
    if (!hasCoords && !address) {
      return json({ error: "Choose a project, your location, or an address first" }, 400)
    }

    const radiusMeters = Math.min(radiusMiles * METERS_PER_MILE, 50000)
    const payload: Record<string, unknown> = {
      textQuery: hasCoords ? query : `${query} near ${address}`,
      languageCode: "en",
      regionCode: "US",
      pageSize: 10,
    }
    if (hasCoords) {
      payload.rankPreference = "DISTANCE"
      payload.locationBias = {
        circle: {
          center: { latitude, longitude },
          radius: radiusMeters,
        },
      }
    }

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(payload),
    })
    const google = await res.json()
    if (!res.ok) {
      console.error("places.searchText failed", res.status, google)
      return json({ error: "Google Places search failed", code: "google_error" }, 502)
    }

    const places = Array.isArray(google.places) ? google.places : []
    return json({ places, query }, 200)
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Places search failed" },
      500,
    )
  }
})

function toCoord(value: unknown, min: number, max: number) {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n < min || n > max || n === 0) return null
  return n
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
