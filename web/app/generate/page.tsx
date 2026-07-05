"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Modality = "image" | "video" | "voice";

// Minimal demo UI: pick modality, type prompt, submit, poll, render result.
export default function Generate() {
  const [modality, setModality] = useState<Modality>("image");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState<string | null>(null);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  }

  async function run() {
    setUrl(null);
    setStatus("generating… (first run wakes the GPU, ~30-90s)");
    const t = await token();
    if (!t) return setStatus("sign in first");

    // Synchronous: the API holds the request until the worker returns the URL.
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ modality, prompt, params: {} }),
    });
    const j = await res.json();
    if (!res.ok) return setStatus(`error: ${j.error}`);
    setUrl(j.output_url);
    setStatus("done");
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>GenStudio</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["image", "video", "voice"] as Modality[]).map((m) => (
          <button key={m} onClick={() => setModality(m)}
            style={{ fontWeight: modality === m ? 700 : 400 }}>{m}</button>
        ))}
      </div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
        placeholder={modality === "voice" ? "text to speak" : "describe the scene"}
        rows={4} style={{ width: "100%", padding: 8 }} />
      <button onClick={run} disabled={!prompt.trim()} style={{ marginTop: 12 }}>Generate</button>
      <p>{status}</p>
      {url && modality === "image" && <img src={url} alt="" style={{ maxWidth: "100%" }} />}
      {url && modality === "video" && <video src={url} controls style={{ maxWidth: "100%" }} />}
      {url && modality === "voice" && <audio src={url} controls />}
    </main>
  );
}
