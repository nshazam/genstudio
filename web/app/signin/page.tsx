"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Email + password auth. Supabase auto-creates the profile row (schema.sql trigger).
export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState("");

  async function submit() {
    setMsg("…");
    const fn = mode === "in" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email, password: pw });
    if (error) return setMsg(error.message);
    if (mode === "up") return setMsg("Account made. If email confirmation is on, check inbox, then sign in.");
    router.push("/generate");
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui" }}>
      <h1>GenStudio — {mode === "in" ? "Sign in" : "Sign up"}</h1>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", width: "100%", padding: 8, marginBottom: 8 }} />
      <input placeholder="password" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        style={{ display: "block", width: "100%", padding: 8, marginBottom: 8 }} />
      <button onClick={submit} style={{ width: "100%", padding: 8 }}>
        {mode === "in" ? "Sign in" : "Create account"}
      </button>
      <p style={{ cursor: "pointer", color: "#06f" }} onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </p>
      <p>{msg}</p>
    </main>
  );
}
