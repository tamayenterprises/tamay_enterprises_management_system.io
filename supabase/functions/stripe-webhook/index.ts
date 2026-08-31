import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const toleranceSeconds = 300

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })
  const signature = req.headers.get("Stripe-Signature")
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!signature || !secret || !supabaseUrl || !serviceKey) return new Response("Webhook is not configured", { status: 500 })

  const payload = await req.text()
  if (!(await verifySignature(payload, signature, secret))) return new Response("Invalid signature", { status: 400 })

  try {
    const event = JSON.parse(payload)
    const object = event?.data?.object
    const paymentId = object?.metadata?.payment_id
    if (!paymentId) return new Response(JSON.stringify({ received: true }), { status: 200 })

    const admin = createClient(supabaseUrl, serviceKey)
    if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
      await admin.from("payments").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        stripe_checkout_session_id: object.id,
      }).eq("id", paymentId).neq("status", "paid")
    } else if (event.type === "checkout.session.expired") {
      await admin.from("payments").update({ status: "expired", expires_at: new Date().toISOString() }).eq("id", paymentId).eq("status", "pending")
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Webhook processing failed", { status: 500 })
  }
})

async function verifySignature(payload: string, header: string, secret: string) {
  const values = Object.fromEntries(header.split(",").map((part) => part.split("=", 2)))
  const timestamp = Number(values.t)
  const signature = values.v1
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`))
  const expected = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
  return timingSafeEqual(expected, signature)
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}
