import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Named packs -> env Price IDs. Frontend sends { pack: '100'|'500'|'2000' }.
const PRICE: Record<string, string | undefined> = {
  "100": process.env.STRIPE_PRICE_100,
  "500": process.env.STRIPE_PRICE_500,
  "2000": process.env.STRIPE_PRICE_2000,
};

// POST { pack } -> { url }. Creates a Checkout Session tied to the signed-in user.
// The webhook (checkout.session.completed) grants the credits.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "no auth" }, { status: 401 });
  const { data: userRes } = await supabaseAdmin.auth.getUser(token);
  const user = userRes?.user;
  if (!user) return NextResponse.json({ error: "bad token" }, { status: 401 });

  const { pack } = await req.json();
  const price = PRICE[pack];
  if (!price) return NextResponse.json({ error: "bad pack" }, { status: 400 });

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,      // webhook reads this to grant credits
    metadata: { user_id: user.id },
    success_url: `${origin}/billing?ok=1`,
    cancel_url: `${origin}/billing?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
