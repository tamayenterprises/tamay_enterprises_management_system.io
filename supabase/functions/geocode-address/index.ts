// Supabase Edge Function: geocode a job-site address server-side.
// Secrets (optional): MAPBOX_ACCESS_TOKEN
// Without Mapbox, uses OpenStreetMap Nominatim (no key; rate-limited).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return json({ error: "Missing authorization" }, 401)
    }

    const body = await req.json()
    const address = String(body.address ?? "").trim()
    if (!address) {
      return json({ error: "Address is required" }, 400)
    }

    const mapboxToken = Deno.env.get("MAPBOX_ACCESS_TOKEN")
    let result: { latitude: number; longitude: number; label: string; provider: string }

    if (mapboxToken) {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
        `?access_token=${mapboxToken}&limit=1`
      const res = await fetch(url)
      if (!res.ok) {
        return json({ error: "Mapbox geocoding failed", detail: await res.text() }, 502)
      }
      const data = await res.json()
      const feature = data.features?.[0]
      if (!feature?.center) {
        return json({ error: "No results for that address" }, 404)
      }
      result = {
        longitude: feature.center[0],
        latitude: feature.center[1],
        label: feature.place_name ?? address,
        provider: "mapbox",
      }
    } else {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
      const res = await fetch(url, {
        headers: {
          "User-Agent": "TamayEnterprisesAttendance/1.0 (internal workforce app)",
          Accept: "application/json",
        },
      })
      if (!res.ok) {
        return json({ error: "Nominatim geocoding failed", detail: await res.text() }, 502)
      }
      const data = await res.json()
      const hit = Array.isArray(data) ? data[0] : null
      if (!hit?.lat || !hit?.lon) {
        return json({ error: "No results for that address" }, 404)
      }
      result = {
        latitude: Number(hit.lat),
        longitude: Number(hit.lon),
        label: hit.display_name ?? address,
        provider: "nominatim",
      }
    }

    return json(result, 200)
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Geocode failed" },
      500,
    )
  }
})

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
