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
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")
    if (!authHeader || !supabaseUrl || !anonKey || !serviceKey || !stripeSecret) {
      return json({ error: "Payment service is not configured" }, 500)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "Not authenticated" }, 401)

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("id, organization_id, role, approval_status, is_active")
      .eq("id", userData.user.id)
      .single()
    if (profileError || !profile || !["admin", "project_manager"].includes(profile.role) || profile.approval_status !== "approved" || !profile.is_active) {
      return json({ error: "Only approved management can create payment links" }, 403)
    }

    const body = await req.json()
    const projectId = String(body.projectId ?? "")
    const recipientId = String(body.recipientId || profile.id)
    const amountCents = Number(body.amountCents)
    const description = String(body.description ?? "").trim()
    const payerEmail = body.payerEmail ? String(body.payerEmail).trim() : null
    if (!projectId || !recipientId || !Number.isInteger(amountCents) || amountCents < 50 || amountCents > 99999999 || !description || description.length > 500) {
      return json({ error: "Project, description, and an amount of at least $0.50 are required" }, 400)
    }
    if (payerEmail && !/^\S+@\S+\.\S+$/.test(payerEmail)) return json({ error: "Enter a valid payer email" }, 400)

    const admin = createClient(supabaseUrl, serviceKey)
    const [{ data: project }, { data: recipient }] = await Promise.all([
      admin.from("projects").select("id, name, organization_id").eq("id", projectId).single(),
      admin.from("profiles").select("id, organization_id").eq("id", recipientId).single(),
    ])
    if (!project || !recipient || project.organization_id !== profile.organization_id || recipient.organization_id !== profile.organization_id) {
      return json({ error: "Project or recipient is not in your organization" }, 400)
    }

    const { data: payment, error: insertError } = await admin
      .from("payments")
      .insert({
        organization_id: profile.organization_id,
        project_id: projectId,
        recipient_id: recipientId,
        created_by: userData.user.id,
        payer_email: payerEmail,
        amount_cents: amountCents,
        currency: "usd",
        description,
      })
      .select("*, project:projects(*), recipient:profiles!recipient_id(*)")
      .single()
    if (insertError || !payment) return json({ error: insertError?.message ?? "Could not create payment" }, 500)

    const stripeBody = new URLSearchParams()
    stripeBody.set("line_items[0][price_data][currency]", "usd")
    stripeBody.set("line_items[0][price_data][product_data][name]", description)
    stripeBody.set("line_items[0][price_data][unit_amount]", String(amountCents))
    stripeBody.set("line_items[0][quantity]", "1")
    stripeBody.set("metadata[payment_id]", payment.id)
    stripeBody.set("payment_intent_data[metadata][payment_id]", payment.id)
    stripeBody.set("restrictions[completed_sessions][limit]", "1")
    stripeBody.set("after_completion[type]", "hosted_confirmation")
    if (payerEmail) stripeBody.set("metadata[payer_email]", payerEmail)

    const stripeResponse = await fetch("https://api.stripe.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: stripeBody,
    })
    const stripeData = await stripeResponse.json()
    if (!stripeResponse.ok) {
      await admin.from("payments").delete().eq("id", payment.id)
      return json({ error: stripeData?.error?.message ?? "Stripe could not create the payment link" }, 502)
    }

    const { data: updated, error: updateError } = await admin
      .from("payments")
      .update({ stripe_payment_link_id: stripeData.id, payment_link_url: stripeData.url })
      .eq("id", payment.id)
      .select("*, project:projects(*), recipient:profiles!recipient_id(*)")
      .single()
    if (updateError || !updated) return json({ error: "Payment was created but could not be finalized" }, 500)
    return json({ payment: updated }, 200)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Payment link creation failed" }, 500)
  }
})

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
