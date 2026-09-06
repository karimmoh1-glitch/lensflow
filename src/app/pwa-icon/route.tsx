import { ImageResponse } from "next/og";

export const runtime = "edge";

/** 512px maskable icon for the web app manifest (Android install prompt, splash). */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#101114" }}>
        <svg width="320" height="320" viewBox="0 0 32 32" fill="none">
          <g stroke="#FAFAF9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8.5C11 8.5 12.5 16 18 16" /><path d="M5 16H18" /><path d="M5 23.5C11 23.5 12.5 16 18 16" /></g>
          <circle cx="24.5" cy="16" r="3.5" fill="#F0524D" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
