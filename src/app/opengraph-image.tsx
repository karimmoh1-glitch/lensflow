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
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 40 }}>
          <div style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: "#C75A32", display: "flex" }} />
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
