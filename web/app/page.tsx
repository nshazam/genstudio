import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 480, margin: "80px auto", fontFamily: "system-ui" }}>
      <h1>GenStudio</h1>
      <p>Generate images, video, and speech. Pay with credits.</p>
      <p style={{ display: "flex", gap: 16 }}>
        <Link href="/signin">Sign in</Link>
        <Link href="/generate">Generate</Link>
        <Link href="/billing">Buy credits</Link>
      </p>
    </main>
  );
}
