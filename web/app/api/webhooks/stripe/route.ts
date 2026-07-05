import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Map Stripe Price IDs -> credits granted. Set these to your real Price IDs.
const CREDIT_PACKS: Record<string, number> = {
  [process.env.STRIPE_PRICE_100!]: 100,
  [process.env.STRIPE_PRICE_500!]: 550,   // 10% bonus
  [process.env.STRIPE_PRICE_2000!]: 2400, // 20% bonus
};

// Stripe needs the RAW body to verify the signature. Do not JSON.parse first.
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature")!;
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e) {
    return NextResponse.json({ error: `sig: ${e}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const userId = s.client_reference_id || s.metadata?.user_id;
    const line = await stripe.checkout.sessions.listLineItems(s.id, { limit: 1 });
    const priceId = line.data[0]?.price?.id;
    const credits = priceId ? CREDIT_PACKS[priceId] : undefined;
    if (userId && credits) {
      await supabaseAdmin.rpc("add_credits", { p_user: userId, p_amount: credits, p_reason: "purchase" });
    }
  }
  return NextResponse.json({ received: true });
}
