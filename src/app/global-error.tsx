"use client";

/**
 * The last resort: when the root layout itself fails, Next renders this instead of a
 * blank page. It carries its own <html> because the layout is gone. Nothing about the
 * error is shown beyond a reference the founder can look up.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf8f5", color: "#1a1714" }}>
        <main style={{ maxWidth: 480, margin: "20vh auto", padding: "0 24px" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Daythread hit a problem loading this page.</h1>
          <p style={{ color: "#5c5650", lineHeight: 1.5 }}>Nothing you did was lost. Reloading usually fixes it. If it keeps happening, write to support@daythread.org{error?.digest ? ` and mention ${error.digest}` : ""}.</p>
          <button type="button" onClick={() => reset()} style={{ marginTop: 16, padding: "10px 18px", borderRadius: 999, border: 0, background: "#c8443f", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
