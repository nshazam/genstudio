"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const PACKS = [
  { pack: "100", label: "100 credits", price: "$10" },
  { pack: "500", label: "550 credits", price: "$50", note: "10% bonus" },
  { pack: "2000", label: "2400 credits", price: "$200", note: "20% bonus" },
];

export default function Billing() {
  const [credits, setCredits] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return setMsg("sign in first");
    const { data } = await supabase.from("profiles").select("credits").single();
    setCredits(data?.credits ?? 0);
  }
  useEffect(() => { load(); }, []);

  async function buy(pack: string) {
    const { data: s } = await supabase.auth.getSession();
    const t = s.session?.access_token;
    if (!t) return setMsg("sign in first");
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ pack }),
    });
    const j = await res.json();
    if (j.url) window.location.href = j.url; else setMsg(j.error ?? "error");
  }

  return (
    <main style={{ maxWidth: 480, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>Billing</h1>
      <p>Balance: <b>{credits ?? "…"}</b> credits</p>
      <div style={{ display: "grid", gap: 12 }}>
        {PACKS.map((p) => (
          <button key={p.pack} onClick={() => buy(p.pack)}
            style={{ padding: 16, textAlign: "left", border: "1px solid #ccc", borderRadius: 8 }}>
            <b>{p.label}</b> — {p.price} {p.note && <span style={{ color: "#080" }}>({p.note})</span>}
          </button>
        ))}
      </div>
      <p>{msg}</p>
      <p><a href="/generate">← back to generate</a></p>
    </main>
  );
}
