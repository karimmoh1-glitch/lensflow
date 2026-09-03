import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          backgroundColor: "#FAFAF9",
          padding: "80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 40 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 13,
              backgroundColor: "#101114",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
              <path d="M6 24C12 24 12 8 19 8C21.5 8 23.5 10 25 12" stroke="#FAFAF9" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ fontSize: 32, color: "#101114", fontWeight: 700, letterSpacing: "-0.02em", display: "flex" }}>Daythread</div>
        </div>
        <div style={{ fontSize: 88, color: "#101114", fontWeight: 800, lineHeight: 0.98, letterSpacing: "-0.045em", maxWidth: 960, display: "flex", flexDirection: "column" }}>
          <span>All your clients.</span>
          <span>One thread.</span>
        </div>
        <div style={{ fontSize: 28, color: "rgba(16,17,20,0.55)", marginTop: 32, maxWidth: 820, display: "flex" }}>
          Instagram, email, texts, bookings and payments — connected.
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 40 }}>
          {["#F0524D", "#6D5AE6", "#13CC78"].map((c) => (
            <div key={c} style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: c }} />
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
