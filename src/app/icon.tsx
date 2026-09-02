import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #C75A32 0%, #E8A33D 100%)",
          borderRadius: 7,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <path d="M8 24C12.5 24 12.5 16 16 16C19.5 16 19.5 8 24 8" stroke="#FAFAF9" strokeWidth="3" strokeLinecap="round" />
          <circle cx="8" cy="24" r="2.2" fill="#FAFAF9" />
          <circle cx="24" cy="8" r="2.2" fill="#FAFAF9" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
