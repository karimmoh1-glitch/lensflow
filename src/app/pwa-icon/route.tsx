import { ImageResponse } from "next/og";

export const runtime = "edge";

/** 512px maskable icon for the web app manifest (Android install prompt, splash). */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#101114" }}>
        <svg width="320" height="320" viewBox="0 0 32 32" fill="none">
          <path d="M6 24C12 24 12 8 19 8C21.5 8 23.5 10 25 12" stroke="#FAFAF9" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
