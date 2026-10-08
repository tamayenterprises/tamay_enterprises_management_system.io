import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const authHeader = req.headers.get("Authorization")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!authHeader || !supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: "Auth service is not configured" }, 500)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "Not authenticated" }, 401)

    const { data: actor, error: actorError } = await userClient
      .from("profiles")
      .select("id, organization_id, role, approval_status, is_active")
      .eq("id", userData.user.id)
      .single()
    if (
      actorError ||
      !actor ||
      !["admin", "project_manager"].includes(actor.role) ||
      actor.approval_status !== "approved" ||
      !actor.is_active
    ) {
      return json({ error: "Only approved management can lock or restore login access" }, 403)
    }

    const body = await req.json()
    const workerId = String(body.workerId ?? "")
    const action = String(body.action ?? "")
    if (!workerId || (action !== "lock" && action !== "unlock")) {
      return json({ error: "workerId and action (lock or unlock) are required" }, 400)
    }
    if (action === "lock" && workerId === actor.id) {
      return json({ error: "You cannot lock your own login" }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: worker, error: workerError } = await admin
      .from("profiles")
      .select("id, organization_id")
      .eq("id", workerId)
      .single()
    if (workerError || !worker || worker.organization_id !== actor.organization_id) {
      return json({ error: "Worker is not in your organization" }, 400)
    }

    const { error: banError } = await admin.auth.admin.updateUserById(workerId, {
      ban_duration: action === "lock" ? "876000h" : "none",
    })
    if (banError) return json({ error: banError.message }, 500)

    if (action === "lock") {
      await admin.auth.admin.signOut(workerId).catch(() => undefined)
    }

    return json({ ok: true, action }, 200)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to update login access" }, 500)
  }
})

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
