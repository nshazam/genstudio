import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { callWorker } from "@/lib/worker";
import { putObject } from "@/lib/storage";
import { COST, isModality } from "@/lib/pricing";

export const runtime = "nodejs";
// Video gen can take 1-2 min. Vercel: Hobby caps at 60s (video WILL time out there),
// Pro allows up to 300s. Raise your plan or split video onto a queue if you hit this.
export const maxDuration = 300;

// POST { modality, prompt, params } -> { output_url }
// Synchronous: spend credits -> call Cloud Run worker -> store output -> return URL.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "no auth" }, { status: 401 });
  const { data: userRes } = await supabaseAdmin.auth.getUser(token);
  const user = userRes?.user;
  if (!user) return NextResponse.json({ error: "bad token" }, { status: 401 });

  const { modality, prompt, params } = await req.json();
  if (!isModality(modality) || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  }
  const cost = COST[modality];

  const { data: job } = await supabaseAdmin
    .from("jobs")
    .insert({ user_id: user.id, modality, prompt, params: params ?? {}, cost, status: "running" })
    .select("id").single();
  if (!job) return NextResponse.json({ error: "job create failed" }, { status: 500 });

  // Atomic spend; refuse if insufficient.
  const { error: sErr } = await supabaseAdmin.rpc("spend_credits", {
    p_user: user.id, p_cost: cost, p_job: job.id, p_reason: `gen:${modality}`,
  });
  if (sErr) {
    await supabaseAdmin.from("jobs").update({ status: "error", error: "insufficient_credits" }).eq("id", job.id);
    return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
  }

  try {
    const out = await callWorker({ modality, prompt, params: params ?? {} });
    const bytes = Buffer.from(out.b64, "base64");
    const url = await putObject(`${user.id}/${job.id}.${out.ext}`, bytes, out.ext);
    await supabaseAdmin.from("jobs").update({ status: "done", output_url: url }).eq("id", job.id);
    return NextResponse.json({ output_url: url });
  } catch (e) {
    // Refund on any worker/storage failure.
    await supabaseAdmin.rpc("add_credits", { p_user: user.id, p_amount: cost, p_reason: "refund" });
    await supabaseAdmin.from("jobs").update({ status: "error", error: String(e) }).eq("id", job.id);
    return NextResponse.json({ error: "generation failed" }, { status: 502 });
  }
}
