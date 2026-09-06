import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon on iPhone (Add to Home Screen) — the same mark as the favicon, at size. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#101114" }}>
        <svg width="120" height="120" viewBox="0 0 32 32" fill="none">
          <path d="M6 24C12 24 12 8 19 8C21.5 8 23.5 10 25 12" stroke="#FAFAF9" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
