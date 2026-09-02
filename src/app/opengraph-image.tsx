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
          <div style={{ fontSize: 32, color: "#101114", fontWeight: 600, letterSpacing: "-0.01em", display: "flex" }}>Daythread</div>
        </div>
        <div style={{ fontSize: 64, color: "#101114", fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.02em", maxWidth: 920, display: "flex" }}>
          Turn every message into an organized business.
        </div>
        <div style={{ fontSize: 26, color: "rgba(16,17,20,0.55)", marginTop: 28, maxWidth: 780, display: "flex" }}>
          Leads, bookings, payments, and follow-ups — all in one place.
        </div>
      </div>
    ),
    { ...size }
  );
}
